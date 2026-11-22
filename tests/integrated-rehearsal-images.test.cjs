process.env.SCHEDULE_CRON_OWNER = 'finance';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const userId = 'U' + 'a'.repeat(32);
const groupId = 'C' + 'b'.repeat(32);
const id = '373139de-09b7-47bd-85c7-b3a2a6a59dca';
const settings = { schedulerOwner:'finance', mode: 'TEST', testTargetId: userId, productionTargetId: groupId, rehearsalImageEnabled: false };
const deliveries = new Map();
const pushes = [];
let staff = true;
let rehearsals = [];
let status = 200;
let dateQuery;
const prisma = {
  lineNotificationSetting: { findUnique: async () => settings },
  lineDestination: { findUnique: async ({ where: { id } }) => ({ id, type: id.startsWith('U') ? 'user' : 'group', name: '通知先' }) },
  lineRehearsalDelivery: {
    findUnique: async ({ where: { id } }) => deliveries.get(id),
    upsert: async ({ where: { id }, create }) => {
      if (!deliveries.has(id)) deliveries.set(id, { ...create, createdAt: new Date(), sentAt: null });
      return deliveries.get(id);
    },
    update: async ({ where: { id }, data }) => Object.assign(deliveries.get(id), data),
    deleteMany: async () => {},
  },
  rehearsal: {
    findFirst: async () => rehearsals[0],
    findMany: async ({ where }) => { dateQuery = where.date; return rehearsals; },
  },
};
const originalLoad = Module._load;
Module._load = function (path, ...args) {
  if (path === '@/lib/prisma') return { prisma };
  if (path === '@/lib/auth') return { getSessionUser: async () => staff ? { isActive: true } : null };
  return originalLoad.call(this, path, ...args);
};
const testRoute = require('../app/api/line/rehearsal-test/route.ts');
const imageRoute = require('../app/api/line/rehearsal-image/[id]/route.ts');
const cron = require('../app/api/cron/rehearsal-reminder/route.ts');
const { makeDayReport, japanDay, isEveningDeliveryWindow } = require('../lib/rehearsal-report.ts');
const { rehearsalImageUrl, authorizeRehearsalImage } = require('../lib/rehearsal-image-link.ts');
const { renderDayReportImage } = require('../lib/rehearsal-image.tsx');

Object.assign(process.env, { LINE_CHANNEL_ACCESS_TOKEN: 'stub', SESSION_SECRET: 'test-image-signing', CRON_SECRET: 'test-cron' });
global.fetch = async (url, options) => {
  assert.equal(url, 'https://api.line.me/v2/bot/message/push', 'no external font lookup or real API access');
  pushes.push({ ...JSON.parse(options.body), key: options.headers['X-Line-Retry-Key'] });
  return new Response('', { status });
};

const rehearsal = {
  date: new Date('2026-11-09'), startTime: '18:00', endTime: '21:00', location: '第一稽古場', memo: null,
  performance: { name: '劇団Birth テスト公演', casts: [
    { id: 1n, name: '山田 花子', roleName: '主役' }, { id: 2n, name: '高橋 太郎', roleName: '' },
    { id: 3n, name: '鈴木 一郎', roleName: '' }, { id: 4n, name: '髙橋 桜', roleName: '' },
  ] },
  castSchedules: [
    { castId: 1n, status: 'OK', availableFrom: null, availableTo: null, memo: '予定通り参加します' },
    { castId: 2n, status: 'TIME_LIMITED', availableFrom: '19:00', availableTo: null, memo: '仕事のため' },
    { castId: 3n, status: 'NG', availableFrom: null, availableTo: null, memo: '別件あり' },
  ],
};

test('Japan calendar and 20:00–20:59 send window handle month rollover', () => {
  assert.equal(japanDay(new Date('2026-12-31T11:00:00Z'), 1), '2027-01-01');
  assert.equal(isEveningDeliveryWindow(new Date('2026-11-08T10:59:59Z')), false);
  assert.equal(isEveningDeliveryWindow(new Date('2026-11-08T11:00:00Z')), true);
  assert.equal(isEveningDeliveryWindow(new Date('2026-11-08T11:59:59Z')), true);
  assert.equal(isEveningDeliveryWindow(new Date('2026-11-08T12:00:00Z')), false);
});

test('image URLs expire and reject changes to the delivery, page or size', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const expiry = now + 3600000;
  const url = new URL(rehearsalImageUrl('test', id, 0, 'full', expiry));
  assert.deepEqual(authorizeRehearsalImage('test', id, url.searchParams, now), { index: 0, size: 'full' });
  assert.equal(authorizeRehearsalImage('test', id, url.searchParams, expiry), null);
  assert.equal(authorizeRehearsalImage('test', 'daily-2026-11-09', url.searchParams, now), null);
  for (const [key, value] of [['size', 'preview'], ['page', '1'], ['exp', String(expiry / 1000 + 1)]]) {
    const changed = new URLSearchParams(url.searchParams);
    changed.set(key, value);
    assert.equal(authorizeRehearsalImage('test', id, changed, now), null);
  }
});

test('single full-height report contains every status, comment and same-day rehearsal', async () => {
  const input = {
    ...rehearsal, performance: rehearsal.performance.name, date: '2026-11-09',
    casts: [
      ...rehearsal.performance.casts.map(c => ({ ...c, id: String(c.id) })),
      ...Array.from({ length: 36 }, (_, i) => ({ id: String(i + 5), name: `出演者${i + 5}`, roleName: '' })),
    ],
    schedules: rehearsal.castSchedules.map(s => ({ ...s, castId: String(s.castId) })),
  };
  const report = makeDayReport(input.date, [input, { ...input, startTime: '21:00', endTime: '22:00' }]);
  const first = report.cards[0];
  assert.deepEqual(first.groups.map(g => g.status), ['OK', 'NG', 'TIME_LIMITED', 'UNDECIDED']);
  assert.equal(first.groups[2].rows[0].time, '19:00〜 参加（遅刻）');
  assert.equal(first.groups[0].rows[0].memo, '予定通り参加します');
  assert.equal(first.groups[3].rows.at(-1).name, '出演者40');
  assert.equal(report.cards[1].startTime, '21:00');
  for (const size of ['full', 'preview']) {
    const image = await renderDayReportImage(report, size);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.match(image.headers.get('cache-control'), /no-store/);
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.readUInt32BE(20) > 2000, 'tall report must not be cropped to one of the old pages');
    assert.ok(bytes.length < (size === 'preview' ? 1_000_000 : 10_000_000));
    if (size === 'full' && process.env.BIRTH_TEST_IMAGE) require('node:fs').writeFileSync(process.env.BIRTH_TEST_IMAGE, bytes);
  }
});

test('personal rehearsal test refuses anonymous and group targets, then sends only to the saved personal account', async () => {
  const req = () => new Request('http://localhost', { method: 'POST', body: JSON.stringify({ requestId: id, target: groupId }) });
  staff = false;
  assert.equal((await testRoute.POST(req())).status, 401);
  staff = true;
  settings.testTargetId = groupId;
  assert.equal((await testRoute.POST(req())).status, 400);
  settings.testTargetId = userId;
  assert.equal(pushes.length, 0);
  rehearsals = [rehearsal, { ...rehearsal, startTime: '21:00', endTime: '22:00' }];
  assert.equal((await testRoute.POST(req())).status, 200);
  assert.equal(pushes.at(-1).to, userId);
  assert.equal(pushes.at(-1).messages.length, 2);
  assert.deepEqual(pushes.at(-1).messages[0], { type: 'text', text: '明日の稽古の出欠状況です！' });
  const imageMessage = pushes.at(-1).messages[1];
  assert.equal(imageMessage.type, 'image');
  const context = { params: Promise.resolve({ id }) };
  const valid = await imageRoute.GET(new Request(imageMessage.previewImageUrl), context);
  assert.equal(valid.status, 200);
  assert.equal(Buffer.from(await valid.arrayBuffer()).readUInt32BE(16), 360);
  const invalid = new URL(imageMessage.previewImageUrl);
  invalid.searchParams.delete('sig');
  assert.equal((await imageRoute.GET(new Request(invalid), context)).status, 404);
  assert.equal((await testRoute.POST(req())).status, 200);
  assert.equal(pushes.length, 1);
});

test('evening cron needs authorization and opt-in; sends tomorrow only and retries the same payload without duplicating', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-08T11:15:00Z') });
  const req = new Request('http://localhost', { headers: { authorization: 'Bearer test-cron' } });
  assert.equal((await cron.GET(new Request('http://localhost'))).status, 401);
  const before = pushes.length;
  assert.equal((await (await cron.GET(req)).json()).sent, false);
  settings.rehearsalImageEnabled = true;
  rehearsals = [];
  assert.equal((await (await cron.GET(req)).json()).reason, 'no_rehearsals');
  assert.equal(dateQuery.toISOString(), '2026-11-09T00:00:00.000Z');
  assert.equal(pushes.length, before);
  rehearsals = [rehearsal];
  status = 429;
  const savedError = console.error;
  console.error = () => {};
  try { assert.equal((await cron.GET(req)).status, 502); } finally { console.error = savedError; }
  const attempted = pushes.at(-1);
  assert.equal(attempted.to, groupId);
  status = 200;
  assert.equal((await (await cron.GET(req)).json()).sent, true);
  assert.deepEqual(pushes.at(-1), attempted);
  assert.equal((await (await cron.GET(req)).json()).sent, false);
  assert.equal(pushes.length, before + 2);
});
