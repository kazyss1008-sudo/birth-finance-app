'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { useParams, useSearchParams } from 'next/navigation';

type Performance = {
  id: string; name: string; startDate: string; endDate: string;
  stageCount: number; defaultNormaUnitPrice: number; status: string;
  stages: Stage[]; casts: Cast[]; ticketBackRules: Rule[];
  importHistories: ImportHistory[];
};
type Stage = { id: string; stageNo: number; stageName: string; stageDate: string; sortOrder: number; };
type Cast = { id: string; name: string; normaTicketCount: number; normaUnitPrice: number; isTicketBackTarget: boolean; };
type Rule = { id: string; stepNo: number; minTicketCount: number; maxTicketCount: number | null; backUnitPrice: number; };
type ImportHistory = { id: string; fileName: string; importedRowCount: number; status: string; importedAt: string; };
type Sale = { id: string; handledCastName: string; ticketCount: number; salesAmount: number; visitedAt: string; };
type ExpenseCategory = { id: string; name: string; };
type Expense = { id: string; expenseDate: string; amount: number; itemName: string; memo: string | null; isSettled: boolean; createdBy: string; category: { name: string }; creator: { displayName: string }; };
type Summary = { totalSales: number; totalTickets: number; totalExpenses: number; totalSponsorship: number; totalGoodsSales: number; totalGara: number; netBalance: number; castDetails: CastDetail[]; };
type CastDetail = { castId: string; castName: string; ticketCount: number; salesAmount: number; backTotal: number; normaDeduction: number; settlement: number; normaTicketCount: number; normaUnitPrice: number; };
type EditCast = { id: string; name: string; normaTicketCount: number; normaUnitPrice: number; isTicketBackTarget: boolean; sortOrder: number; changed?: boolean; };
type GoodsItem = { id: string; name: string; unitPrice: number; sortOrder: number; sales: { id: string; performanceStageId: string; quantity: number; performanceStage: { id: string; stageName: string } }[] };
type GoodsSaleCell = { goodsId: string; performanceStageId: string; quantity: number };

const TABS = ['CSV取込', '売上', 'キャスト', 'バック', 'グッズ', '経費', '協賛金', '収支'] as const;
type TabName = typeof TABS[number];

function yen(n: number) { return `¥${n.toLocaleString()}`; }
function statusLabel(s: string) { return s === 'PREPARING' ? '準備中' : s === 'ACTIVE' ? '進行中' : s === 'CLOSED' ? '終了' : s; }

export default function PerformancePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const initialTab = (searchParams.get('tab') as TabName) || 'CSV取込';

  const [perf, setPerf] = useState<Performance | null>(null);
  const [activeTab, setActiveTab] = useState<TabName>(TABS.includes(initialTab as TabName) ? initialTab : 'CSV取込');
  const [loading, setLoading] = useState(true);

  // Tab data states
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [users, setUsers] = useState<{ id: string; displayName: string }[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  // CSV import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: boolean; message: string; details?: string[] } | null>(null);

  // Expense filter state
  const [expFilterCategory, setExpFilterCategory] = useState('');
  const [expFilterUser, setExpFilterUser] = useState('');

  // Expense form state
  const [expForm, setExpForm] = useState({ expenseDate: '', amount: '', expenseCategoryId: '', itemName: '', memo: '' });
  const [expSubmitting, setExpSubmitting] = useState(false);

  // Sponsorship state
  type Sponsorship = { id: string; sponsorName: string; amount: number; memo: string | null; createdAt: string; };
  const [sponsorships, setSponsorships] = useState<Sponsorship[] | null>(null);
  const [spForm, setSpForm] = useState({ sponsorName: '', amount: '', memo: '' });
  const [spSubmitting, setSpSubmitting] = useState(false);

  // Goods state
  const [goodsList, setGoodsList] = useState<GoodsItem[] | null>(null);
  const [goodsForm, setGoodsForm] = useState({ name: '', unitPrice: '' });
  const [goodsEditing, setGoodsEditing] = useState<string | null>(null);
  const [goodsEditForm, setGoodsEditForm] = useState({ name: '', unitPrice: '' });
  const [goodsSaleEdits, setGoodsSaleEdits] = useState<Map<string, number>>(new Map());
  const [goodsSaving, setGoodsSaving] = useState(false);

  // Cast edit state
  const [editCasts, setEditCasts] = useState<EditCast[] | null>(null);
  const [castSaving, setCastSaving] = useState(false);

  // Cast drag & drop
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Fetch performance data
  useEffect(() => {
    fetch(`/api/performances/${id}`)
      .then(r => r.json())
      .then(setPerf)
      .finally(() => setLoading(false));
  }, [id]);

  // Lazy load tab data
  const loadTabData = useCallback((tab: TabName) => {
    switch (tab) {
      case '売上':
        if (!sales) fetch(`/api/performances/${id}/sales`).then(r => r.json()).then(setSales);
        break;
      case 'キャスト':
        if (!editCasts) fetch(`/api/performances/${id}/casts`).then(r => r.json()).then(data => setEditCasts(data.map((c: EditCast) => ({ ...c, changed: false }))));
        break;
      case '経費': {
        const promises: Promise<void>[] = [];
        if (!expenses) promises.push(fetch(`/api/performances/${id}/expenses`).then(r => r.json()).then(setExpenses));
        if (categories.length === 0) promises.push(fetch(`/api/expense-categories`).then(r => r.json()).then(setCategories));
        if (users.length === 0) promises.push(fetch(`/api/users`).then(r => r.json()).then((data: { id: string; displayName: string; isActive: boolean }[]) => setUsers(data.filter(u => u.isActive))));
        Promise.all(promises);
        break;
      }
      case 'グッズ':
        if (!goodsList) fetch(`/api/performances/${id}/goods`).then(r => r.json()).then(setGoodsList);
        break;
      case '協賛金':
        if (!sponsorships) fetch(`/api/performances/${id}/sponsorships`).then(r => r.json()).then(setSponsorships);
        break;
      case '収支':
        if (!summary) fetch(`/api/performances/${id}/summary`).then(r => r.json()).then(setSummary);
        break;
    }
  }, [id, sales, expenses, categories, users, summary, editCasts, sponsorships, goodsList]);

  useEffect(() => { loadTabData(activeTab); }, [activeTab, loadTabData]);

  // CSV upload handler
  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const form = new FormData();
      form.append('file', csvFile);
      const res = await fetch(`/api/performances/${id}/import`, { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) {
        setCsvResult({ success: true, message: `${data.importedRowCount ?? 0}件のデータを取り込みました。` });
        // Refresh performance data to update import histories
        const updated = await fetch(`/api/performances/${id}`).then(r => r.json());
        setPerf(updated);
        // Reset cached data
        setSales(null);
        setSummary(null);
      } else {
        const details: string[] = [];
        if (data.errors && data.errors.length > 0) {
          details.push(...data.errors.map((r: { rowNo: number; castName: string }) => `行${r.rowNo}: キャスト名「${r.castName}」が一致しません`));
        }
        setCsvResult({ success: false, message: data.message || 'インポートに失敗しました。', details });
      }
    } catch {
      setCsvResult({ success: false, message: '通信エラーが発生しました。' });
    } finally {
      setCsvUploading(false);
    }
  };

  // Add expense
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpSubmitting(true);
    try {
      const res = await fetch(`/api/performances/${id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expForm, amount: Number(expForm.amount) }),
      });
      if (res.ok) {
        setExpForm({ expenseDate: '', amount: '', expenseCategoryId: '', itemName: '', memo: '' });
        const updated = await fetch(`/api/performances/${id}/expenses`).then(r => r.json());
        setExpenses(updated);
        setSummary(null);
      }
    } finally {
      setExpSubmitting(false);
    }
  };

  // Delete expense
  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('この経費を削除しますか？')) return;
    await fetch(`/api/performances/${id}/expenses`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseId }) });
    const updated = await fetch(`/api/performances/${id}/expenses`).then(r => r.json());
    setExpenses(updated);
    setSummary(null);
  };

  // Toggle expense settled
  const handleToggleSettled = async (expenseId: string, isSettled: boolean) => {
    await fetch(`/api/performances/${id}/expenses`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseId, isSettled }) });
    setExpenses(prev => prev?.map(e => e.id === expenseId ? { ...e, isSettled } : e) ?? null);
  };

  // Change expense assignee
  const handleChangeAssignee = async (expenseId: string, createdBy: string) => {
    await fetch(`/api/performances/${id}/expenses`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseId, createdBy }) });
    const assignedUser = users.find(u => u.id === createdBy);
    setExpenses(prev => prev?.map(e => e.id === expenseId ? { ...e, createdBy, creator: { displayName: assignedUser?.displayName ?? e.creator.displayName } } : e) ?? null);
  };

  // Add sponsorship
  const handleAddSponsorship = async (e: React.FormEvent) => {
    e.preventDefault();
    setSpSubmitting(true);
    try {
      const res = await fetch(`/api/performances/${id}/sponsorships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorName: spForm.sponsorName, amount: Number(spForm.amount), memo: spForm.memo }),
      });
      if (res.ok) {
        setSpForm({ sponsorName: '', amount: '', memo: '' });
        const updated = await fetch(`/api/performances/${id}/sponsorships`).then(r => r.json());
        setSponsorships(updated);
        setSummary(null);
      }
    } finally { setSpSubmitting(false); }
  };

  // Delete sponsorship
  const handleDeleteSponsorship = async (sponsorshipId: string) => {
    if (!confirm('この協賛金を削除しますか？')) return;
    await fetch(`/api/performances/${id}/sponsorships`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsorshipId }) });
    const updated = await fetch(`/api/performances/${id}/sponsorships`).then(r => r.json());
    setSponsorships(updated);
    setSummary(null);
  };

  // Cast editing helpers
  const updateCastField = (idx: number, field: string, value: unknown) => {
    setEditCasts(prev => prev?.map((c, i) => i === idx ? { ...c, [field]: value, changed: true } : c) ?? null);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    setEditCasts(prev => {
      if (!prev) return null;
      const arr = [...prev];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(idx, 0, moved);
      setDragIdx(idx);
      return arr.map((c, i) => ({ ...c, sortOrder: i, changed: true }));
    });
  };

  const saveCasts = async () => {
    if (!editCasts) return;
    setCastSaving(true);
    try {
      for (const c of editCasts.filter(c => c.changed)) {
        await fetch(`/api/performances/${id}/casts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ castId: c.id, name: c.name, normaTicketCount: c.normaTicketCount, normaUnitPrice: c.normaUnitPrice, isTicketBackTarget: c.isTicketBackTarget }),
        });
      }
      await fetch(`/api/performances/${id}/casts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: editCasts.map((c, i) => ({ castId: c.id, sortOrder: i })) }),
      });
      const updated = await fetch(`/api/performances/${id}/casts`).then(r => r.json());
      setEditCasts(updated.map((c: EditCast) => ({ ...c, changed: false })));
      const perfData = await fetch(`/api/performances/${id}`).then(r => r.json());
      setPerf(perfData);
      setSummary(null);
    } finally {
      setCastSaving(false);
    }
  };

  if (loading) return <Shell title="読み込み中..."><div className="card"><p>データを読み込んでいます...</p></div></Shell>;
  if (!perf) return <Shell title="エラー"><div className="card"><p>公演データが見つかりません。</p></div></Shell>;

  return (
    <Shell
      title={perf.name}
      subtitle={`${statusLabel(perf.status)} | ${perf.startDate?.slice(0, 10) ?? ''} - ${perf.endDate?.slice(0, 10) ?? ''}`}
      actions={<Link href="/performances" className="secondary">公演選択へ戻る</Link>}
    >
      {/* Tabs */}
      <div className="tabs">
        {TABS.map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>

      {/* CSV取込 Tab */}
      {activeTab === 'CSV取込' && (
        <div className="grid-2">
          <div className="card">
            <h2 className="brand">CSVファイル取込</h2>
            <p className="subtitle">再取込は公演単位で全洗替されます。キャスト名が一致しない場合はエラーになります。</p>
            <div className="grid" style={{ marginTop: 16 }}>
              <input className="input" type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
              <button className="primary" onClick={handleCsvUpload} disabled={!csvFile || csvUploading}>
                {csvUploading ? 'アップロード中...' : 'CSVをアップロード'}
              </button>
            </div>
            {csvResult && (
              <div className={csvResult.success ? 'success-msg' : 'error-msg'} style={{ marginTop: 12 }}>
                <p>{csvResult.message}</p>
                {csvResult.details && csvResult.details.length > 0 && (
                  <ul style={{ margin: '8px 0 0 16px', fontSize: 13 }}>
                    {csvResult.details.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="brand">取込履歴</h2>
            {perf.importHistories && perf.importHistories.length > 0 ? (
              <table className="table">
                <thead><tr><th>ファイル名</th><th>件数</th><th>状態</th><th>日時</th></tr></thead>
                <tbody>
                  {perf.importHistories.map(h => (
                    <tr key={h.id}>
                      <td>{h.fileName}</td>
                      <td>{h.importedRowCount}件</td>
                      <td><span className="badge">{h.status}</span></td>
                      <td className="subtitle">{new Date(h.importedAt).toLocaleString('ja-JP')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="subtitle">取込履歴はありません。</p>
            )}
          </div>
        </div>
      )}

      {/* 売上 Tab */}
      {activeTab === '売上' && (
        <div className="card">
          <h2 className="brand">売上一覧</h2>
          {!sales ? (
            <p className="subtitle">読み込み中...</p>
          ) : sales.length === 0 ? (
            <p className="subtitle">売上データがありません。CSVを取り込んでください。</p>
          ) : (
            <table className="table">
              <thead><tr><th>取扱窓口</th><th>枚数</th><th>金額</th><th>公演日</th></tr></thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id}>
                    <td>{s.handledCastName}</td>
                    <td>{s.ticketCount}枚</td>
                    <td>{yen(s.salesAmount)}</td>
                    <td>{s.visitedAt?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* キャスト Tab */}
      {activeTab === 'キャスト' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 className="brand">キャスト一覧</h2>
            {editCasts && editCasts.some(c => c.changed) && (
              <button className="primary" onClick={saveCasts} disabled={castSaving}>{castSaving ? '保存中...' : '変更を保存'}</button>
            )}
          </div>
          {!editCasts ? (
            <p className="subtitle">読み込み中...</p>
          ) : editCasts.length === 0 ? (
            <p className="subtitle">キャストが登録されていません。</p>
          ) : (
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="table" style={{ minWidth: 600 }}>
              <thead><tr><th style={{width:40}}></th><th>キャスト名</th><th style={{width:120}}>ノルマ枚数</th><th style={{width:120}}>ノルマ単価</th><th style={{width:80, textAlign:'center'}}>バック対象</th><th style={{width:80}}></th></tr></thead>
              <tbody>
                {editCasts.map((c, i) => (
                  <tr key={c.id} draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => handleDragOver(e, i)} onDragEnd={() => setDragIdx(null)} style={{ ...(c.changed ? { background: '#fffbeb' } : {}), ...(dragIdx === i ? { opacity: 0.4 } : {}) }}>
                    <td style={{cursor:'grab', textAlign:'center', color:'#94a3b8', fontSize:18, userSelect:'none'}} title="ドラッグで並び替え">☰</td>
                    <td><input className="input" value={c.name} onChange={e => updateCastField(i, 'name', e.target.value)} /></td>
                    <td><input className="input" type="number" min={0} value={c.normaTicketCount} onChange={e => updateCastField(i, 'normaTicketCount', Number(e.target.value))} /></td>
                    <td><input className="input" type="number" min={0} value={c.normaUnitPrice} onChange={e => updateCastField(i, 'normaUnitPrice', Number(e.target.value))} /></td>
                    <td style={{textAlign:'center'}}><input type="checkbox" checked={c.isTicketBackTarget} onChange={e => updateCastField(i, 'isTicketBackTarget', e.target.checked)} style={{width:20,height:20,accentColor:'#153b96',cursor:'pointer'}} /></td>
                    <td>{c.changed && <span className="badge" style={{background:'#fef3c7',color:'#92400e',fontSize:11}}>変更あり</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {/* バック Tab */}
      {activeTab === 'バック' && (
        <div className="card">
          <h2 className="brand">チケットバックルール</h2>
          {perf.ticketBackRules && perf.ticketBackRules.length > 0 ? (
            <table className="table">
              <thead><tr><th>ステップ</th><th>最小枚数</th><th>最大枚数</th><th>バック単価</th></tr></thead>
              <tbody>
                {perf.ticketBackRules.map(r => (
                  <tr key={r.id}>
                    <td>{r.stepNo}</td>
                    <td>{r.minTicketCount}枚</td>
                    <td>{r.maxTicketCount != null ? `${r.maxTicketCount}枚` : '上限なし'}</td>
                    <td>{yen(r.backUnitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="subtitle">バックルールが登録されていません。</p>
          )}
        </div>
      )}

      {/* グッズ Tab */}
      {activeTab === 'グッズ' && (
        <div className="grid">
          {/* グッズ登録フォーム */}
          <div className="card">
            <h2 className="brand">グッズ登録</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch(`/api/performances/${id}/goods`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: goodsForm.name, unitPrice: Number(goodsForm.unitPrice) || 0 }),
              });
              if (res.ok) { setGoodsForm({ name: '', unitPrice: '' }); setGoodsList(null); fetch(`/api/performances/${id}/goods`).then(r => r.json()).then(setGoodsList); }
              else { const d = await res.json(); alert(d.message || 'エラー'); }
            }} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
              <div><label className="subtitle">グッズ名</label><input className="input" value={goodsForm.name} onChange={e => setGoodsForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div><label className="subtitle">単価</label><input className="input" type="number" value={goodsForm.unitPrice} onChange={e => setGoodsForm(f => ({ ...f, unitPrice: e.target.value }))} required /></div>
              <button className="primary" type="submit">追加</button>
            </form>
          </div>

          {/* グッズ一覧 */}
          {goodsList && goodsList.length > 0 && (
            <div className="card">
              <h2 className="brand">登録済みグッズ</h2>
              <table className="table">
                <thead><tr><th>グッズ名</th><th>単価</th><th>販売合計</th><th>売上合計</th><th></th></tr></thead>
                <tbody>
                  {goodsList.map(g => {
                    const totalQty = g.sales.reduce((s, r) => s + r.quantity, 0);
                    return (
                      <tr key={g.id}>
                        <td>
                          {goodsEditing === g.id
                            ? <input className="input" value={goodsEditForm.name} onChange={e => setGoodsEditForm(f => ({ ...f, name: e.target.value }))} style={{ padding: '6px 8px' }} />
                            : <span style={{ fontWeight: 700 }}>{g.name}</span>
                          }
                        </td>
                        <td>
                          {goodsEditing === g.id
                            ? <input className="input" type="number" value={goodsEditForm.unitPrice} onChange={e => setGoodsEditForm(f => ({ ...f, unitPrice: e.target.value }))} style={{ width: 100, padding: '6px 8px' }} />
                            : yen(g.unitPrice)
                          }
                        </td>
                        <td>{totalQty}個</td>
                        <td style={{ fontWeight: 700 }}>{yen(totalQty * g.unitPrice)}</td>
                        <td>
                          {goodsEditing === g.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="primary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={async () => {
                                await fetch(`/api/performances/${id}/goods`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goodsId: g.id, name: goodsEditForm.name, unitPrice: Number(goodsEditForm.unitPrice) }) });
                                setGoodsEditing(null); setGoodsList(null); fetch(`/api/performances/${id}/goods`).then(r => r.json()).then(setGoodsList);
                              }}>保存</button>
                              <button className="secondary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => setGoodsEditing(null)}>取消</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="secondary" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => { setGoodsEditing(g.id); setGoodsEditForm({ name: g.name, unitPrice: String(g.unitPrice) }); }}>編集</button>
                              <button className="danger" style={{ fontSize: 12 }} onClick={async () => { if (!confirm(`${g.name}を削除しますか？`)) return; await fetch(`/api/performances/${id}/goods`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ goodsId: g.id }) }); setGoodsList(null); fetch(`/api/performances/${id}/goods`).then(r => r.json()).then(setGoodsList); }}>削除</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ステージ別販売実績入力 */}
          {goodsList && goodsList.length > 0 && perf && perf.stages.length > 0 && (
            <div className="card">
              <h2 className="brand">ステージ別販売実績</h2>
              <p className="subtitle">各セルに販売個数を入力し「保存」を押してください。</p>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>グッズ</th>
                      {perf.stages.map(st => <th key={st.id} style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{st.stageName}<br/><span className="subtitle" style={{ fontSize: 11 }}>{st.stageDate?.slice(5, 10)}</span></th>)}
                      <th style={{ textAlign: 'center' }}>合計</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goodsList.map(g => {
                      let rowTotal = 0;
                      return (
                        <tr key={g.id}>
                          <td style={{ position: 'sticky', left: 0, background: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{g.name}<span className="subtitle" style={{ marginLeft: 6 }}>{yen(g.unitPrice)}</span></td>
                          {perf.stages.map(st => {
                            const key = `${g.id}_${st.id}`;
                            const existing = g.sales.find(s => s.performanceStageId === st.id);
                            const val = goodsSaleEdits.has(key) ? goodsSaleEdits.get(key)! : (existing?.quantity ?? 0);
                            rowTotal += val;
                            return (
                              <td key={st.id} style={{ textAlign: 'center' }}>
                                <input className="input" type="number" min="0" value={val || ''} placeholder="0" onFocus={e => e.target.select()} onChange={e => {
                                  const newMap = new Map(goodsSaleEdits);
                                  newMap.set(key, Number(e.target.value) || 0);
                                  setGoodsSaleEdits(newMap);
                                }} style={{ width: 70, padding: '6px 8px', textAlign: 'center' }} />
                              </td>
                            );
                          })}
                          <td style={{ textAlign: 'center', fontWeight: 900 }}>{rowTotal}個<br/><span style={{ color: '#153b96' }}>{yen(rowTotal * g.unitPrice)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button className="primary" disabled={goodsSaving} onClick={async () => {
                  setGoodsSaving(true);
                  const records: GoodsSaleCell[] = [];
                  for (const g of goodsList) {
                    for (const st of perf.stages) {
                      const key = `${g.id}_${st.id}`;
                      const existing = g.sales.find(s => s.performanceStageId === st.id);
                      const qty = goodsSaleEdits.has(key) ? goodsSaleEdits.get(key)! : (existing?.quantity ?? 0);
                      records.push({ goodsId: g.id, performanceStageId: st.id, quantity: qty });
                    }
                  }
                  await fetch(`/api/performances/${id}/goods-sales`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }) });
                  setGoodsSaleEdits(new Map());
                  setGoodsList(null);
                  setSummary(null);
                  fetch(`/api/performances/${id}/goods`).then(r => r.json()).then(setGoodsList);
                  setGoodsSaving(false);
                }}>{goodsSaving ? '保存中...' : '販売実績を保存'}</button>
              </div>
            </div>
          )}

          {goodsList && goodsList.length === 0 && (
            <div className="card"><p className="subtitle">グッズが登録されていません。上のフォームから追加してください。</p></div>
          )}
          {!goodsList && <div className="card"><p className="subtitle">読み込み中...</p></div>}
        </div>
      )}

      {/* 経費 Tab */}
      {activeTab === '経費' && (
        <div className="grid">
          <div className="card">
            <h2 className="brand">経費登録</h2>
            <form onSubmit={handleAddExpense} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
              <div>
                <label className="subtitle">日付</label>
                <input className="input" type="date" value={expForm.expenseDate} onChange={e => setExpForm(f => ({ ...f, expenseDate: e.target.value }))} required />
              </div>
              <div>
                <label className="subtitle">カテゴリ</label>
                <select className="select" value={expForm.expenseCategoryId} onChange={e => setExpForm(f => ({ ...f, expenseCategoryId: e.target.value }))} required>
                  <option value="">選択</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="subtitle">品名</label>
                <input className="input" value={expForm.itemName} onChange={e => setExpForm(f => ({ ...f, itemName: e.target.value }))} required />
              </div>
              <div>
                <label className="subtitle">金額</label>
                <input className="input" type="number" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <button className="primary" type="submit" disabled={expSubmitting}>{expSubmitting ? '登録中...' : '追加'}</button>
            </form>
            {expForm.memo !== undefined && (
              <div style={{ marginTop: 8 }}>
                <label className="subtitle">メモ</label>
                <input className="input" value={expForm.memo} onChange={e => setExpForm(f => ({ ...f, memo: e.target.value }))} placeholder="メモ（任意）" />
              </div>
            )}
          </div>
          {/* ユーザー別未精算サマリ */}
          {expenses && expenses.length > 0 && (() => {
            const byUser = new Map<string, { name: string; total: number; settled: number }>();
            for (const e of expenses) {
              const key = e.creator?.displayName ?? '不明';
              const cur = byUser.get(key) ?? { name: key, total: 0, settled: 0 };
              cur.total += e.amount;
              if (e.isSettled) cur.settled += e.amount;
              byUser.set(key, cur);
            }
            const users = Array.from(byUser.values());
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {users.map(u => (
                  <div key={u.name} className="card" style={{ padding: 16 }}>
                    <div className="subtitle">{u.name}</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>立替合計: {yen(u.total)}</div>
                    <div style={{ fontSize: 13 }}>精算済: {yen(u.settled)}</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: u.total - u.settled > 0 ? '#dc2626' : '#059669', marginTop: 4 }}>
                      未精算: {yen(u.total - u.settled)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="card">
            {(() => {
              const filtered = expenses?.filter(e => {
                if (expFilterCategory && e.category?.name !== expFilterCategory) return false;
                if (expFilterUser && e.createdBy !== expFilterUser) return false;
                return true;
              }) ?? [];
              const filteredSum = filtered.reduce((s, e) => s + e.amount, 0);
              const uniqueCategories = [...new Set(expenses?.map(e => e.category?.name).filter(Boolean) ?? [])];
              const uniqueUsers = [...new Map(expenses?.map(e => [e.createdBy, e.creator?.displayName]) ?? []).entries()];
              return (<>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <h2 className="brand" style={{ margin: 0 }}>経費一覧</h2>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#153b96' }}>合計: {yen(filteredSum)}</div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label className="subtitle" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>カテゴリ</label>
                    <select className="select" value={expFilterCategory} onChange={e => setExpFilterCategory(e.target.value)} style={{ padding: '6px 8px', fontSize: 13, borderRadius: 10 }}>
                      <option value="">すべて</option>
                      {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <label className="subtitle" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>担当者</label>
                    <select className="select" value={expFilterUser} onChange={e => setExpFilterUser(e.target.value)} style={{ padding: '6px 8px', fontSize: 13, borderRadius: 10 }}>
                      <option value="">すべて</option>
                      {uniqueUsers.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
                    </select>
                  </div>
                  {(expFilterCategory || expFilterUser) && <button className="ghost" onClick={() => { setExpFilterCategory(''); setExpFilterUser(''); }} style={{ fontSize: 12, padding: '4px 8px' }}>フィルタ解除</button>}
                </div>
                {!expenses ? (
                  <p className="subtitle">読み込み中...</p>
                ) : filtered.length === 0 ? (
                  <p className="subtitle" style={{ marginTop: 12 }}>{expenses.length === 0 ? '経費が登録されていません。' : '該当する経費がありません。'}</p>
                ) : (
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 12 }}>
                  <table className="table" style={{ minWidth: 700 }}>
                    <thead><tr><th style={{width:60,textAlign:'center'}}>精算</th><th>日付</th><th>担当者</th><th>カテゴリ</th><th>品名</th><th>金額</th><th>メモ</th><th></th></tr></thead>
                    <tbody>
                      {filtered.map(exp => (
                        <tr key={exp.id} style={exp.isSettled ? { opacity: 0.5 } : {}}>
                          <td style={{textAlign:'center'}}><input type="checkbox" checked={exp.isSettled} onChange={e => handleToggleSettled(exp.id, e.target.checked)} style={{width:18,height:18,accentColor:'#153b96',cursor:'pointer'}} /></td>
                          <td>{exp.expenseDate?.slice(0, 10)}</td>
                          <td>
                            <select className="select" value={exp.createdBy} onChange={e => handleChangeAssignee(exp.id, e.target.value)} style={{padding:'6px 8px',fontSize:13,borderRadius:10,minWidth:90}}>
                              {users.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                              {!users.find(u => u.id === exp.createdBy) && <option value={exp.createdBy}>{exp.creator?.displayName}</option>}
                            </select>
                          </td>
                          <td><span className="badge">{exp.category?.name}</span></td>
                          <td>{exp.itemName}</td>
                          <td>{yen(exp.amount)}</td>
                          <td><input className="input" value={exp.memo ?? ''} placeholder="メモ" onChange={e => { const val = e.target.value; setExpenses(prev => prev?.map(x => x.id === exp.id ? { ...x, memo: val } : x) ?? null); }} onBlur={e => { fetch(`/api/performances/${id}/expenses`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expenseId: exp.id, memo: e.target.value }) }); }} style={{ padding: '6px 8px', fontSize: 13, minWidth: 80 }} /></td>
                          <td><button className="danger" onClick={() => handleDeleteExpense(exp.id)}>削除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </>);
            })()}
          </div>
        </div>
      )}

      {/* 収支 Tab */}
      {activeTab === '収支' && (
        <div className="grid">
          {!summary ? (
            <div className="card"><p className="subtitle">読み込み中...</p></div>
          ) : (
            <>
              {/* 最終収支 */}
              <div className="card" style={{ border: '3px solid', borderColor: summary.netBalance >= 0 ? '#059669' : '#e74c3c', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px 32px', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>最終収支</div>
                <div style={{ fontSize: 42, lineHeight: 1.1, fontWeight: 900, color: summary.netBalance >= 0 ? '#059669' : '#e74c3c' }}>{yen(summary.netBalance)}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>売上 + グッズ + 協賛 - 経費 - ギャラ</div>
              </div>
              {/* 内訳 */}
              <div className="balance-grid">
                <div className="card" style={{ padding: 16, background: '#f0f4ff' }}>
                  <div className="subtitle" style={{ fontSize: 12 }}>チケット売上 <span style={{ marginLeft: 4 }}>{summary.totalTickets}枚</span></div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#153b96' }}>{yen(summary.totalSales)}</div>
                </div>
                <div className="card" style={{ padding: 16, background: '#f0f4ff' }}>
                  <div className="subtitle" style={{ fontSize: 12 }}>グッズ売上</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#153b96' }}>{yen(summary.totalGoodsSales)}</div>
                </div>
                <div className="card" style={{ padding: 16, background: '#f0f4ff' }}>
                  <div className="subtitle" style={{ fontSize: 12 }}>協賛金</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#153b96' }}>{yen(summary.totalSponsorship)}</div>
                </div>
                <div className="card" style={{ padding: 16, background: '#fef2f2' }}>
                  <div className="subtitle" style={{ fontSize: 12 }}>総経費</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#e74c3c' }}>{yen(summary.totalExpenses)}</div>
                </div>
                <div className="card" style={{ padding: 16, background: -summary.totalGara >= 0 ? '#f0fdf4' : '#fef2f2' }}>
                  <div className="subtitle" style={{ fontSize: 12 }}>ギャラ収支</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: -summary.totalGara >= 0 ? '#059669' : '#e74c3c' }}>{yen(-summary.totalGara)}</div>
                </div>
              </div>
              <div className="card">
                <h2 className="brand">キャスト毎精算管理</h2>
                <p className="subtitle">段階式ルールで都度再計算。計算結果はDB保存なし。</p>
                {summary.castDetails && summary.castDetails.length > 0 ? (
                  <table className="table">
                    <thead><tr><th>キャスト</th><th>販売枚数</th><th>売上金額</th><th>バック総額</th><th>ノルマ控除</th><th>精算額</th><th></th></tr></thead>
                    <tbody>
                      {summary.castDetails.map(c => (
                        <tr key={c.castId}>
                          <td>{c.castName}</td>
                          <td>{c.ticketCount}枚</td>
                          <td>{yen(c.salesAmount)}</td>
                          <td>{yen(c.backTotal)}</td>
                          <td>{yen(c.normaDeduction)}</td>
                          <td style={{ color: c.settlement >= 0 ? '#059669' : '#e74c3c', fontWeight: 700 }}>{yen(c.settlement)}</td>
                          <td><Link className="secondary" href={`/performances/${id}/casts/${c.castId}/settlement`}>内訳</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="subtitle">キャストデータがありません。</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 協賛金 Tab */}
      {activeTab === '協賛金' && (
        <div className="grid">
          <div className="card">
            <h2 className="brand">協賛金登録</h2>
            <form onSubmit={handleAddSponsorship} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
              <div>
                <label className="subtitle">協賛者名</label>
                <input className="input" value={spForm.sponsorName} onChange={e => setSpForm(f => ({ ...f, sponsorName: e.target.value }))} placeholder="例: 株式会社○○" required />
              </div>
              <div>
                <label className="subtitle">金額</label>
                <input className="input" type="number" value={spForm.amount} onChange={e => setSpForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div>
                <label className="subtitle">メモ</label>
                <input className="input" value={spForm.memo} onChange={e => setSpForm(f => ({ ...f, memo: e.target.value }))} placeholder="任意" />
              </div>
              <button className="primary" type="submit" disabled={spSubmitting}>{spSubmitting ? '登録中...' : '追加'}</button>
            </form>
          </div>
          <div className="card">
            <h2 className="brand">協賛金一覧</h2>
            {!sponsorships ? (
              <p className="subtitle">読み込み中...</p>
            ) : sponsorships.length === 0 ? (
              <p className="subtitle">協賛金がまだ登録されていません。</p>
            ) : (
              <>
                <div style={{ marginBottom: 12, fontSize: 18, fontWeight: 900, color: '#153b96' }}>
                  合計: {yen(sponsorships.reduce((s, sp) => s + sp.amount, 0))}
                </div>
                <table className="table">
                  <thead><tr><th>協賛者名</th><th>金額</th><th>メモ</th><th></th></tr></thead>
                  <tbody>
                    {sponsorships.map(sp => (
                      <tr key={sp.id}>
                        <td>{sp.sponsorName}</td>
                        <td>{yen(sp.amount)}</td>
                        <td><input className="input" value={sp.memo ?? ''} placeholder="メモ" onChange={e => { const val = e.target.value; setSponsorships(prev => prev?.map(x => x.id === sp.id ? { ...x, memo: val } : x) ?? null); }} onBlur={e => { fetch(`/api/performances/${id}/sponsorships`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sponsorshipId: sp.id, memo: e.target.value }) }); }} style={{ padding: '6px 8px', fontSize: 13, minWidth: 80 }} /></td>
                        <td><button className="danger" onClick={() => handleDeleteSponsorship(sp.id)}>削除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
