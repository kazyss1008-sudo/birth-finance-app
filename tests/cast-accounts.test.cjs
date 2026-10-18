const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const state = { user: null, updates: [] };
const cast = { id: 1n, email: 'cast@example.com', schedulePasswordHash: 'stored-hash' };
const prisma = {
  cast: { findMany: async () => state.casts || [{ ...cast, name: 'キャスト' }], findFirst: async () => cast, update: async args => { state.updates.push(args); } },
  $queryRaw: async () => [], $transaction: async fn => fn(prisma),
};
Module._load = function(id, ...args) {
  if (id === '@/lib/prisma') return { prisma };
  if (id === '@/lib/auth') return { getSessionUser: async () => state.user };
  if (id === '@/lib/mail') return { sendMail: async to => { state.sent.push(to); if (to === 'fail@example.com') throw Error('test failure'); } };
  return originalLoad.call(this, id, ...args);
};
const route = require('../app/api/performances/[id]/cast-accounts/route.ts');
const bcrypt = require('bcryptjs');
const context = { params: Promise.resolve({ id: '10' }) };
const req = rows => new Request('http://localhost', { method: 'PUT', body: JSON.stringify(rows) });
test('account management requires an active administrator session', async () => {
  assert.equal((await route.GET(req([]), context)).status, 401);
  assert.equal((await route.PUT(req([]), context)).status, 401);
  state.user = { isActive: true };
});
test('account listing exposes registration state, never password hashes', async () => {
  const response = await route.GET(req([]), context);
  const rows = await response.json();
  assert.equal(rows[0].hasPassword, true);
  assert.equal(rows[0].schedulePasswordHash, undefined);
});
test('invalid input prevents all writes; blank password retains existing credentials', async () => {
  const invalid = [{ castId: '1', email: 'invalid', password: 'short' }];
  assert.equal((await route.PUT(req(invalid), context)).status, 400);
  assert.equal(state.updates.length, 0);
  assert.equal((await route.PUT(req([{ castId: '1', email: 'cast@example.com', password: '' }]), context)).status, 200);
  assert.equal(state.updates[0].data.schedulePasswordHash, undefined);
  assert.equal(state.updates[0].data.scheduleAuthVersion, undefined);
});
test('new password is hashed and invalidates previously issued sessions', async () => {
  const response = await route.PUT(req([{ castId: '1', email: 'new@example.com', password: 'test-password-123' }]), context);
  assert.equal(response.status, 200);
  const data = state.updates.at(-1).data;
  assert.equal(await bcrypt.compare('test-password-123', data.schedulePasswordHash), true);
  assert.deepEqual(data.scheduleAuthVersion, { increment: 1 });
});

test('cast sessions cannot access finance management even if secrets were shared', async () => {
  process.env.SESSION_SECRET = 'test-only';
  const { signSession } = require('../lib/session.ts');
  const { middleware } = require('../middleware.ts');
  const { NextRequest } = require('next/server');
  const token = await signSession('cast:1:0', 100);
  const req = new NextRequest('http://localhost/api/performances', { headers: { cookie: `birth_finance_session=${token}` } });
  assert.equal((await middleware(req)).status, 401);
});
test('invitations require configured mail and report each recipient independently', async () => {
  const invitations = require('../app/api/performances/[id]/cast-invitations/route.ts');
  const body = { castIds: ['1', '2'], requestId: '08fd3338-4082-4a0b-b901-c5262dc4296f' };
  assert.equal((await invitations.POST(req(body), context)).status, 503);
  Object.assign(process.env, { SCHEDULE_APP_URL: 'https://schedule.example.com', RESEND_API_KEY: 'test', MAIL_FROM: 'test@example.com' });
  state.sent = [];
  state.casts = [{ ...cast, name: 'キャスト', performance: { name: '公演' } }, { ...cast, id: 2n, name: '失敗宛先', email: 'fail@example.com', performance: { name: '公演' } }];
  state.casts[1].schedulePasswordHash = null;
  assert.equal((await invitations.POST(req(body), context)).status, 400);
  assert.equal(state.sent.length, 0);
  state.casts[1].schedulePasswordHash = 'hash';
  const response = await invitations.POST(req(body), context);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.results.map(r => r.ok), [true, false]);
});
