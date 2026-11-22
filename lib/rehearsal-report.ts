import { makeDayCard, type DayCard, type DayStatus } from './day-attendance';

type ReportSchedule = { castId: string; status: DayStatus; availableFrom: string | null; availableTo: string | null; memo: string | null };
export type ReportRehearsal = {
  performance: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  memo: string | null;
  casts: { id: string; name: string; roleName: string }[];
  schedules: ReportSchedule[];
};
type Line = { kind: 'section' | 'name' | 'detail' | 'comment'; text: string; status?: DayStatus };
export type ReportPage = {
  performance: string;
  date: string;
  time: string;
  part: number;
  parts: number;
  lines: Line[];
};

export function japanDay(now: Date, offset = 0) {
  return new Date(now.getTime() + (9 + 24 * offset) * 3600000).toISOString().slice(0, 10);
}

export function isEveningDeliveryWindow(now: Date) {
  return new Date(now.getTime() + 9 * 3600000).getUTCHours() === 20;
}

export type DayReport = { version: 2; date: string; cards: DayCard[] };
export type SavedReport = DayReport | ReportPage[];

export function makeDayReport(date: string, rehearsals: ReportRehearsal[]): DayReport {
  const showPerformance = new Set(rehearsals.map(r => r.performance)).size > 1;
  return {
    version: 2,
    date,
    cards: rehearsals.map(({ casts, schedules, ...rehearsal }) => {
      const byCast = new Map(schedules.map(schedule => [schedule.castId, schedule]));
      const { performance, ...details } = rehearsal;
      return makeDayCard(showPerformance ? { ...details, performance } : details, casts, cast => byCast.get(cast.id));
    }),
  };
}
