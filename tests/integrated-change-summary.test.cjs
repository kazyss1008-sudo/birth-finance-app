const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeChanges } = require('../lib/change-summary.ts');
const { scheduleLabel } = require('../lib/change-summary.ts');
const values = status => ({ status, availableFrom: null, availableTo: null, memo: null });
function edit(id, castId, rehearsalId, date, before, after, overrides = {}) {
  return { id: BigInt(id), details: '', payload: { version: 1, castId, rehearsalId, performanceId: '1', castName: `役者${castId}`, performanceName: '公演',
    date, startTime: '18:00', endTime: '21:00', before: values(before), after: values(after), ...overrides } };
}
test('reverted edits vanish; repeated edits summarize first baseline to final result', () => {
  const result = summarizeChanges([
    edit(1, '1', '1', '2026-11-04', 'OK', 'NG'), edit(2, '1', '1', '2026-11-04', 'NG', 'OK'),
    edit(3, '1', '2', '2026-11-05', 'OK', 'NG'), edit(4, '1', '2', '2026-11-05', 'NG', 'TIME_LIMITED', { after: { ...values('TIME_LIMITED'), availableFrom: '19:00', memo: '遅れて参加' } }),
  ]);
  assert.equal(result.count, 1);
  assert.doesNotMatch(result.text, /2026-11-04|NG/);
  assert.match(result.text, /OK → 時間指定 \(19:00〜\) \/ 遅れて参加/);
});
test('groups by cast with rehearsals in date order regardless of edit chronology', () => {
  const result = summarizeChanges([
    edit(1, '2', '3', '2026-11-06', 'OK', 'NG'), edit(2, '1', '2', '2026-11-05', 'OK', 'NG'),
    edit(3, '2', '1', '2026-11-04', 'OK', 'NG'), edit(4, '1', '1', '2026-11-04', 'OK', 'NG'),
  ]);
  assert.equal(result.count, 4);
  assert.equal((result.text.match(/【役者1】/g) || []).length, 1);
  assert.match(result.text, /【役者1】公演[\s\S]*2026-11-04[\s\S]*2026-11-05[\s\S]*【役者2】公演[\s\S]*2026-11-04[\s\S]*2026-11-06/);
});
test('memo and time-only changes count; structured identities keep same names separate', () => {
  const result = summarizeChanges([
    edit(1, '1', '1', '2026-11-04', 'OK', 'OK', { after: { ...values('OK'), memo: '追記\n変更後: NG' } }),
    edit(2, '2', '1', '2026-11-04', 'OK', 'NG', { castName: '役者1' }),
  ]);
  assert.equal(result.count, 2);
  assert.match(result.text, /追記/);
});
test('legacy history collapses and joins structured snapshots across rollout', () => {
  const legacy = (id, before, after) => ({ id: BigInt(id), details: `公演 / 役者1\n2026-11-04 18:00〜21:00\n変更前: ${before}\n変更後: ${after}` });
  assert.equal(summarizeChanges([legacy(1, 'OK', 'NG'), legacy(2, 'NG', 'OK')]).count, 0);
  assert.equal(summarizeChanges([legacy(1, 'OK', 'NG'), edit(2, '1', '1', '2026-11-04', 'NG', 'OK')]).count, 0);
  const result = summarizeChanges([legacy(1, 'OK', 'NG'), edit(2, '1', '1', '2026-11-04', 'NG', 'TIME_LIMITED')]);
  assert.equal(result.count, 1);
  assert.match(result.text, /OK → 時間指定/);
});
test('open time ranges omit unspecified ends in both new and historical notifications', () => {
  assert.equal(scheduleLabel(values('UNDECIDED')), 'ー 未定');
  assert.equal(scheduleLabel({ ...values('TIME_LIMITED'), availableTo: '18:00' }), '時間指定 (〜18:00)');
  assert.equal(scheduleLabel({ ...values('TIME_LIMITED'), availableFrom: '18:00' }), '時間指定 (18:00〜)');
  assert.equal(scheduleLabel(values('TIME_LIMITED')), '時間指定');
  const summary = summarizeChanges([{ id: 1n, details: '公演 / 役者1\n2026-11-04 18:00〜21:00\n変更前: OK\n変更後: TIME_LIMITED (未指定〜18:00) / メモは未指定' }]);
  assert.match(summary.text, /時間指定 \(〜18:00\) \/ メモは未指定/);
});
