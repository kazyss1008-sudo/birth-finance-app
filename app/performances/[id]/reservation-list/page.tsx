import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Katakana → Hiragana 正規化 (ソート用)
function toHiragana(s: string): string {
  return (s ?? '').replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 50音図の「行」を返す。判定不可は ''
function getGyou(name: string): string {
  if (!name) return '';
  const ch = toHiragana(name).charAt(0);
  if ('あいうえおぁぃぅぇぉ'.includes(ch)) return 'ア';
  if ('かきくけこがぎぐげご'.includes(ch)) return 'カ';
  if ('さしすせそざじずぜぞ'.includes(ch)) return 'サ';
  if ('たちつてとだぢづでどっ'.includes(ch)) return 'タ';
  if ('なにぬねの'.includes(ch)) return 'ナ';
  if ('はひふへほばびぶべぼぱぴぷぺぽ'.includes(ch)) return 'ハ';
  if ('まみむめも'.includes(ch)) return 'マ';
  if ('やゆよゃゅょ'.includes(ch)) return 'ヤ';
  if ('らりるれろ'.includes(ch)) return 'ラ';
  if ('わをんゎ'.includes(ch)) return 'ワ';
  return '';
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

function formatJpDateTime(d: Date): string {
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${DOW[d.getUTCDay()]}) ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function formatJpDateTimeJST(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return formatJpDateTime(jst);
}

const ROWS_PER_PAGE = 22;

export default async function ReservationListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visitedAt?: string }>;
}) {
  const { id } = await params;
  const { visitedAt } = await searchParams;
  if (!visitedAt) return notFound();
  const performanceId = BigInt(id);
  const visitedAtDate = new Date(visitedAt);
  if (isNaN(visitedAtDate.getTime())) return notFound();

  const [performance, sales] = await Promise.all([
    prisma.performance.findUnique({ where: { id: performanceId }, select: { name: true } }),
    prisma.sale.findMany({
      where: { performanceId, visitedAt: visitedAtDate },
      orderBy: { id: 'asc' },
    }),
  ]);
  if (!performance) return notFound();

  const collator = new Intl.Collator('ja', { sensitivity: 'base' });
  const sortKey = (s: typeof sales[number]) => toHiragana(s.customerKana ?? s.customerName ?? '');
  const sortedSales = [...sales].sort((a, b) => {
    const aKey = sortKey(a);
    const bKey = sortKey(b);
    if (!aKey && !bKey) return 0;
    if (!aKey) return 1;
    if (!bKey) return -1;
    return collator.compare(aKey, bKey);
  });

  type EnrichedRow = (typeof sales)[number] & {
    gyou: string;
    isNewGyou: boolean;
    isTokuten: boolean;
    isReceptionFree: boolean;
  };
  const enriched: EnrichedRow[] = sortedSales.map((s, idx, arr) => {
    const gyou = getGyou(s.customerKana ?? s.customerName ?? '');
    const prevGyou = idx > 0 ? getGyou(arr[idx - 1].customerKana ?? arr[idx - 1].customerName ?? '') : null;
    const tt = s.ticketType ?? '';
    const pm = s.paymentMethod ?? '';
    const isInvited = tt.includes('招待') || pm.includes('招待');
    const isPrepaid = pm.includes('代済');
    return {
      ...s,
      gyou,
      isNewGyou: gyou !== prevGyou,
      isTokuten: tt.includes('特典'),
      isReceptionFree: isInvited || isPrepaid,
    };
  });

  const pages: EnrichedRow[][] = [];
  for (let i = 0; i < enriched.length; i += ROWS_PER_PAGE) {
    pages.push(enriched.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const nowStr = formatJpDateTimeJST(new Date());
  const showStr = formatJpDateTime(visitedAtDate);

  const css = `
    @page {
      size: A4 landscape;
      margin: 9mm 7mm 9mm 7mm;
      @top-right {
        content: "出力日時：${nowStr}";
        font-size: 8.5pt;
        color: #555;
      }
      @bottom-right {
        content: counter(page) " / " counter(pages);
        font-size: 9pt;
        color: #555;
      }
    }
    html, body {
      background: white !important;
      color: black !important;
      font-family: "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif !important;
      font-size: 9pt;
      margin: 0;
      padding: 0;
    }
    /* 印刷時も背景色・バッジ色を再現させる */
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
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
    .toolbar button {
      background: white;
      color: #1f2937;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    }
    .toolbar .info { opacity: 0.85; font-size: 12px; }
    .sheet {
      page-break-after: always;
      break-after: page;
      padding: 0;
    }
    .sheet:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
    .sheet-header {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 4pt;
      padding-bottom: 4pt;
      border-bottom: 0.6pt solid #333;
    }
    table.resv {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      table-layout: fixed;
    }
    table.resv col.col-badge { width: 42pt; }
    table.resv col.col-gyou { width: 18pt; }
    table.resv col.col-name { width: 13%; }
    table.resv col.col-kana { width: 13%; }
    table.resv col.col-type { width: 12%; }
    table.resv col.col-pay { width: 10%; }
    table.resv col.col-cnt { width: 5%; }
    table.resv col.col-amt { width: 8%; }
    table.resv col.col-window { width: 11%; }
    table.resv col.col-memo { width: auto; }
    table.resv th, table.resv td {
      border-bottom: 0.4pt solid #777;
      padding: 3pt 5pt;
      vertical-align: middle;
      color: #000;
      word-break: break-all;
    }
    table.resv th {
      background: #c8c8c8;
      font-weight: 700;
      border-top: 0.6pt solid #000;
      border-bottom: 0.6pt solid #000;
      text-align: center;
    }
    /* バッジ列: 表の左外に見せるため枠線なし。row-grayed の背景もここまでは伸ばさない */
    table.resv th.badge-header,
    table.resv td.badge-cell {
      border: none !important;
      background: white !important;
      padding: 2pt 6pt 2pt 0 !important;
      text-align: right;
      vertical-align: middle;
      white-space: nowrap;
    }
    .gyou-cell {
      font-weight: 900;
      font-size: 11pt;
      text-align: center;
    }
    .center { text-align: center; }
    /* 支払いなし (招待/代済) のみグレー背景 (ヘッダより薄め) */
    .row-grayed {
      background: #ddd;
      color: #444 !important;
    }
    /* 備考: 本文のみフォントを小さく + 2行までで省略 (...) */
    .memo-clamp {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.3;
      word-break: break-all;
      font-size: 7.5pt;
    }
    /* バッジは特典のみ */
    .badge {
      display: inline-block;
      font-weight: 700;
      font-size: 7.5pt;
      padding: 1.5pt 4pt;
      border-radius: 2pt;
      color: white;
      margin: 0 0 1.5pt 1pt;
      white-space: nowrap;
    }
    .badge-tokuten { background: #333; }
    .empty {
      text-align: center;
      padding: 40pt 0;
      color: #777;
    }
    @media screen {
      body { padding: 16px; background: #f3f4f6 !important; }
      .sheet {
        background: white;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        padding: 9mm 7mm;
        margin: 0 auto 18px;
        max-width: 1120px;
        min-height: calc(210mm - 18mm);
      }
    }
    @media print {
      .toolbar { display: none !important; }
      .sheet { box-shadow: none; padding: 0; margin: 0; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="toolbar">
        <button type="button" id="print-btn">🖨 印刷 / PDF保存</button>
        <span className="info">劇団Birth『{performance.name}』 / 公演日時：{showStr}〜 / {enriched.length}件 / {pages.length}ページ</span>
      </div>
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} className="sheet">
          <div className="sheet-header">
            劇団Birth『{performance.name}』　公演日時：{showStr}〜
          </div>
          <table className="resv">
            <colgroup>
              <col className="col-badge" />
              <col className="col-gyou" />
              <col className="col-name" />
              <col className="col-kana" />
              <col className="col-type" />
              <col className="col-pay" />
              <col className="col-cnt" />
              <col className="col-amt" />
              <col className="col-window" />
              <col className="col-memo" />
            </colgroup>
            <thead>
              <tr>
                <th className="badge-header"></th>
                <th>行</th>
                <th>名前</th>
                <th>フリガナ</th>
                <th>チケット種別</th>
                <th>支払方法</th>
                <th>枚数</th>
                <th>金額</th>
                <th>取扱窓口</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {page.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty">この公演日時の予約データはありません。</td>
                </tr>
              )}
              {page.map((row, idx) => {
                const showGyou = idx === 0 || row.isNewGyou;
                const rowClass = row.isReceptionFree ? 'row-grayed' : '';
                return (
                  <tr key={row.id.toString()} className={rowClass}>
                    <td className="badge-cell">
                      {row.isTokuten && <span className="badge badge-tokuten">★特典</span>}
                    </td>
                    <td className="gyou-cell">{showGyou ? row.gyou : ''}</td>
                    <td>{row.customerName ? `${row.customerName}　様` : ''}</td>
                    <td>{row.customerKana ?? ''}</td>
                    <td className="center">{row.ticketType ?? ''}</td>
                    <td className="center">{row.paymentMethod ?? ''}</td>
                    <td className="center">{row.ticketCount}枚</td>
                    <td className="center">¥{row.salesAmount.toLocaleString()}</td>
                    <td className="center">{row.handledCastName}</td>
                    <td><div className="memo-clamp">{row.note ?? ''}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.addEventListener('DOMContentLoaded', function() {
              var btn = document.getElementById('print-btn');
              if (btn) btn.addEventListener('click', function() { window.print(); });
            });
          `,
        }}
      />
    </>
  );
}
