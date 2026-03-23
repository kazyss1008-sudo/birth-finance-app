'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';

type User = {
  id: string;
  loginId: string;
  displayName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Add form
  const [newLoginId, setNewLoginId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = () => {
    fetch('/api/users').then(r => r.json()).then(data => { setUsers(data); setLoading(false); });
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setAdding(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: newLoginId, displayName: newDisplayName, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'error', text: data.message || 'エラー' }); return; }
      setNewLoginId(''); setNewDisplayName(''); setNewPassword('');
      setMsg({ type: 'success', text: `ユーザー「${newDisplayName}」を追加しました。` });
      fetchUsers();
    } catch { setMsg({ type: 'error', text: '通信エラー' }); } finally { setAdding(false); }
  };

  const startEdit = (u: User) => {
    setEditId(u.id);
    setEditDisplayName(u.displayName);
    setEditPassword('');
  };

  const cancelEdit = () => { setEditId(null); setEditPassword(''); };

  const handleSave = async (userId: string) => {
    setMsg(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { userId, displayName: editDisplayName };
      if (editPassword) body.password = editPassword;
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'error', text: data.message || 'エラー' }); return; }
      setEditId(null); setEditPassword('');
      setMsg({ type: 'success', text: '更新しました。' });
      fetchUsers();
    } catch { setMsg({ type: 'error', text: '通信エラー' }); } finally { setSaving(false); }
  };

  const handleToggleActive = async (u: User) => {
    setMsg(null);
    if (u.id === '1') { setMsg({ type: 'error', text: '管理者は無効化できません。' }); return; }
    const newState = !u.isActive;
    const res = await fetch('/api/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id, isActive: newState }),
    });
    if (res.ok) {
      setMsg({ type: 'success', text: `${u.displayName}を${newState ? '有効化' : '無効化'}しました。` });
      fetchUsers();
    }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`${u.displayName}を無効化しますか？`)) return;
    setMsg(null);
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id }),
    });
    const data = await res.json();
    if (!res.ok) { setMsg({ type: 'error', text: data.message || 'エラー' }); return; }
    setMsg({ type: 'success', text: `${u.displayName}を無効化しました。` });
    fetchUsers();
  };

  if (loading) return <Shell title="ユーザー管理"><div className="card"><p>読み込み中...</p></div></Shell>;

  return (
    <Shell title="ユーザー管理" subtitle="ユーザーの追加・編集・無効化を行います。" actions={<Link href="/performances" className="secondary">公演選択へ戻る</Link>}>
      {msg && <div className={msg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="brand">ユーザー追加</h2>
        <form onSubmit={handleAdd} autoComplete="off" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, alignItems: 'end', marginTop: 8 }}>
          <div>
            <label className="subtitle">ログインID</label>
            <input className="input" value={newLoginId} onChange={e => setNewLoginId(e.target.value)} placeholder="例: tanaka" required autoComplete="off" />
          </div>
          <div>
            <label className="subtitle">表示名</label>
            <input className="input" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="例: 田中太郎" required autoComplete="off" />
          </div>
          <div>
            <label className="subtitle">パスワード（8文字以上）</label>
            <input className="input" type="text" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="初期パスワード" required minLength={8} style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} />
          </div>
          <button className="primary" type="submit" disabled={adding}>{adding ? '追加中...' : '追加'}</button>
        </form>
      </div>

      <div className="card">
        <h2 className="brand">ユーザー一覧</h2>
        <table className="table">
          <thead>
            <tr><th>ログインID</th><th>表示名</th><th>状態</th><th>作成日</th><th>操作</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={!u.isActive ? { opacity: 0.5 } : {}}>
                <td style={{ fontWeight: 700 }}>{u.loginId}</td>
                <td>
                  {editId === u.id ? (
                    <input className="input" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} />
                  ) : u.displayName}
                </td>
                <td>
                  {u.isActive
                    ? <span className="badge">有効</span>
                    : <span className="badge" style={{ background: '#fee2e2', color: '#dc2626' }}>無効</span>
                  }
                </td>
                <td className="subtitle">{new Date(u.createdAt).toLocaleDateString('ja-JP')}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {editId === u.id ? (
                      <>
                        <input className="input" type="text" autoComplete="new-password" placeholder="新パスワード（変更時のみ）" value={editPassword} onChange={e => setEditPassword(e.target.value)} style={{ width: 180, WebkitTextSecurity: 'disc' } as React.CSSProperties} />
                        <button className="primary" onClick={() => handleSave(u.id)} disabled={saving} style={{ fontSize: 12, padding: '6px 12px' }}>{saving ? '...' : '保存'}</button>
                        <button className="secondary" onClick={cancelEdit} style={{ fontSize: 12, padding: '6px 12px' }}>取消</button>
                      </>
                    ) : (
                      <>
                        <button className="secondary" onClick={() => startEdit(u)} style={{ fontSize: 12, padding: '6px 12px' }}>編集</button>
                        {u.id !== '1' && (
                          u.isActive
                            ? <button className="danger" onClick={() => handleDelete(u)} style={{ fontSize: 12 }}>無効化</button>
                            : <button className="secondary" onClick={() => handleToggleActive(u)} style={{ fontSize: 12, padding: '6px 12px' }}>有効化</button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
