export const DAY_SECTIONS = [
  { status: 'OK', label: '○ 参加可能', color: '#059669', background: '#ecfdf5' },
  { status: 'NG', label: '× NG', color: '#dc2626', background: '#fef2f2' },
  { status: 'TIME_LIMITED', label: '△ 時間指定', color: '#92400e', background: '#fffbeb' },
  { status: 'UNDECIDED', label: 'ー 未定', color: '#6b7280', background: '#f3f4f6' },
] as const;

export type DayStatus = typeof DAY_SECTIONS[number]['status'];

export function groupDayAttendance<C extends { id: string }, S extends { status: DayStatus }>(
  casts: C[], lookup: (cast: C) => S | undefined,
) {
  const groups: Record<DayStatus, { cast: C; schedule: S | undefined }[]> = {
    OK: [], NG: [], TIME_LIMITED: [], UNDECIDED: [],
  };
  for (const cast of casts) {
    const schedule = lookup(cast);
    groups[schedule?.status ?? 'UNDECIDED'].push({ cast, schedule });
  }
  return groups;
}

export function dayTimeLabel(schedule?: { availableFrom: string | null; availableTo: string | null }) {
  const { availableFrom: from, availableTo: to } = schedule ?? {};
  if (from && to) return `${from}〜${to}`;
  if (from) return `${from}〜 参加（遅刻）`;
  if (to) return `〜${to} まで（早退）`;
  return '';
}

export type DayCard = {
  performance?: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  memo: string | null;
  groups: { status: DayStatus; rows: { name: string; role: string; time: string; memo: string | null }[] }[];
};

export function makeDayCard<C extends { id: string; name: string; roleName: string }, S extends {
  status: DayStatus; availableFrom: string | null; availableTo: string | null; memo: string | null;
}>(
  rehearsal: Omit<DayCard, 'groups'>, casts: C[], lookup: (cast: C) => S | undefined,
): DayCard {
  const groups = groupDayAttendance(casts, lookup);
  return {
    ...rehearsal,
    groups: DAY_SECTIONS.map(({ status }) => ({
      status,
      rows: groups[status].map(({ cast, schedule }) => ({
        name: cast.name,
        role: status === 'OK' ? cast.roleName : '',
        time: status === 'TIME_LIMITED' ? dayTimeLabel(schedule) : '',
        memo: schedule?.memo ?? null,
      })),
    })),
  };
}
