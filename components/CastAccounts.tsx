'use client';
import { useCallback, useEffect, useState } from 'react';
type Row = { id: string; name: string; email: string; hasPassword: boolean; password: string; selected: boolean };
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
    if ('email' in data || 'password' in data) setDirty(true);
  }
  async function save() {
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`/api/performances/${performanceId}/cast-accounts`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.map(r => ({ castId: r.id, email: r.email, password: r.password }))),
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
  const count = rows.filter(r => r.selected).length;
  return <section style={{ marginTop: 28, borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
    <h3 className="brand">キャスト用スケジュール ログイン設定</h3>
    <p className="subtitle">メールアドレスとパスワードをまとめて登録できます。パスワードは8文字以上。空欄なら現在のパスワードを維持します。登録後のパスワードは表示されません。メールアドレスを空欄にするとログインできなくなります。</p>
    <details style={{ margin: '16px 0' }}>
      <summary>表計算からまとめて貼り付け</summary>
      <p className="subtitle">見出しを除き、「キャスト名」「メールアドレス」「パスワード」の3列をコピーして貼り付けてください。</p>
      <textarea className="input" rows={5} value={paste} onChange={e => setPaste(e.target.value)} aria-label="キャストのログイン情報を一括貼り付け" />
      <button className="secondary" onClick={applyPaste} disabled={busy || !paste.trim()}>一覧に反映</button>
    </details>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <div style={{ overflowX: 'auto' }}><table className="table" style={{ minWidth: 650 }}>
        <thead><tr><th><input aria-label="全員を送信対象にする" type="checkbox" checked={rows.length > 0 && count === rows.length} onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))} /></th><th>キャスト名</th><th>メールアドレス</th><th>パスワード登録・再設定</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}>
          <td><input aria-label={`${r.name}を送信対象にする`} type="checkbox" checked={r.selected} onChange={e => update(r.id, { selected: e.target.checked })} /></td>
          <td>{r.name}</td>
          <td><input className="input" aria-label={`${r.name}のメールアドレス`} type="email" value={r.email} onChange={e => update(r.id, { email: e.target.value })} /></td>
          <td><input className="input" aria-label={`${r.name}の新しいパスワード`} type="password" autoComplete="new-password" placeholder={r.hasPassword ? '登録済み（変更時のみ入力）' : '未登録'} value={r.password} onChange={e => update(r.id, { password: e.target.value })} /></td>
        </tr>)}</tbody>
      </table></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        <button className="primary" onClick={save} disabled={!dirty || rows.length === 0}>全員分を保存</button>
        <button className="secondary" onClick={() => invite()} disabled={dirty || count === 0 || count > 50}>選択した{count}名へURLをメール送信</button>
        {results.some(r => !r.ok) && <button className="secondary" disabled={dirty} onClick={() => invite(true)}>失敗した宛先に再送</button>}
      </div>
    </fieldset>
    <p className="subtitle">案内メールには本人用URLとログイン用メールアドレスが記載されます。パスワードは別途お伝えください。1回の送信は50名までです。</p>
    {busy && <p role="status">処理中です。この画面を閉じずにお待ちください…</p>}
    {message && <p role="status">{message}</p>}
    {results.length > 0 && <ul>{results.map(r => <li key={r.id} style={{ color: r.ok ? '#059669' : '#dc2626' }}>{r.name}: {r.message}</li>)}</ul>}
  </section>;
}
