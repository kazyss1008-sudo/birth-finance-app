import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { prisma } from '@/lib/prisma';
import { PerformanceCardPrefetcher } from './PerformanceCardPrefetcher';

export const dynamic = 'force-dynamic';

function formatDate(d: Date | null) {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function statusLabel(s: string) {
  switch (s) {
    case 'PREPARING': return '準備中';
    case 'ACTIVE': return '進行中';
    case 'CLOSED': return '終了';
    default: return s;
  }
}

export default async function PerformanceSelectPage() {
  const performances = await prisma.performance.findMany({ orderBy: { startDate: 'desc' } });

  return (
    <Shell title="公演選択" subtitle="管理する公演を選択してください。" actions={<div style={{ display: 'flex', gap: 8 }}><Link href="/users" className="secondary">ユーザー管理</Link><Link href="/performances/new" className="primary">新規公演作成</Link></div>}>
      {performances.length === 0 ? (
        <div className="card">
          <p className="subtitle">公演がまだ登録されていません。「新規公演作成」から始めてください。</p>
        </div>
      ) : (
        <div className="grid-3">
          {performances.map((p, i) => (
            <PerformanceCardPrefetcher key={p.id.toString()} id={p.id.toString()} first={i === 0}>
              <span className="badge">{statusLabel(p.status)}</span>
              <h2 style={{ fontSize: 22, marginBottom: 8 }} className="brand">{p.name}</h2>
              <div className="subtitle">{formatDate(p.startDate)} - {formatDate(p.endDate)}</div>
            </PerformanceCardPrefetcher>
          ))}
        </div>
      )}
    </Shell>
  );
}
