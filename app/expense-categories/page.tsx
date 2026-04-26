'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';

type Category = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCategories = () => {
    fetch('/api/expense-categories?all=1').then(r => r.json()).then(data => { setCategories(data); setLoading(false); });
  };

  useEffect(() => { fetchCategories(); }, []);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/expense-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg('error', data.message ?? '登録に失敗しました。');
      } else {
        showMsg('success', `「${data.name}」を追加しました。`);
        setNewName('');
        fetchCategories();
      }
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: Category) => {
    setEditId(c.id);
    setEditName(c.name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
  };

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/expense-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: editId, name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg('error', data.message ?? '更新に失敗しました。');
      } else {
        showMsg('success', '更新しました。');
        cancelEdit();
        fetchCategories();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: Category) => {
    const res = await fetch('/api/expense-categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: c.id, isActive: !c.isActive }),
    });
    if (res.ok) {
      showMsg('success', `${c.name}を${!c.isActive ? '有効' : '無効'}にしました。`);
      fetchCategories();
    } else {
      showMsg('error', '更新に失敗しました。');
    }
  };

  const handleDelete = async (c: Category) => {
    if (!confirm(`「${c.name}」を削除しますか？\n（経費で使用中の場合は無効化されます）`)) return;
    const res = await fetch('/api/expense-categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryId: c.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg('error', data.message ?? '削除に失敗しました。');
    } else if (data.softDeleted) {
      showMsg('success', data.message ?? '無効化しました。');
      fetchCategories();
    } else {
      showMsg('success', `「${c.name}」を削除しました。`);
      fetchCategories();
    }
  };

  const moveSort = async (c: Category, direction: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(x => x.id === c.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      fetch('/api/expense-categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: c.id, sortOrder: other.sortOrder }) }),
      fetch('/api/expense-categories', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryId: other.id, sortOrder: c.sortOrder }) }),
    ]);
    fetchCategories();
  };

  return (
    <Shell title="経費カテゴリ管理" subtitle="システム全体で使用する経費カテゴリの設定です。" actions={<Link href="/performances" className="secondary">公演選択へ戻る</Link>}>
      {msg && (
        <div className="card" style={{ marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', borderColor: msg.type === 'success' ? '#bbf7d0' : '#fecaca' }}>
          <p style={{ margin: 0, color: msg.type === 'success' ? '#059669' : '#dc2626' }}>{msg.text}</p>
        </div>
      )}

      <div className="card">
        <h2 className="brand">カテゴリ追加</h2>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="subtitle">カテゴリ名</label>
            <input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="例：衣装代" required />
          </div>
          <button className="primary" type="submit" disabled={adding || !newName.trim()}>{adding ? '追加中...' : '追加'}</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2 className="brand">カテゴリ一覧</h2>
        {loading ? (
          <p className="subtitle">読み込み中...</p>
        ) : categories.length === 0 ? (
          <p className="subtitle">カテゴリがありません。</p>
        ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginTop: 12 }}>
            <table className="table" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  <th style={{ width: 80, textAlign: 'center' }}>並び替え</th>
                  <th>カテゴリ名</th>
                  <th style={{ width: 80, textAlign: 'center' }}>状態</th>
                  <th style={{ width: 200, textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {[...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c, i, arr) => (
                  <tr key={c.id} style={c.isActive ? {} : { opacity: 0.5, background: '#f8fafc' }}>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button className="ghost" onClick={() => moveSort(c, -1)} disabled={i === 0} style={{ padding: '2px 6px', fontSize: 14 }}>▲</button>
                      <button className="ghost" onClick={() => moveSort(c, 1)} disabled={i === arr.length - 1} style={{ padding: '2px 6px', fontSize: 14 }}>▼</button>
                    </td>
                    <td>
                      {editId === c.id ? (
                        <input className="input" value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '6px 8px', fontSize: 14 }} autoFocus />
                      ) : (
                        c.name
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge" style={{ background: c.isActive ? '#e0f2fe' : '#f1f5f9', color: c.isActive ? '#0369a1' : '#64748b' }}>{c.isActive ? '有効' : '無効'}</span>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {editId === c.id ? (
                        <>
                          <button className="primary" onClick={handleSaveEdit} disabled={saving} style={{ padding: '4px 8px', fontSize: 12, marginRight: 4 }}>{saving ? '保存中' : '保存'}</button>
                          <button className="ghost" onClick={cancelEdit} style={{ padding: '4px 8px', fontSize: 12 }}>キャンセル</button>
                        </>
                      ) : (
                        <>
                          <button className="secondary" onClick={() => startEdit(c)} style={{ padding: '4px 8px', fontSize: 12, marginRight: 4 }}>編集</button>
                          <button className="ghost" onClick={() => handleToggleActive(c)} style={{ padding: '4px 8px', fontSize: 12, marginRight: 4 }}>{c.isActive ? '無効化' : '有効化'}</button>
                          <button className="danger" onClick={() => handleDelete(c)} style={{ padding: '4px 8px', fontSize: 12 }}>削除</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
