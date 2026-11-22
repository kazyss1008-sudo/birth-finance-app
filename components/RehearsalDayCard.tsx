import React from 'react';
import { DAY_SECTIONS, type DayCard } from '../lib/day-attendance';

const week = ['日', '月', '火', '水', '木', '金', '土'];
const padding = 16;

function dateLabel(date: string) {
  const day = new Date(date + 'T00:00:00Z');
  return `${day.getUTCMonth() + 1}月${day.getUTCDate()}日(${week[day.getUTCDay()]})`;
}

// Conservative line lengths keep full-width Japanese text inside a 360px capture.
function wrap(value: string, length: number) {
  return value.split(/\r?\n/).flatMap(line => {
    const chars = Array.from(line);
    return chars.length ? Array.from({ length: Math.ceil(chars.length / length) }, (_, i) => chars.slice(i * length, (i + 1) * length).join('')) : [''];
  });
}

type DayRow = DayCard['groups'][number]['rows'][number];

function fitsOnOneLine(row: DayRow) {
  const width = (value: string, size: number) =>
    Array.from(value).reduce((sum, ch) => sum + (/^[ -~]$/.test(ch) ? size * 0.65 : size), 0);
  return !/[\r\n]/.test(row.name + row.role + row.time)
    && width(row.name, 16) + (row.role ? width(row.role, 12) + 6 : 0)
      + (row.time ? width(row.time, 11) + 22 : 0) <= 310;
}

export function dayCardImageHeight(card: DayCard) {
  let height = padding * 2 + 2 + 26 + 12;
  if (card.performance) height += wrap(card.performance, 22).length * 22 + 4;
  if (card.location) height += wrap(card.location, 24).length * 18 + 10;
  if (card.memo) height += wrap(card.memo, 26).length * 18 + 6;
  for (const [index, group] of card.groups.entries()) {
    if (index) height += 12;
    height += 20 + 8;
    if (!group.rows.length && group.status !== 'OK') height += 18;
    for (const row of group.rows) {
      const inline = fitsOnOneLine(row);
      height += 9 + (inline ? 22 : wrap(row.name, 20).length * 22);
      if (row.role && !inline) height += wrap(row.role, 26).length * 18;
      if (row.time && !inline) height += wrap(row.time, 24).length * 17 + 4;
      if (row.memo) height += wrap(row.memo, 26).length * 17 + 2;
    }
  }
  return height;
}

export function RehearsalDayCard({ card, imageScale, sanitize = s => s }: {
  card: DayCard; imageScale?: number; sanitize?: (s: string) => string;
}) {
  const image = imageScale !== undefined;
  const px = (n: number) => n * (imageScale ?? 1);
  const line = (value: string, width: number, font: number, height: number) => image
    ? wrap(value, width).map((text, i) => (
      <div key={i} style={{ display: 'flex', height: px(height), alignItems: 'center', fontSize: px(font) }}>{sanitize(text) || '　'}</div>
    ))
    : <span style={{ fontSize: font, lineHeight: `${height}px`, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</span>;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', padding: px(padding), border: `${px(1)}px solid #eef2f7`,
      borderRadius: px(16), background: '#fff', color: '#1f2937', width: '100%',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: px(12), color: '#153b96' }}>
        {card.performance && <div style={{ display: 'flex', flexDirection: 'column', marginBottom: px(4) }}>{line(card.performance, 22, 14, 22)}</div>}
        <div style={{ display: 'flex', alignItems: 'center', minHeight: px(26), fontSize: px(18), fontWeight: 700 }}>
          {sanitize(`${dateLabel(card.date)} ${card.startTime}〜${card.endTime}`)}
        </div>
        {card.location && (
          <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', borderRadius: px(12), marginTop: px(4), padding: `${px(3)}px ${px(10)}px`, background: '#edf2ff', fontWeight: 700 }}>
            {line(card.location, 24, 12, 18)}
          </div>
        )}
        {card.memo && <div style={{ display: 'flex', flexDirection: 'column', marginTop: px(6), color: '#64748b' }}>{line(card.memo, 26, 12, 18)}</div>}
      </div>
      <div className={image ? undefined : 'day-attendance-groups'} style={{ display: 'flex', ...(image ? { flexDirection: 'column' as const } : {}), gap: px(12) }}>
        {card.groups.map(({ status, rows }) => {
          const section = DAY_SECTIONS.find(s => s.status === status)!;
          return (
            <div key={status} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', height: px(20), alignItems: 'center', marginBottom: px(8), color: section.color, fontSize: px(14), fontWeight: 700 }}>
                {sanitize(`${section.label} (${rows.length}名)`)}
              </div>
              {rows.length === 0 && status !== 'OK' && <div style={{ display: 'flex', height: px(18), color: '#64748b', fontSize: px(12) }}>なし</div>}
              {rows.map((row, index) => {
                const stack = image && !fitsOnOneLine(row);
                const title = image && !stack
                  ? <span style={{ fontSize: px(16), lineHeight: `${px(22)}px` }}>{sanitize(row.name)}</span>
                  : line(row.name, 20, 16, 22);
                return (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', padding: `${px(4)}px 0`, borderBottom: `${px(1)}px solid #f0f0f0` }}>
                  <div style={{ display: 'flex', flexDirection: stack ? 'column' : 'row', alignItems: stack ? 'stretch' : 'center', gap: stack ? 0 : px(6), flexWrap: image ? 'nowrap' : 'wrap', fontWeight: status === 'UNDECIDED' ? 400 : 700 }}>
                    {title}
                    {row.role && (
                      <div style={{ display: 'flex', flexDirection: 'column', color: '#64748b', fontWeight: 400 }}>
                        {image && !stack ? <span style={{ fontSize: px(12) }}>{sanitize(row.role)}</span> : line(row.role, 26, 12, 18)}
                      </div>
                    )}
                    {row.time && <div style={{ display: 'flex', flexDirection: 'column', alignSelf: stack ? 'flex-start' : 'center', marginTop: stack ? px(2) : 0, padding: `${px(1)}px ${px(8)}px`, borderRadius: px(10), background: '#fef3c7', color: '#92400e' }}>
                      {image && !stack ? <span style={{ fontSize: px(11), lineHeight: `${px(17)}px` }}>{sanitize(row.time)}</span> : line(row.time, 24, 11, 17)}
                    </div>}
                  </div>
                  {row.memo && (
                    <div style={{ display: 'flex', marginTop: px(2), paddingLeft: px(4), color: '#64748b', alignItems: 'flex-start' }}>
                      <svg width={px(12)} height={px(12)} viewBox="0 0 24 24" style={{ marginRight: px(4), marginTop: px(2), flexShrink: 0 }} aria-hidden="true">
                        <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="#64748b" strokeWidth="1.5" />
                        <path d="M7 11h1m3 0h1m3 0h1" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{line(row.memo, 26, 11, 17)}</div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
