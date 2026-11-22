import React from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import coverage from '../assets/fonts/noto-jp-coverage.json';
import { DAY_SECTIONS } from './day-attendance';
import type { DayReport, ReportPage } from './rehearsal-report';
import { dayCardImageHeight, RehearsalDayCard } from '../components/RehearsalDayCard';

const dayLabel = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
});

let fontData: Promise<Buffer> | undefined;
let boldFontData: Promise<Buffer> | undefined;

// Keep rendering self-contained: unknown characters must not trigger remote font lookups.
function localText(value: string) {
  return Array.from(value.normalize('NFC'), char => {
    if (/\p{Cc}|\p{Cf}|[\uFE0E\uFE0F]/u.test(char)) return '';
    const code = char.codePointAt(0)!;
    if (/\p{Extended_Pictographic}/u.test(char) || !coverage.some(([from, to]) => from <= code && code <= to)) return '□';
    return char;
  }).join('');
}

function getFont() {
  fontData ??= readFile(join(process.cwd(), 'assets/fonts/NotoSansJP-Regular.ttf')).catch(err => {
    fontData = undefined;
    throw err;
  });
  return fontData;
}

export async function renderRehearsalImage(page: ReportPage, size: 'full' | 'preview') {
  const font = await getFont();
  const scale = size === 'preview' ? 0.5 : 1;
  const px = (n: number) => n * scale;
  const width = px(720);
  const titleChars = Array.from(localText(page.performance));
  const titleLines = [titleChars.slice(0, 22).join('')];
  if (titleChars.length > 22) titleLines.push(titleChars.slice(22, 44).join('') + (titleChars.length > 44 ? '…' : ''));
  const titleHeight = titleLines.length * 38;
  const height = px(120 + titleHeight + page.lines.length * 35);
  return new ImageResponse(
    <div lang="ja-JP" style={{ display: 'flex', flexDirection: 'column', width, height, padding: px(24), background: '#f7f7ff', color: '#1f2937', fontFamily: 'Noto Sans JP' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#153b96', color: '#fff', height: px(34), padding: `0 ${px(14)}px`, fontSize: px(18) }}>
        <span>劇団Birth　稽古スケジュール</span>
        {page.parts > 1 && <span>{page.part} / {page.parts}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', padding: `${px(6)}px ${px(14)}px`, color: '#153b96' }}>
        {titleLines.map((line, i) => <div key={i} style={{ display: 'flex', height: px(38), alignItems: 'center', fontSize: px(27) }}>{line}</div>)}
        <div style={{ display: 'flex', height: px(26), alignItems: 'center', fontSize: px(21) }}>
          {localText(`${dayLabel.format(new Date(page.date))}　${page.time}`)}
        </div>
      </div>
      {page.lines.map(({ kind, text, status }, i) => {
        const section = DAY_SECTIONS.find(item => item.status === status);
        const hasCommentIcon = kind === 'comment' && text.startsWith('コメント：');
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', height: px(35), padding: `0 ${px(kind === 'detail' || kind === 'comment' ? 25 : 14)}px`,
            background: kind === 'section' ? section?.background ?? '#f4f7ff' : '#fff',
            color: kind === 'section' ? section?.color : kind === 'name' ? '#1f2937' : '#475569',
            fontSize: px(kind === 'detail' || kind === 'comment' ? 20 : 22), borderBottom: `${px(1)}px solid #eef2f7`,
          }}>
            {hasCommentIcon && (
              <svg width={px(20)} height={px(20)} viewBox="0 0 24 24" style={{ marginRight: px(6), flexShrink: 0 }}>
                <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" fill="none" stroke="#64748b" strokeWidth="1.5" />
                <path d="M7 11h1m3 0h1m3 0h1" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
            <span>{localText(hasCommentIcon ? text.slice('コメント：'.length) : text)}</span>
          </div>
        );
      })}
    </div>,
    { width, height, fonts: [{ name: 'Noto Sans JP', data: font, weight: 400 }], headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}


export async function renderDayReportImage(report: DayReport, size: 'full' | 'preview') {
  boldFontData ??= readFile(join(process.cwd(), 'assets/fonts/NotoSansJP-Bold.ttf')).catch(err => {
    boldFontData = undefined;
    throw err;
  });
  const [font, bold] = await Promise.all([getFont(), boldFontData]);
  const height = 16 + report.cards.reduce((sum, card) => sum + dayCardImageHeight(card), 0) + (report.cards.length - 1) * 16;
  const maxHeight = size === 'preview' ? 2400 : 10000;
  const maxBytes = size === 'preview' ? 1_000_000 : 10_000_000;
  let scale = Math.min(size === 'preview' ? 1 : 2, maxHeight / height);
  for (;;) {
    const image = new ImageResponse(
      <div lang="ja-JP" style={{ display: 'flex', flexDirection: 'column', gap: 16 * scale, padding: `${8 * scale}px 0`,
        width: '100%', background: '#fff', fontFamily: 'Noto Sans JP' }}>
        {report.cards.map((card, i) => <RehearsalDayCard key={i} card={card} imageScale={scale} sanitize={localText} />)}
      </div>,
      { width: Math.ceil(360 * scale), height: Math.ceil(height * scale), fonts: [
        { name: 'Noto Sans JP', data: font, weight: 400 },
        { name: 'Noto Sans JP', data: bold, weight: 700 },
      ] },
    );
    const png = await image.arrayBuffer();
    if (png.byteLength <= maxBytes) return new Response(png, { headers: {
      'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
    scale *= 0.75;
  }
}
