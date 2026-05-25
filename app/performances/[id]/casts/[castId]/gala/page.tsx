import type { Metadata, Viewport } from 'next';
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { calculateTicketBack } from '@/lib/ticketBack';
import { ShareButton } from './ShareButton';

export const dynamic = 'force-dynamic';

// A4縦レイアウト維持のため viewport 固定
export const viewport: Viewport = {
  width: 820,
  initialScale: 1,
};

function formatJpDate(d: Date | null): string {
  if (!d) return '';
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

function yen(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString()}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; castId: string }>;
}): Promise<Metadata> {
  const { id, castId } = await params;
  try {
    const cast = await prisma.cast.findUnique({
      where: { id: BigInt(castId), performanceId: BigInt(id) },
      select: { name: true },
    });
    if (!cast) return { title: 'ギャランティ明細' };
    return { title: `ギャランティ明細_${cast.name}` };
  } catch {
    return { title: 'ギャランティ明細' };
  }
}

export default async function GalaPage({
  params,
}: {
  params: Promise<{ id: string; castId: string }>;
}) {
  const { id, castId } = await params;
  const performanceId = BigInt(id);
  const castIdBig = BigInt(castId);

  const [cast, performance, rules, sales] = await Promise.all([
    prisma.cast.findUnique({ where: { id: castIdBig } }),
    prisma.performance.findUnique({ where: { id: performanceId } }),
    prisma.ticketBackRule.findMany({ where: { performanceId }, orderBy: { stepNo: 'asc' } }),
    prisma.sale.findMany({ where: { performanceId, castId: castIdBig }, orderBy: { visitedAt: 'asc' } }),
  ]);

  if (!cast || !performance) return notFound();
  if (cast.performanceId !== performanceId) return notFound();

  const totalTickets = sales.reduce((sum, s) => sum + s.ticketCount, 0);
  const rulesInput = rules.map(r => ({
    minTicketCount: r.minTicketCount,
    maxTicketCount: r.maxTicketCount,
    backUnitPrice: r.backUnitPrice,
  }));
  const backTotal = cast.isTicketBackTarget ? calculateTicketBack(totalTickets, rulesInput) : 0;
  const remainingNorma = Math.max(cast.normaTicketCount - totalTickets, 0);
  const normaDeduction = remainingNorma * cast.normaUnitPrice;
  const settlementAmount = backTotal - normaDeduction;

  const backBreakdown = rules.map(rule => {
    const max = rule.maxTicketCount ?? totalTickets;
    const applicable = Math.max(Math.min(totalTickets, max) - rule.minTicketCount + 1, 0);
    return {
      stepNo: rule.stepNo,
      minTicketCount: rule.minTicketCount,
      maxTicketCount: rule.maxTicketCount,
      backUnitPrice: rule.backUnitPrice,
      applicableCount: applicable,
      subtotal: applicable * rule.backUnitPrice,
    };
  }).filter(r => r.applicableCount > 0);

  const dateRange = performance.startDate && performance.endDate
    ? performance.startDate.getTime() === performance.endDate.getTime()
      ? formatJpDate(performance.startDate)
      : `${formatJpDate(performance.startDate)} 〜 ${formatJpDate(performance.endDate)}`
    : formatJpDate(performance.startDate) || formatJpDate(performance.endDate) || '';

  const pdfFilename = `ギャランティ明細_${cast.name}_${performance.name}`;

  const css = `
    @page {
      size: A4 portrait;
      margin: 0;
    }
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background: white !important;
      color: black !important;
      font-family: "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif !important;
      font-size: 10.5pt;
      margin: 0;
      padding: 0;
    }
    .toolbar {
      position: sticky;
      top: 0;
      background: #1f2937;
      color: white;
      padding: 8px 16px;
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 13px;
      z-index: 100;
    }
    .toolbar .info { opacity: 0.85; font-size: 12px; }
    .sheet {
      width: 210mm;
      min-height: 297mm;
      box-sizing: border-box;
      padding: 16mm 18mm 14mm 18mm;
      background: white;
      display: flex;
      flex-direction: column;
    }
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1pt solid #333;
      padding-bottom: 8pt;
      margin-bottom: 18pt;
    }
    .header-logo {
      width: 56pt;
      height: 56pt;
      object-fit: contain;
    }
    .header-title {
      font-size: 22pt;
      font-weight: 900;
      letter-spacing: 0.15em;
      color: #000;
    }
    .header-spacer {
      width: 56pt;
    }
    .recipient {
      font-size: 16pt;
      font-weight: 700;
      margin: 14pt 0 10pt;
      padding-bottom: 4pt;
      border-bottom: 0.5pt solid #888;
    }
    .intro {
      font-size: 10pt;
      line-height: 1.6;
      margin-bottom: 14pt;
    }
    .amount-box {
      border: 1.5pt solid #000;
      padding: 10pt 16pt;
      margin: 10pt 0 18pt;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f6f6f6;
    }
    .amount-label {
      font-size: 14pt;
      font-weight: 700;
      letter-spacing: 0.15em;
    }
    .amount-value {
      font-size: 22pt;
      font-weight: 900;
      letter-spacing: 0.05em;
    }
    .section-title {
      font-size: 10.5pt;
      font-weight: 700;
      color: #000;
      margin: 12pt 0 5pt;
      padding-left: 6pt;
      border-left: 3pt solid #333;
    }
    table.detail {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      margin-bottom: 4pt;
    }
    table.detail td {
      padding: 4pt 8pt;
      border-bottom: 0.4pt solid #aaa;
      vertical-align: middle;
    }
    table.detail td.label {
      width: 38%;
      color: #444;
    }
    table.detail td.value {
      text-align: right;
      font-weight: 700;
    }
    table.detail tr.total td {
      border-top: 1pt solid #000;
      border-bottom: 1pt double #000;
      padding-top: 8pt;
      padding-bottom: 8pt;
      font-size: 12pt;
      background: #f6f6f6;
    }
    table.back {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
      margin-bottom: 4pt;
    }
    table.back th, table.back td {
      border: 0.4pt solid #888;
      padding: 4pt 8pt;
    }
    table.back th {
      background: #dcdcdc;
      font-weight: 700;
      text-align: center;
    }
    table.back td.num {
      text-align: right;
    }
    table.back td.center {
      text-align: center;
    }
    .negative {
      color: #000;
    }
    .footer {
      margin-top: auto;
      padding-top: 16pt;
      text-align: right;
      font-size: 9.5pt;
      line-height: 1.6;
      border-top: 0.4pt solid #ccc;
    }
    .footer .issuer-name {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 3pt;
    }
    .footer .issuer-line {
      color: #333;
    }
    @media screen {
      body { padding: 16px; background: #f3f4f6 !important; min-width: 820px; }
      .sheet {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        margin: 0 auto;
      }
    }
    @media print {
      .toolbar { display: none !important; }
      .sheet { box-shadow: none; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="toolbar">
        <ShareButton filename={pdfFilename} />
        <span className="info">{cast.name} 様 / {performance.name}</span>
      </div>
      <div id="pdf-content">
        <div className="sheet">
          <div className="header-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="header-logo" src="/logo.png" alt="" />
            <div className="header-title">ギャランティ明細書</div>
            <div className="header-spacer" />
          </div>

          <div className="recipient">{cast.name} 様</div>

          <div className="intro">
            この度はご出演いただき誠にありがとうございました。<br />
            下記の通り、出演料をお支払いいたします。
          </div>

          <div className="amount-box">
            <div className="amount-label">出 演 料</div>
            <div className="amount-value">{yen(settlementAmount)}</div>
          </div>

          <div className="section-title">公演情報</div>
          <table className="detail">
            <tbody>
              <tr>
                <td className="label">公演名</td>
                <td className="value">{performance.name}</td>
              </tr>
              <tr>
                <td className="label">公演期間</td>
                <td className="value">{dateRange || '—'}</td>
              </tr>
            </tbody>
          </table>

          <div className="section-title">精算明細</div>
          <table className="detail">
            <tbody>
              <tr>
                <td className="label">販売枚数</td>
                <td className="value">{totalTickets}枚</td>
              </tr>
              <tr>
                <td className="label">チケットバック合計</td>
                <td className="value">{yen(backTotal)}</td>
              </tr>
              {normaDeduction > 0 && (
                <tr>
                  <td className="label">ノルマ控除額</td>
                  <td className="value">−{yen(normaDeduction)}</td>
                </tr>
              )}
              <tr className="total">
                <td className="label">出演料合計</td>
                <td className="value">{yen(settlementAmount)}</td>
              </tr>
            </tbody>
          </table>

          {backBreakdown.length > 0 && (
            <>
              <div className="section-title">チケットバック内訳</div>
              <table className="back">
                <thead>
                  <tr>
                    <th style={{ width: '8%' }}>#</th>
                    <th>対象範囲</th>
                    <th style={{ width: '16%' }}>単価</th>
                    <th style={{ width: '14%' }}>該当枚数</th>
                    <th style={{ width: '20%' }}>小計</th>
                  </tr>
                </thead>
                <tbody>
                  {backBreakdown.map(r => (
                    <tr key={r.stepNo}>
                      <td className="center">{r.stepNo}</td>
                      <td>{r.minTicketCount}枚 〜 {r.maxTicketCount != null ? `${r.maxTicketCount}枚` : '上限なし'}</td>
                      <td className="num">{yen(r.backUnitPrice)}</td>
                      <td className="num">{r.applicableCount}枚</td>
                      <td className="num">{yen(r.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="footer">
            <div className="issuer-name">劇団Birth</div>
            <div className="issuer-line">〒114-0015</div>
            <div className="issuer-line">東京都北区中里3-1-17</div>
            <div className="issuer-line">オウクレール駒込409</div>
            <div className="issuer-line">TEL: 090-2148-2348</div>
            <div className="issuer-line">Email: tac.birth2003@gmail.com</div>
          </div>
        </div>
      </div>
    </>
  );
}
