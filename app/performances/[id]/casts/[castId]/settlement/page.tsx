'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { useParams } from 'next/navigation';

type SettlementData = {
  cast: { id: string; name: string; normaTicketCount: number; normaUnitPrice: number; };
  performanceName: string;
  totalTickets: number;
  totalSalesAmount: number;
  backTotal: number;
  normaDeduction: number;
  settlementAmount: number;
  backBreakdown: { stepNo: number; minTicketCount: number; maxTicketCount: number | null; backUnitPrice: number; applicableCount: number; subtotal: number; }[];
  salesByDate: { date: string; ticketCount: number; salesAmount: number; }[];
};

function yen(n: number) { return `¥${n.toLocaleString()}`; }

export default function CastSettlementPage() {
  const params = useParams();
  const id = params.id as string;
  const castId = params.castId as string;
  const [data, setData] = useState<SettlementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/performances/${id}/casts/${castId}/settlement`).then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, [id, castId]);

  if (loading) return <Shell title="読み込み中..."><div className="card"><p>データを読み込んでいます...</p></div></Shell>;
  if (!data || !data.cast) return <Shell title="エラー"><div className="card"><p>データが見つかりません。</p></div></Shell>;

  return (
    <Shell title="キャスト精算内訳" subtitle={data.performanceName} actions={<Link href={`/performances/${id}?tab=収支`} className="secondary">← 収支に戻る</Link>}>
      <div className="card" style={{ textAlign: 'center', margin: '0 0 16px', padding: '20px 24px' }}>
        <span style={{ fontSize: '2.2rem', fontWeight: 900, color: '#153b96' }}>{data.cast.name} 様</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card"><div className="subtitle">販売枚数</div><div className="title brand">{data.totalTickets}枚</div></div>
        <div className="card"><div className="subtitle">ノルマ控除</div><div className="title" style={{ color: '#e74c3c' }}>{yen(data.normaDeduction)}</div></div>
        <div className="card"><div className="subtitle">最終精算額</div><div className="title" style={{ color: data.settlementAmount >= 0 ? '#059669' : '#e74c3c' }}>{yen(data.settlementAmount)}</div></div>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2 className="brand">バック内訳</h2>
          <table className="table">
            <thead><tr><th>対象範囲</th><th>該当枚数</th><th>単価</th><th>小計</th></tr></thead>
            <tbody>
              {data.backBreakdown.map(row => (
                <tr key={row.stepNo}>
                  <td>{row.minTicketCount}枚〜{row.maxTicketCount != null ? `${row.maxTicketCount}枚` : ''}</td>
                  <td>{row.applicableCount}枚</td>
                  <td>{yen(row.backUnitPrice)}</td>
                  <td>{yen(row.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="brand">計算式</h2>
          <p>バック総額 {yen(data.backTotal)}</p>
          <p>ノルマ残 max({data.cast.normaTicketCount} - {data.totalTickets}, 0) = {Math.max(data.cast.normaTicketCount - data.totalTickets, 0)} 枚 × {yen(data.cast.normaUnitPrice)} = {yen(data.normaDeduction)}</p>
          <p><strong>精算額 = {yen(data.backTotal)} - {yen(data.normaDeduction)} = {yen(data.settlementAmount)}</strong></p>
        </div>
      </div>
      {data.salesByDate.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="brand">ステージ別販売実績</h2>
          <table className="table">
            <thead><tr><th>公演日</th><th>販売枚数</th></tr></thead>
            <tbody>
              {data.salesByDate.map(row => (
                <tr key={row.date}><td>{row.date}</td><td>{row.ticketCount}枚</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
