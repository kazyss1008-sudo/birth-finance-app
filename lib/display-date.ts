const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
export function slashDate(value: string | Date | null | undefined) {
  return (value instanceof Date ? value.toISOString() : value ?? '').slice(0, 10).replaceAll('-', '/');
}
export function showDateTime(value: string | Date | null | undefined, time?: string | null) {
  if (!value) return time ? `${time}〜` : '';
  const date = value instanceof Date ? value : new Date(value.slice(0, 10) + 'T00:00:00Z');
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日(${weekdays[date.getUTCDay()]})${time ? ` ${time}〜` : ''}`;
}
export function performanceSubtitle(p: { status?: string; startDate?: string | Date | null; endDate?: string | Date | null }) {
  const status = ({ PREPARING: '準備中', ACTIVE: '進行中', CLOSED: '終了' } as Record<string, string>)[p.status ?? ''] ?? p.status ?? '';
  return `${status} | ${slashDate(p.startDate)} - ${slashDate(p.endDate)}`;
}
