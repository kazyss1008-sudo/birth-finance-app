// Isolated route tests: no database connection and no outgoing email.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const state = { cookies: new Map(), events: [], saved: [], line: [], changes: [], digest: null };
const cast = { id: 1n, performanceId: 10n, name: '本人', roleName: '役', email: 'cast@example.com', schedulePasswordHash: 'hash', scheduleAuthVersion: 0 };
const prisma = {
  cast: { findUnique: async args => [cast, ...(state.loginCasts || [])].find(c => c.id === args.where.id) || null, findMany: async args => { state.loginQuery = args; return (state.loginCasts || [cast]).filter(c => c.performanceId === args.where.performanceId && (!args.where.id || c.id === args.where.id) && c.email.toLowerCase() === args.where.email.equals).slice(0, args.take); }, findFirst: async args => {
    state.castQuery = args;
    if (args.where.id !== cast.id || args.where.performanceId !== cast.performanceId) return null;
    return args.select ? { performance: { id: 10n, name: '対象公演' } } : cast;
  } },
  performance: { findUnique: async args => { state.performanceQuery = args; return args.where.id === 10n ? { id: 10n, name: '公演' } : null; } },
  rehearsal: { findMany: async () => [{ id: 2n, date: new Date('2026-10-18'), startTime: '12:00', endTime: '18:00', location: '稽古場', memo: '非公開' }], findFirst: async () => state.rehearsal },
  castSchedule: { findMany: async args => { state.scheduleQuery = args; return []; }, findUnique: async () => state.old || null, upsert: async args => { state.saved.push(args); } },
  scheduleChange: { create: async args => { state.events.push(args); }, findMany: async () => state.changes, updateMany: async () => { state.marked = true; } },
  scheduleDigest: { findUnique: async () => state.digest, upsert: async args => (state.digest = args.create), update: async args => { state.digest.sentAt = args.data.sentAt; } },
  lineNotificationSetting: { findUnique: async () => ({ schedulerOwner:state.owner??'finance', mode: state.lineMode || 'PRODUCTION', productionTargetId: 'C' + 'a'.repeat(32) }) },
  lineDestination: { findUnique: async () => ({ type: 'group' }) },
  castLoginAttempt: { upsert: async args => { state.attemptKey = args.where.key; return { count: state.attempts || 11 }; }, deleteMany: async () => {} },
  $queryRaw: async (_query, id) => {
    const actor = [cast, ...(state.loginCasts || [])].find(c => c.id === id);
    return actor ? [{ scheduleAuthVersion: state.lockedVersion ?? actor.scheduleAuthVersion }] : [];
  },
  $transaction: async (fn, options) => {
    state.transactionOptions = options;
    if (state.txError) throw state.txError;
    return Array.isArray(fn) ? Promise.all(fn) : fn(prisma);
  },
};
Module._load = function(id, ...args) {
  if (id === '@/lib/prisma') return { prisma };
  if (id === 'next/headers') return { cookies: async () => ({ get: key => state.cookies.has(key) ? { value: state.cookies.get(key) } : undefined, set: (key, value) => state.cookies.set(key, value), delete: key => state.cookies.delete(key) }) };
  if (id === '@/lib/line') return { sendLine: async (...args) => { if (state.failLine) throw Error('test failure'); state.line.push(args); } };
  return originalLoad.call(this, id, ...args);
};
process.env.SCHEDULE_CRON_OWNER = 'finance';
process.env.SESSION_SECRET = 'test-secret-only-for-isolated-tests';
const { signSession, verifySession } = require('../lib/session.ts');
const { createCastSession } = require('../lib/cast-auth.ts');
const grid = require('../app/api/cast/grid/route.ts');
const schedules = require('../app/api/cast/schedules/route.ts');
const login = require('../app/api/cast/login/route.ts');
const digest = require('../app/api/cron/schedule-digest/route.ts');
const { middleware } = require('../middleware.ts');
const { NextRequest } = require('next/server');
const request = data => new Request('http://localhost/api/cast/schedules', { method: 'POST', body: JSON.stringify(data) });
test('signed sessions reject tampering and expiry', async () => {
  const token = await signSession('cast:1:0', 100);
  assert.equal(await verifySession(token), 'cast:1:0');
  assert.equal(await verifySession(token + 'x'), null);
  assert.equal(await verifySession(await signSession('cast:1:0', -1)), null);
});
test('anonymous access rejected; cast cannot use management APIs', async () => {
  assert.equal((await grid.GET(new Request('http://localhost/api/cast/grid'))).status, 401);
  const token = await signSession('cast:1:0', 100);
  const res = await middleware(new NextRequest('http://localhost/api/users', { headers: { Cookie: `birth_finance_session=${token}; birth_cast_session=${token}` } }));
  assert.equal(res.status, 401);
});
test('own page only; no other casts, credentials, or finance fields', async () => {
  await createCastSession(1n, 0);
  assert.equal((await grid.GET(new Request('http://localhost/api/cast/grid?castId=2&performanceId=10'))).status, 403);
  const res = await grid.GET(new Request('http://localhost/api/cast/grid?castId=1&performanceId=10'));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.casts.length, 1);
  assert.equal(json.casts[0].id, '1');
  assert.equal(json.casts[0].email, undefined);
  assert.equal(json.casts[0].schedulePasswordHash, undefined);
  assert.equal(json.casts[0].normaTicketCount, undefined);
  assert.equal(json.rehearsals[0].memo, undefined);
});
test('credential changes invalidate existing sessions', async () => {
  cast.scheduleAuthVersion++;
  assert.equal((await grid.GET(new Request('http://localhost/api/cast/grid?castId=1&performanceId=10'))).status, 401);
  cast.scheduleAuthVersion--;
});
test('foreign cast and rehearsal writes rejected without changes', async () => {
  assert.equal((await schedules.POST(request({ castId: '2', rehearsalId: '2', status: 'NG' }))).status, 403);
  assert.equal((await schedules.POST(request({ castId: '1', rehearsalId: '99', status: 'NG' }))).status, 404);
  assert.equal(state.saved.length, 0); assert.equal(state.events.length, 0);
});
test('actual changes create immutable notification; unchanged values do not', async () => {
  state.rehearsal = { id: 2n, date: new Date('2026-10-18'), startTime: '12:00', endTime: '18:00', performance: { name: '公演' } };
  assert.equal((await schedules.POST(request({ castId: '1', rehearsalId: '2', status: 'NG' }))).status, 200);
  assert.equal(state.saved.length, 1); assert.equal(state.events.length, 1);
  assert.match(state.events[0].data.details, /変更前: UNDECIDED\n変更後: NG/);
  assert.equal(state.events[0].data.payload.before.status, 'UNDECIDED');
  assert.deepEqual(state.transactionOptions, { maxWait: 10000, timeout: 20000 });
  state.old = { status: 'NG', availableFrom: null, availableTo: null, memo: null };
  await schedules.POST(request({ castId: '1', rehearsalId: '2', status: 'NG' }));
  assert.equal(state.events.length, 1);
  assert.equal((await schedules.POST(request({ castId: '1', rehearsalId: '2', status: 'TIME_LIMITED', availableFrom: '18:00', availableTo: '12:00' }))).status, 400);
});
test('undecided is accepted, clears time fields, and untouched default causes no write or notification', async () => {
  state.old = null;
  const before = state.events.length;
  await schedules.POST(request({ castId: '1', rehearsalId: '2', status: 'UNDECIDED' }));
  assert.equal(state.events.length, before);
  state.old = { status: 'OK', availableFrom: null, availableTo: null, memo: null };
  const response = await schedules.POST(request({ castId: '1', rehearsalId: '2', status: 'UNDECIDED', availableFrom: '18:00', availableTo: '20:00' }));
  assert.equal(response.status, 200);
  assert.equal(state.saved.at(-1).update.status, 'UNDECIDED');
  assert.equal(state.saved.at(-1).update.availableFrom, null);
  assert.equal(state.saved.at(-1).update.availableTo, null);
  assert.equal(state.events.at(-1).data.payload.after.status, 'UNDECIDED');
});
test('persistent login attempt limit returns 429', async () => {
  assert.equal((await login.POST(request({ performanceId: '10', castId: '1', email: 'cast@example.com', password: 'password' }))).status, 429);
});
test('daily digest: authenticated, quiet when empty, retries unchanged payload, once after success', async () => {
  const req = () => new Request('http://localhost/api/cron/schedule-digest', { headers: { authorization: 'Bearer test-cron' } });
  assert.equal((await digest.GET(req())).status, 401);
  Object.assign(process.env, { CRON_SECRET: 'test-cron', LINE_CHANNEL_ACCESS_TOKEN: 'test-token' });
  assert.equal((await digest.GET(req())).status, 200);
  assert.equal(state.line.length, 0);
  state.changes = [{ id: 1n, createdAt: new Date(), details: '変更内容' }];
  state.lineMode = 'TEST';
  assert.equal((await digest.GET(req())).status, 200);
  assert.equal(state.line.length, 0);
  assert.equal(state.digest, null);
  assert.equal(state.marked, undefined);
  state.lineMode = 'PRODUCTION';
  state.failLine = true;
  assert.equal((await digest.GET(req())).status, 500);
  assert.equal(state.marked, undefined);
  const payload = state.digest.text;
  state.failLine = false;
  assert.equal((await digest.GET(req())).status, 200);
  assert.equal(state.line[0][1], payload);
  assert.equal(state.marked, true);
  await digest.GET(req());
  assert.equal(state.line.length, 1);
});

test('email and password login is scoped to the cast URL', async () => {
  const bcrypt = require('bcryptjs');
  state.attempts = 1;
  cast.schedulePasswordHash = await bcrypt.hash('test-login-password', 4);
  const body = { performanceId: '10', castId: '1', email: 'CAST@example.com', password: 'test-login-password' };
  assert.equal((await login.POST(request({ ...body, password: 'incorrect' }))).status, 401);
  assert.equal((await login.POST(request({ ...body, castId: '2' }))).status, 401);
  assert.equal((await login.POST(request(body))).status, 200);
  assert.equal(await verifySession(state.cookies.get('birth_cast_session')), 'cast:1:0');
});

test('daily reverted edits advance production baseline without sending LINE', async () => {
  state.digest = null; state.marked = false;
  state.lineMode = 'PRODUCTION';
  const count = state.line.length;
  state.changes = [
    { id: 20n, details: '公演 / 本人\n2026-11-04 18:00〜21:00\n変更前: OK\n変更後: NG' },
    { id: 21n, details: '公演 / 本人\n2026-11-04 18:00〜21:00\n変更前: NG\n変更後: OK' },
  ];
  const response = await digest.GET(new Request('http://localhost', { headers: { authorization: 'Bearer test-cron' } }));
  assert.equal((await response.json()).sent, false);
  assert.equal(state.line.length, count);
  assert.equal(state.marked, true);
  assert.deepEqual(state.digest.changeIds, ['20', '21']);
  assert.ok(state.digest.sentAt);
});

test('public login information returns the matching performance title only', async () => {
  const info = require('../app/api/cast/login-info/route.ts');
  const response = await info.GET(new Request('http://localhost/api/cast/login-info?performanceId=10&castId=1'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { performance: { id: '10', name: '対象公演' } });
  assert.deepEqual(state.castQuery.select, { performance: { select: { id: true, name: true } } });
  assert.equal((await info.GET(new Request('http://localhost/api/cast/login-info?performanceId=11&castId=1'))).status, 404);
  assert.equal((await info.GET(new Request('http://localhost/api/cast/login-info?performanceId=bad&castId=1'))).status, 400);
});

test('common URL switches to authenticated cast while preserving performance and own-data boundaries', async () => {
  const bcrypt = require('bcryptjs');
  const second = { ...cast, id: 2n, name: '別の本人', email: 'second@example.com', schedulePasswordHash: await bcrypt.hash('second-password', 4) };
  state.loginCasts = [cast, second, { ...second, id: 3n, performanceId: 11n }];
  const body = { performanceId: '10', email: 'SECOND@example.com', password: 'second-password' };
  assert.equal((await login.POST(request(body))).status, 200);
  assert.equal(await verifySession(state.cookies.get('birth_cast_session')), 'cast:2:0');
  const key = state.attemptKey;
  assert.equal(key.includes('second@example.com'), false);
  await login.POST(request({ ...body, castId: '2' }));
  assert.equal(state.attemptKey, key); // Legacy and common URLs share the same limit.
  const response = await grid.GET(new Request('http://localhost/api/cast/grid?performanceId=10'));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.casts.map(c => c.id), ['2']);
  assert.equal(data.casts[0].email, undefined);
  assert.equal(data.casts[0].schedulePasswordHash, undefined);
  assert.equal(state.scheduleQuery.where.castId, 2n);
  assert.equal((await grid.GET(new Request('http://localhost/api/cast/grid?performanceId=10&castId=1'))).status, 403);
  assert.equal((await grid.GET(new Request('http://localhost/api/cast/grid?performanceId=11'))).status, 403);
  assert.equal((await schedules.POST(request({ castId: '1', rehearsalId: '2', status: 'NG' }))).status, 403);
  assert.equal((await schedules.POST(request({ castId: '2', rehearsalId: '2', status: 'NG' }))).status, 200);
  assert.equal(state.saved.at(-1).create.castId, 2n);
  assert.equal((await login.POST(request({ ...body, password: 'wrong' }))).status, 401);
  assert.equal((await login.POST(request({ ...body, performanceId: '12' }))).status, 401);
  assert.equal((await login.POST(request({ ...body, email: 'absent@example.com' }))).status, 401);
  state.loginCasts.push({ ...second, id: 4n });
  assert.equal((await login.POST(request(body))).status, 401); // Ambiguous email never selects an account.
});

test('common login branding is public and exposes only performance id/name', async () => {
  const info = require('../app/api/cast/login-info/route.ts');
  const response = await info.GET(new Request('http://localhost/api/cast/login-info?performanceId=10'));
  assert.deepEqual(await response.json(), { performance: { id: '10', name: '公演' } });
  assert.deepEqual(state.performanceQuery.select, { id: true, name: true });
  assert.equal((await info.GET(new Request('http://localhost/api/cast/login-info?performanceId=99'))).status, 404);
  const allowed = await middleware(new NextRequest('http://localhost/performances/10/cast'));
  assert.equal(allowed.headers.get('x-middleware-next'), '1');
});

test('transaction expiry returns safe JSON error for retry without exposing DB details', async () => {
  state.txError = Object.assign(new Error('private DB details'), { code: 'P2028' });
  const logs = [], original = console.error;
  console.error = (...args) => logs.push(args);
  const before = state.saved.length;
  try {
    const response = await schedules.POST(request({ castId: '2', rehearsalId: '2', status: 'OK' }));
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /再保存/);
    assert.equal(JSON.stringify(body).includes('private'), false);
    assert.deepEqual(logs, [['Cast schedule save failed', { code: 'P2028' }]]);
    assert.equal(state.saved.length, before);
  } finally { delete state.txError; console.error = original; }
});

test('credential change is still rejected after acquiring the cast lock', async () => {
  state.lockedVersion = 99;
  const before = state.saved.length;
  try {
    assert.equal((await schedules.POST(request({ castId: '2', rehearsalId: '2', status: 'OK' }))).status, 401);
    assert.equal(state.saved.length, before);
  } finally { delete state.lockedVersion; }
});

test('finance cron stays dormant unless this deployment is explicitly enabled', async () => {
  delete process.env.SCHEDULE_CRON_OWNER;
  const before=state.line.length;
  const r=await digest.GET(new Request('http://localhost', {headers:{authorization:'Bearer test-cron'}}));
  assert.equal((await r.json()).skipped,true);
  assert.equal(state.line.length,before);
  process.env.SCHEDULE_CRON_OWNER='finance';
});

test('shared DB ownership prevents finance cron while old schedule remains owner',async()=>{
 state.owner='schedule';const before=state.line.length;const r=await digest.GET(new Request('http://localhost',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));assert.equal((await r.json()).skipped,true);assert.equal(state.line.length,before);delete state.owner;
});
