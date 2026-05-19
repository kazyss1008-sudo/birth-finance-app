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

// JST 換算 (サーバ時計が UTC でも JST 表記に)
function formatJpDateTimeJST(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600 * 1000);
  return formatJpDateTime(jst);
}

const ROWS_PER_PAGE = 18;

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

  // ソートキー: customer_kana 優先、なければ customer_name
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

  // 行マーカー + 特典/招待/代済 判定
  type EnrichedRow = (typeof sales)[number] & {
    gyou: string;
    isNewGyou: boolean;
    isTokuten: boolean;
    isInvited: boolean;
    isPrepaid: boolean;
  };
  const enriched: EnrichedRow[] = sortedSales.map((s, idx, arr) => {
    const gyou = getGyou(s.customerKana ?? s.customerName ?? '');
    const prevGyou = idx > 0 ? getGyou(arr[idx - 1].customerKana ?? arr[idx - 1].customerName ?? '') : null;
    const tt = s.ticketType ?? '';
    const pm = s.paymentMethod ?? '';
    return {
      ...s,
      gyou,
      isNewGyou: gyou !== prevGyou,
      isTokuten: tt.includes('特典'),
      isInvited: tt.includes('招待') || pm.includes('招待'),
      isPrepaid: pm.includes('代済'),
    };
  });

  // ページ分割
  const pages: EnrichedRow[][] = [];
  for (let i = 0; i < enriched.length; i += ROWS_PER_PAGE) {
    pages.push(enriched.slice(i, i + ROWS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);

  const nowStr = formatJpDateTimeJST(new Date());
  const showStr = formatJpDateTime(visitedAtDate);

  // CSS文字列（@page のみ動的、その他は固定）
  const css = `
    @page {
      size: A4 landscape;
      margin: 14mm 10mm 14mm 10mm;
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
      padding: 0;
    }
    .sheet:last-child { page-break-after: auto; }
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
    table.resv col.col-gyou { width: 22pt; }
    table.resv col.col-name { width: 13%; }
    table.resv col.col-kana { width: 13%; }
    table.resv col.col-type { width: 18%; }
    table.resv col.col-pay { width: 10%; }
    table.resv col.col-cnt { width: 5%; }
    table.resv col.col-amt { width: 8%; }
    table.resv col.col-window { width: 11%; }
    table.resv col.col-memo { width: auto; }
    table.resv th, table.resv td {
      border-bottom: 0.4pt solid #777;
      padding: 4pt 5pt;
      vertical-align: top;
      color: #000;
      word-break: break-all;
    }
    table.resv th {
      background: #ddd;
      font-weight: 700;
      border-top: 0.6pt solid #000;
      border-bottom: 0.6pt solid #000;
      text-align: left;
    }
    .gyou-cell {
      font-weight: 900;
      font-size: 11pt;
      text-align: center;
      background: #f0f0f0;
    }
    .right { text-align: right; }
    .row-tokuten { background: #ebebeb; }
    .row-tokuten .gyou-cell { background: #d8d8d8; }
    .row-grayed { color: #777 !important; }
    .row-grayed .gyou-cell { color: #555 !important; background: #ededed; }
    .badge {
      display: inline-block;
      font-weight: 700;
      font-size: 7.5pt;
      padding: 1pt 4pt;
      border-radius: 2pt;
      margin-right: 3pt;
      color: white;
    }
    .badge-tokuten { background: #333; }
    .badge-invited { background: #888; }
    .badge-prepaid { background: #999; }
    .strike { text-decoration: line-through; text-decoration-color: #777; }
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
        padding: 14mm;
        margin: 0 auto 18px;
        max-width: 1080px;
        min-height: calc(210mm - 28mm);
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
        <button type="button" onClick={undefined /* hydrated below */} id="print-btn">🖨 印刷 / PDF保存</button>
        <span className="info">劇団Birth『{performance.name}』 / 公演日時：{showStr}〜 / {enriched.length}件 / {pages.length}ページ</span>
      </div>
      {pages.map((page, pageIdx) => (
        <div key={pageIdx} className="sheet">
          <div className="sheet-header">
            劇団Birth『{performance.name}』　公演日時：{showStr}〜
          </div>
          <table className="resv">
            <colgroup>
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
                <th>行</th>
                <th>名前</th>
                <th>フリガナ</th>
                <th>チケット種別</th>
                <th>支払方法</th>
                <th className="right">枚数</th>
                <th className="right">金額</th>
                <th>取扱窓口</th>
                <th>備考</th>
              </tr>
            </thead>
            <tbody>
              {page.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">この公演日時の予約データはありません。</td>
                </tr>
              )}
              {page.map((row, idx) => {
                const showGyou = idx === 0 || row.isNewGyou;
                const isReceptionFree = row.isInvited || row.isPrepaid;
                const rowClass = [
                  row.isTokuten ? 'row-tokuten' : '',
                  isReceptionFree ? 'row-grayed' : '',
                ].filter(Boolean).join(' ');
                return (
                  <tr key={row.id.toString()} className={rowClass}>
                    <td className="gyou-cell">{showGyou ? row.gyou : ''}</td>
                    <td>{row.customerName ?? ''}</td>
                    <td>{row.customerKana ?? ''}</td>
                    <td>
                      {row.isTokuten && <span className="badge badge-tokuten">★特典</span>}
                      {row.isInvited && <span className="badge badge-invited">招待</span>}
                      {row.isPrepaid && <span className="badge badge-prepaid">代済</span>}
                      {row.ticketType ?? ''}
                    </td>
                    <td>{row.paymentMethod ?? ''}</td>
                    <td className="right">{row.ticketCount}枚</td>
                    <td className={'right ' + (isReceptionFree ? 'strike' : '')}>¥{row.salesAmount.toLocaleString()}</td>
                    <td>{row.handledCastName}</td>
                    <td>{row.note ?? ''}</td>
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
