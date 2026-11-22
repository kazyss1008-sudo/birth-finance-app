'use client';
import { useCallback, useEffect, useState } from 'react';
type Row = { id: string; name: string; roleName: string; normaTicketCount: number; normaUnitPrice: number; isTicketBackTarget: boolean; email: string; hasPassword: boolean; password: string; selected: boolean };
export function CastAccounts({ performanceId }: { performanceId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [paste, setPaste] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; ok: boolean; message: string }[]>([]);
  const load = useCallback(async () => {
    const res = await fetch(`/api/performances/${performanceId}/cast-accounts`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
    setRows(data.map((r: Row) => ({ ...r, password: '', selected: true })));
    setDirty(false);
  }, [performanceId]);
  useEffect(() => { load().catch(e => setMessage(e.message)); }, [load]);
  function update(id: string, data: Partial<Row>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
    if (!('selected' in data)) setDirty(true);
  }
  async function save() {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`/api/performances/${performanceId}/cast-accounts`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map(r => ({ castId: r.id, name:r.name, roleName:r.roleName||'', normaTicketCount:r.normaTicketCount, normaUnitPrice:r.normaUnitPrice, isTicketBackTarget:r.isTicketBackTarget, email: r.email, password: r.password }))),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await load(); setMessage('全員分を保存しました'); setPaste('');
    } catch (e) { setMessage(e instanceof Error ? e.message : '保存に失敗しました'); }
    finally { setBusy(false); }
  }
  async function invite(onlyFailed = false) {
    setBusy(true); setMessage('');
    try {
      const ids = onlyFailed ? results.filter(r => !r.ok).map(r => r.id) : rows.filter(r => r.selected).map(r => r.id);
      const res = await fetch(`/api/performances/${performanceId}/cast-invitations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ castIds: ids, requestId: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results); setMessage('送信処理が完了しました。結果をご確認ください');
    } catch (e) { setMessage(e instanceof Error ? e.message : '送信に失敗しました'); }
    finally { setBusy(false); }
  }
  function applyPaste() {
    const lines = paste.trim().split(/\r?\n/).map(line => line.split('\t'));
    const updates = new Map<string, { email: string; password: string }>();
    for (const parts of lines) {
      if (parts.length !== 3) { setMessage('各行は「キャスト名・メールアドレス・パスワード」の3列をタブで区切ってください'); return; }
      const name = parts[0].trim();
      const row = rows.find(r => r.name === name);
      if (!row || updates.has(row.id)) { setMessage(`キャスト名「${name}」が見つからないか、重複しています`); return; }
      updates.set(row.id, { email: parts[1].trim(), password: parts[2] });
    }
    setRows(prev => prev.map(r => ({ ...r, ...updates.get(r.id) })));
    setDirty(true); setMessage('一覧に反映しました。「全員分を保存」で登録してください'); setPaste('');
  }
  const [newName,setNewName]=useState('');
  async function add(){setBusy(true);setMessage('');try{const r=await fetch(`/api/performances/${performanceId}/casts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName})});if(!r.ok)throw new Error('追加できませんでした。名前をご確認ください');await load();setNewName('');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function move(index:number,delta:number){setBusy(true);try{const reordered=[...rows];[reordered[index],reordered[index+delta]]=[reordered[index+delta],reordered[index]];const r=await fetch(`/api/performances/${performanceId}/casts`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({order:reordered.map((r,i)=>({castId:r.id,sortOrder:i}))})});if(!r.ok)throw new Error('並び替えできませんでした');await load();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  const count = rows.filter(r => r.selected).length;
  return <section style={{ marginTop: 28, borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <h3 className="brand" style={{ margin: 0 }}>キャスト設定</h3>
      <a className="secondary" href="https://birth-schedule-app.vercel.app/line-settings" target="_blank" rel="noopener noreferrer" style={{ whiteSpace: 'nowrap', textDecoration: 'none' }}>LINE通知設定 ↗</a>
    </div>
    <p className="subtitle">更新通知の宛先登録・個人宛テストは「LINE通知設定」から行えます。スケジュールアプリを別のタブで開きます。</p>
    <p className="subtitle">公演共通のログインURL：<a className="brand" href={`/performances/${performanceId}/cast`} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: 'anywhere' }}>{`/performances/${performanceId}/cast`}</a><br />全キャストに同じURLを配布できます。同じ公演では、キャストごとに異なるメールアドレスを登録してください。</p>
    <p className="subtitle">メールアドレスとパスワードをまとめて登録できます。パスワードは8文字以上。空欄なら現在のパスワードを維持します。登録後のパスワードは表示されません。メールアドレスを空欄にするとログインできなくなります。</p>
    <details style={{ margin: '16px 0' }}>
      <summary>表計算からまとめて貼り付け</summary>
      <p className="subtitle">見出しを除き、「キャスト名」「メールアドレス」「パスワード」の3列をコピーして貼り付けてください。</p>
      <textarea className="input" rows={5} value={paste} onChange={e => setPaste(e.target.value)} aria-label="キャストのログイン情報を一括貼り付け" />
      <button className="secondary" onClick={applyPaste} disabled={busy || !paste.trim()}>一覧に反映</button>
    </details>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="grid grid-2">{rows.map((r,index)=><article key={r.id} className="cast-record">
        <h3 className="brand">{r.name}</h3>
        <label>キャスト名<input className="input" value={r.name} onChange={e=>update(r.id,{name:e.target.value})}/></label>
        <label>役名<input className="input" value={r.roleName||''} onChange={e=>update(r.id,{roleName:e.target.value})}/></label>
        <div className="grid grid-2"><label>ノルマ枚数<input className="input" type="number" min={0} value={r.normaTicketCount} onChange={e=>update(r.id,{normaTicketCount:Number(e.target.value)})}/></label><label>ノルマ単価<input className="input" type="number" min={0} value={r.normaUnitPrice} onChange={e=>update(r.id,{normaUnitPrice:Number(e.target.value)})}/></label></div>
        <label><input type="checkbox" checked={r.isTicketBackTarget} onChange={e=>update(r.id,{isTicketBackTarget:e.target.checked})}/> バック対象</label>
        <label>メールアドレス<input className="input" type="email" value={r.email} onChange={e=>update(r.id,{email:e.target.value})}/></label>
        <label>パスワード登録・再設定<input className="input" type="password" autoComplete="new-password" placeholder={r.hasPassword?'登録済み（変更時のみ入力）':'未登録'} value={r.password} onChange={e=>update(r.id,{password:e.target.value})}/></label>
        <label><input type="checkbox" checked={r.selected} onChange={e=>update(r.id,{selected:e.target.checked})}/> URL案内の送信対象</label>
        <div style={{display:'flex',gap:8}}><button className="secondary" disabled={dirty||index===0} onClick={()=>move(index,-1)}>↑ 上へ</button><button className="secondary" disabled={dirty||index===rows.length-1} onClick={()=>move(index,1)}>↓ 下へ</button></div>
      </article>)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        <button className="primary" onClick={save} disabled={!dirty || rows.length === 0}>全員分を保存</button>
        <button className="secondary" onClick={() => invite()} disabled={dirty || count === 0 || count > 50}>選択した{count}名へURLをメール送信</button>
        {results.some(r => !r.ok) && <button className="secondary" disabled={dirty} onClick={() => invite(true)}>失敗した宛先に再送</button>}
      </div>
      <div style={{marginTop:24}}><label>新しいキャスト名<input className="input" value={newName} onChange={e=>setNewName(e.target.value)}/></label><button className="secondary" disabled={dirty||!newName.trim()} onClick={add}>キャストを追加</button>{dirty&&<p className="subtitle">追加・並び替えの前に変更を保存してください。</p>}</div>
    </fieldset>
    <p className="subtitle">案内メールには公演共通URLとログイン用メールアドレスが記載されます。パスワードは別途お伝えください。1回の送信は50名までです。</p>
    {busy && <p role="status">処理中です。この画面を閉じずにお待ちください…</p>}
    {message && <p role="status">{message}</p>}
    {results.length > 0 && <ul>{results.map(r => <li key={r.id} style={{ color: r.ok ? '#059669' : '#dc2626' }}>{r.name}: {r.message}</li>)}</ul>}
  </section>;
}
