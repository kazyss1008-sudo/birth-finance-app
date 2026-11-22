import { z } from 'zod';

const value = z.object({ status: z.string(), availableFrom: z.string().nullable(), availableTo: z.string().nullable(), memo: z.string().nullable() });
export const changePayload = z.object({
  version: z.literal(1), castId: z.string(), rehearsalId: z.string(), performanceId: z.string(),
  castName: z.string(), performanceName: z.string(), date: z.string(), startTime: z.string(), endTime: z.string(),
  before: value, after: value,
});
export function scheduleLabel(v: z.infer<typeof value>) {
  const range = v.status === 'TIME_LIMITED' && (v.availableFrom || v.availableTo) ? ` (${v.availableFrom || ''}〜${v.availableTo || ''})` : '';
  return `${v.status === 'UNDECIDED' ? 'ー 未定' : v.status === 'TIME_LIMITED' ? '時間指定' : v.status}${range}${v.memo ? ` / ${v.memo}` : ''}`;
}
function legacyLabel(label: string) {
  return label.replace(/^(?:TIME_LIMITED|時間指定) \(([^)]*)\)/, (_, range: string) => {
    const time = range.replace(/未指定/g, '');
    return time === '〜' ? '時間指定' : `時間指定 (${time})`;
  }).replace(/^TIME_LIMITED/, '時間指定');
}
type Change = { id: bigint; details: string; payload?: unknown };
type Entry = { key: string; group: string; cast: string; performance: string; date: string; time: string; before: string; after: string; beforeKey: string; afterKey: string; legacyKey: string };
function decode(c: Change): Entry | null {
  const parsed = changePayload.safeParse(c.payload);
  if (parsed.success) {
    const p = parsed.data;
    return { key: `${p.castId}/${p.rehearsalId}`, group: `${p.performanceId}/${p.castId}`, cast: p.castName, performance: p.performanceName,
      date: p.date, time: `${p.startTime}〜${p.endTime}`, before: scheduleLabel(p.before), after: scheduleLabel(p.after),
      beforeKey: JSON.stringify(p.before), afterKey: JSON.stringify(p.after),
      legacyKey: `${p.performanceName} / ${p.castName}\n${p.date} ${p.startTime}〜${p.endTime}` };
  }
  // Compatibility for history written before structured snapshots were introduced.
  const match = /^(.*?) \/ (.*?)\n(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}〜\d{2}:\d{2})\n変更前: ([\s\S]*?)\n変更後: ([\s\S]*)$/.exec(c.details);
  if (!match) return null;
  const [, performance, cast, date, time, oldBefore, oldAfter] = match;
  const before = legacyLabel(oldBefore), after = legacyLabel(oldAfter);
  const legacyKey = `${performance} / ${cast}\n${date} ${time}`;
  return { key: legacyKey, legacyKey, group: `${performance}/${cast}`, cast, performance, date, time, before, after,
    beforeKey: before, afterKey: after };
}

export function summarizeChanges(changes: Change[]) {
  const ordered = [...changes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const decoded = ordered.map(c => ({ change: c, entry: decode(c) }));
  const aliases = new Map<string, Set<string>>();
  for (const { entry } of decoded) if (entry && entry.key !== entry.legacyKey) {
    const ids = aliases.get(entry.legacyKey) || new Set<string>(); ids.add(entry.key); aliases.set(entry.legacyKey, ids);
  }
  const merged = new Map<string, Entry>();
  const unknown: string[] = [];
  for (const { change, entry } of decoded) {
    if (!entry) { unknown.push(change.details); continue; }
    const candidates = aliases.get(entry.legacyKey);
    const key = entry.key === entry.legacyKey && candidates?.size === 1 ? [...candidates][0] : entry.key;
    const first = merged.get(key);
    // Labels allow legacy and structured records to join across the rollout boundary.
    merged.set(key, first ? { ...entry, key, before: first.before, beforeKey: first.beforeKey } : { ...entry, key });
  }
  const entries = [...merged.values()].filter(e => e.before !== e.after && e.beforeKey !== e.afterKey)
    .sort((a, b) => a.cast.localeCompare(b.cast, 'ja') || a.performance.localeCompare(b.performance, 'ja') || a.group.localeCompare(b.group) || a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  let group = '';
  const lines: string[] = [];
  for (const e of entries) {
    if (e.group !== group) { lines.push(`【${e.cast}】${e.performance}`); group = e.group; }
    lines.push(`${e.date} ${e.time}\n${e.before} → ${e.after}`);
  }
  if (unknown.length) lines.push('【過去の変更】', ...unknown);
  return { count: entries.length + unknown.length, text: lines.join('\n\n') };
}
