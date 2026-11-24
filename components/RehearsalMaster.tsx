'use client';
import {useState,useEffect,useCallback} from 'react';
type Rehearsal={id:string;performanceId:string;date:string;startTime:string;endTime:string;location:string;memo:string|null;sortOrder:number};
function formatDateJP(value:string){return new Date(value.slice(0,10)+'T00:00:00+09:00').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'long',day:'numeric',weekday:'short'});}
/* ===== Tab 1: 稽古スケジュール ===== */
export function RehearsalTab({ perfId, rehearsals, reload, flash, flashErr }: {
  perfId: string; rehearsals: Rehearsal[]; reload: () => Promise<void>; flash: (m: string) => void; flashErr: (m: string) => void;
}) {
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editMemo, setEditMemo] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !startTime || !endTime) { flashErr('日付・開始時刻・終了時刻は必須です'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/performances/${perfId}/rehearsals`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startTime, endTime, location, memo: memo || null }),
      });
      if (!res.ok) { const d = await res.json(); flashErr(d.error); return; }
      setDate(''); setStartTime(''); setEndTime(''); setLocation(''); setMemo('');
      await reload();
      flash('稽古日程を追加しました');
    } catch { flashErr('通信エラー'); }
    finally { setBusy(false); }
  }

  async function handleUpdate() {
    if (!editId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/performances/${perfId}/rehearsals`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, date: editDate, startTime: editStart, endTime: editEnd, location: editLocation, memo: editMemo || null }),
      });
      if (!res.ok) { const d = await res.json(); flashErr(d.error); return; }
      setEditId(null);
      await reload();
      flash('更新しました');
    } catch { flashErr('通信エラー'); }
    finally { setBusy(false); }
  }

  async function handleDelete(rehearsalId: string) {
    if (!confirm('この稽古日程を削除しますか？関連するキャストスケジュールも削除されます。')) return;
    try {
      await fetch(`/api/performances/${perfId}/rehearsals`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rehearsalId }),
      });
      await reload();
      flash('削除しました');
    } catch { flashErr('通信エラー'); }
  }

  function startEdit(r: Rehearsal) {
    setEditId(r.id); setEditDate(r.date); setEditStart(r.startTime); setEditEnd(r.endTime); setEditLocation(r.location); setEditMemo(r.memo ?? '');
  }

  return (
    <div>
      <h2 className="brand" style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>稽古日程登録</h2>
      <form onSubmit={handleAdd} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 24 }}>
        <div>
          <label className="subtitle" style={{ fontSize: 12, fontWeight: 700 }}>日付 *</label>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="subtitle" style={{ fontSize: 12, fontWeight: 700 }}>開始 *</label>
          <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className="subtitle" style={{ fontSize: 12, fontWeight: 700 }}>終了 *</label>
          <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
        </div>
        <div>
          <label className="subtitle" style={{ fontSize: 12, fontWeight: 700 }}>場所</label>
          <input className="input" value={location} onChange={e => setLocation(e.target.value)} placeholder="稽古場名" />
        </div>
        <div>
          <label className="subtitle" style={{ fontSize: 12, fontWeight: 700 }}>メモ</label>
          <input className="input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="備考" />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button className="primary" disabled={busy} style={{ width: '100%' }}>{busy ? '追加中...' : '追加'}</button>
        </div>
      </form>

      {rehearsals.length === 0 ? (
        <p className="subtitle" style={{ textAlign: 'center', padding: 24 }}>稽古日程がまだ登録されていません</p>
      ) : (
        <div className="responsive-table">
          <table className="table">
            <thead>
              <tr>
                <th>日付</th>
                <th>時間</th>
                <th>場所</th>
                <th>メモ</th>
                <th style={{ width: 120 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rehearsals.map(r => editId === r.id ? (
                <tr key={r.id}>
                  <td><input className="input" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ minWidth: 130 }} /></td>
                  <td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input className="input" type="time" value={editStart} onChange={e => setEditStart(e.target.value)} style={{ minWidth: 80 }} />
                    〜
                    <input className="input" type="time" value={editEnd} onChange={e => setEditEnd(e.target.value)} style={{ minWidth: 80 }} />
                  </td>
                  <td><input className="input" value={editLocation} onChange={e => setEditLocation(e.target.value)} /></td>
                  <td><input className="input" value={editMemo} onChange={e => setEditMemo(e.target.value)} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="primary" onClick={handleUpdate} disabled={busy} style={{ fontSize: 12, padding: '6px 10px' }}>保存</button>
                      <button className="secondary" onClick={() => setEditId(null)} style={{ fontSize: 12, padding: '6px 10px' }}>取消</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatDateJP(r.date)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.startTime}〜{r.endTime}</td>
                  <td>{r.location}</td>
                  <td style={{ color: '#64748b', fontSize: 12 }}>{r.memo}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="secondary" onClick={() => startEdit(r)} style={{ fontSize: 12, padding: '6px 10px' }}>編集</button>
                      <button className="danger" onClick={() => handleDelete(r.id)}>削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


export function RehearsalMaster({id}:{id:string}){
 const [rows,setRows]=useState<Rehearsal[]>([]),[message,setMessage]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const r=await fetch(`/api/performances/${id}/schedule-grid`);if(!r.ok)throw new Error('稽古日程を読み込めませんでした');const d=await r.json();setRows(d.rehearsals);},[id]);
 useEffect(()=>{load().catch(e=>setError(e.message));},[load]);
 return <div className="card">{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}<RehearsalTab perfId={id} rehearsals={rows} reload={load} flash={m=>{setMessage(m);setError('')}} flashErr={m=>{setError(m);setMessage('')}}/></div>;
}
