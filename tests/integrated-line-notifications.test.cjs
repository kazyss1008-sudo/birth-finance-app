const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const Module = require('node:module');
const originalLoad = Module._load;
const userId = 'U' + 'a'.repeat(32), groupId = 'C' + 'b'.repeat(32);
const state = { user: { isActive: true }, targets: [], settings: { mode: 'TEST', testTargetId: userId, productionTargetId: groupId }, requests: [] };
const prisma = {
  scheduleChange: { findMany: async args => { state.changeQuery = args; return (state.changes || []).filter(c => !args.where.id || c.id > args.where.id.gt); } },
  lineTestDigest: {
    findUnique: async args => (state.testDigests || []).find(d => d.id === args.where.id) || null,
    findFirst: async args => (state.testDigests || []).filter(d => d.recipient === args.where.recipient && d.sentAt).sort((a,b) => a.throughId > b.throughId ? -1 : 1)[0] || null,
    upsert: async args => { const found = (state.testDigests || []).find(d => d.id === args.where.id); if (found) return found; state.testDigests ||= []; state.testDigests.push({ ...args.create }); return state.testDigests.at(-1); },
    update: async args => { const d = state.testDigests.find(d => d.id === args.where.id); Object.assign(d, args.data); return d; },
  },
  lineNotificationSetting: { findUnique: async () => state.settings, upsert: async args => { state.settings = args.create; } },
  lineDestination: {
    findUnique: async args => state.targets.find(t => t.id === args.where.id),
    findMany: async () => state.targets,
    upsert: async args => { state.targets.push(args.create); },
  },
};
Module._load = function(id, ...args) {
  if (id === '@/lib/prisma') return { prisma };
  if (id === '@/lib/auth') return { getSessionUser: async () => state.user };
  return originalLoad.call(this, id, ...args);
};
global.fetch = async (url, options) => {
  state.requests.push({ url, options });
  if (url.includes('/summary')) return Response.json({ groupName: '運営グループ' });
  if (url.includes('/profile/')) return state.profileStatus ? new Response('', { status: state.profileStatus }) : Response.json({ displayName: 'テスト個人' });
  return new Response('', { status: state.status || 200, headers: state.headers || {} });
};
const line = require('../lib/line.ts');
const webhook = require('../app/api/line/webhook/route.ts');
const settings = require('../app/api/line/settings/route.ts');
const testRoute = require('../app/api/line/test/route.ts');
Object.assign(process.env, { LINE_CHANNEL_SECRET: 'test-secret', LINE_CHANNEL_ACCESS_TOKEN: 'test-token' });
const request = (body, method = 'POST', headers = {}) => new Request('http://localhost', { method, body: typeof body === 'string' ? body : JSON.stringify(body), headers });
function signed(body) { return request(body, 'POST', { 'x-line-signature': createHmac('sha256', 'test-secret').update(body).digest('base64') }); }

test('LINE signature verifies raw body and rejects altered content', () => {
  const raw = '{"events":[]}';
  const signature = createHmac('sha256', 'test-secret').update(raw).digest('base64');
  assert.equal(line.verifyLineSignature(raw, signature, 'test-secret'), true);
  assert.equal(line.verifyLineSignature(raw + ' ', signature, 'test-secret'), false);
  assert.equal(line.verifyLineSignature(raw, null, 'test-secret'), false);
});
test('webhook registers only explicit signed personal/group commands without selecting recipients', async () => {
  assert.equal((await webhook.POST(request({ events: [] }))).status, 401);
  assert.equal((await webhook.POST(signed('{'))).status, 400);
  assert.equal((await webhook.POST(signed('{"events":[]}'))).status, 200);
  const event = (id, type, text) => ({ type: 'message', source: type === 'user' ? { type, userId: id } : { type, groupId: id }, message: { type: 'text', text } });
  const before = { ...state.settings };
  const events = [event(userId, 'user', '普通の会話'), event(userId, 'user', '通知登録'), event(groupId, 'group', '通知登録')];
  assert.equal((await webhook.POST(signed(JSON.stringify({ events })))).status, 200);
  assert.equal(state.targets.length, 2);
  assert.deepEqual(state.targets.map(t => t.type), ['user', 'group']);
  assert.deepEqual(state.settings, before);
  assert.equal(state.requests.some(r => r.url.includes('/message/push')), false);
});
test('settings require staff auth and enforce personal test/group production separation', async () => {
  state.user = null;
  assert.equal((await settings.GET()).status, 401);
  assert.equal((await testRoute.POST(request({ requestId: '873139de-09b7-47bd-85c7-b3a2a6a59dca' }))).status, 401);
  state.user = { isActive: true };
  assert.equal((await settings.PUT(request({ mode: 'PRODUCTION', testTargetId: groupId, productionTargetId: userId }, 'PUT'))).status, 400);
  const response = await settings.GET();
  const json = await response.json();
  assert.equal(json.connected, true);
  assert.equal(JSON.stringify(json).includes('test-token'), false);
  assert.equal((await settings.PUT(request({ mode: 'TEST', testTargetId: userId, productionTargetId: groupId }, 'PUT'))).status, 200);
});
test('registration failure logs only stage and HTTP status, without credentials or recipient', async () => {
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  state.profileStatus = 401;
  try {
    const body = JSON.stringify({ events: [{ type: 'message', source: { type: 'user', userId }, message: { type: 'text', text: '通知登録' } }] });
    assert.equal((await webhook.POST(signed(body))).status, 500);
    assert.deepEqual(logs, [
      ['LINE destination lookup failed', { status: 401 }],
      ['LINE registration failed', { stage: 'profile_lookup' }],
    ]);
    assert.equal(JSON.stringify(logs).includes(userId), false);
    assert.equal(JSON.stringify(logs).includes('test-token'), false);
  } finally {
    delete state.profileStatus;
    console.error = originalError;
  }
});
test('test send uses only saved personal recipient even in production mode', async () => {
  state.settings.mode = 'PRODUCTION';
  const before = state.requests.length;
  const response = await testRoute.POST(request({ requestId: '873139de-09b7-47bd-85c7-b3a2a6a59dca' }));
  assert.equal(response.status, 200);
  const push = state.requests.slice(before).find(r => r.url.includes('/message/push'));
  assert.equal(JSON.parse(push.options.body).to, userId);
  assert.match(JSON.parse(push.options.body).messages[0].text, /テスト/);
  state.settings.testTargetId = groupId;
  assert.equal((await testRoute.POST(request({ requestId: '873139de-09b7-47bd-85c7-b3a2a6a59dca' }))).status, 400);
});
test('LINE payload respects limits; retries deduplicate and genuine errors stay errors', async () => {
  const messages = line.lineMessages('😀'.repeat(20000));
  assert.ok(messages.length <= 5);
  assert.ok(messages.every(m => m.text.length <= 5000));
  assert.match(messages.at(-1).text, /表示を省略/);
  assert.equal(line.lineRetryKey('same'), line.lineRetryKey('same'));
  assert.match(line.lineRetryKey('same'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  state.status = 409; state.headers = { 'x-line-accepted-request-id': 'accepted' };
  await line.sendLine(groupId, '通知', 'same');
  state.headers = {};
  await assert.rejects(line.sendLine(groupId, '通知', 'same'));
  state.status = 429;
  await assert.rejects(line.sendLine(groupId, '通知', 'same'));
});

const testId = n => `873139de-09b7-47bd-85c7-${String(n).padStart(12, '0')}`;
const actual = n => testRoute.POST(request({ kind: 'CHANGES', requestId: testId(n), target: groupId }));
const edit = (id, before, after) => ({ id: BigInt(id), details: `公演A / キャストA\n2026-11-04 18:00〜21:00\n変更前: ${before}\n変更後: ${after}` });
test('real test advances only personal baseline after success; subsequent sends contain only new differences', async () => {
  state.status = 200; state.headers = {}; state.settings.testTargetId = userId;
  state.settings.mode = 'TEST'; state.testDigests = [];
  state.changes = [edit(1, 'OK', 'NG'), edit(2, 'NG', 'OK')];
  const before = state.requests.length;
  const reverted = await actual(1);
  assert.equal((await reverted.json()).sent, false);
  assert.equal(state.requests.length, before);
  assert.equal(state.testDigests[0].throughId, 2n);
  assert.ok(state.testDigests[0].sentAt);
  state.changes.push(edit(3, 'OK', 'NG'));
  const sent = await actual(2);
  assert.equal((await sent.json()).count, 1);
  assert.deepEqual(state.changeQuery.where, { id: { gt: 2n } });
  const push = state.requests.at(-1);
  assert.equal(JSON.parse(push.options.body).to, userId);
  assert.match(JSON.parse(push.options.body).messages[0].text, /OK → NG/);
  assert.equal(state.changes.some(c => c.notifiedAt), false);
  const after = state.requests.length;
  await actual(2); // Same request is already accepted, no second push.
  assert.equal(state.requests.length, after);
  assert.equal((await (await actual(3)).json()).sent, false);
  state.settings.mode = 'PRODUCTION';
  state.changes.push(edit(4, 'NG', 'OK'));
  await actual(4);
  assert.equal(JSON.parse(state.requests.at(-1).options.body).to, userId);
  assert.match(JSON.parse(state.requests.at(-1).options.body).messages[0].text, /NG → OK/);
});
test('failed real test retains baseline and retries its immutable payload', async () => {
  state.changes.push(edit(5, 'OK', 'NG'));
  state.status = 429;
  assert.equal((await actual(5)).status, 502);
  const failed = state.testDigests.find(d => d.id === testId(5));
  assert.equal(failed.sentAt, undefined);
  const text = failed.text;
  state.changes.push(edit(6, 'NG', 'OK'));
  state.status = 200;
  await actual(5);
  assert.equal(failed.text, text);
  assert.ok(failed.sentAt);
  await actual(6);
  assert.deepEqual(state.changeQuery.where, { id: { gt: 5n } });
});
test('real tests reject anonymous and group targets without sending', async () => {
  const before = state.requests.length;
  state.settings.testTargetId = groupId;
  assert.equal((await actual(7)).status, 400);
  state.settings.testTargetId = userId;
  state.user = null;
  assert.equal((await actual(7)).status, 401);
  state.user = { isActive: true };
  assert.equal(state.requests.length, before);
});
