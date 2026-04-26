'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';

type Performance = { id: string; name: string; status: string; startDate: string; endDate: string };
type User = { id: string; displayName: string };
type Category = { id: string; name: string };

export default function QuickExpensePage({ params }: { params: Promise<{ performanceId: string }> }) {
  const { performanceId } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performance, setPerformance] = useState<Performance | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form state - userId persisted in localStorage so users don't reselect every time
  const [userId, setUserId] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [itemName, setItemName] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [isProvisional, setIsProvisional] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/quick-expense/${performanceId}`).then(async r => {
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data.message ?? '読み込みに失敗しました。');
        setLoading(false);
        return;
      }
      const data = await r.json();
      setPerformance(data.performance);
      setUsers(data.users);
      setCategories(data.categories);
      // Restore previously selected user
      const savedUser = localStorage.getItem('quickExpense_userId');
      if (savedUser && data.users.find((u: User) => u.id === savedUser)) {
        setUserId(savedUser);
      }
      // Default date to today
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      setExpenseDate(`${yyyy}-${mm}-${dd}`);
      setLoading(false);
    }).catch(e => { setError(String(e)); setLoading(false); });
  }, [performanceId]);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !expenseDate || !expenseCategoryId || !itemName || !amount) {
      showMsg('error', 'すべての必須項目を入力してください。');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quick-expense/${performanceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          expenseDate,
          expenseCategoryId,
          itemName,
          amount: Number(amount),
          memo,
          isProvisional,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg('error', data.message ?? '登録に失敗しました。');
      } else {
        const userName = users.find(u => u.id === userId)?.displayName ?? '';
        showMsg('success', `「${itemName}」¥${Number(amount).toLocaleString()} を登録しました（担当: ${userName}）`);
        localStorage.setItem('quickExpense_userId', userId);
        // Reset form fields except user/date
        setItemName('');
        setAmount('');
        setMemo('');
        setIsProvisional(false);
        setExpenseCategoryId('');
      }
    } catch (err) {
      showMsg('error', String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>読み込み中...</div>;
  }

  if (error || !performance) {
    return (
      <div style={{ maxWidth: 480, margin: '40px auto', padding: 24 }}>
        <div className="card" style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
          <h2 className="brand" style={{ color: '#dc2626' }}>エラー</h2>
          <p style={{ marginTop: 8 }}>{error ?? '公演が見つかりません。'}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16, paddingTop: 24 }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Image src="/logo.png" alt="" width={48} height={48} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#dc2626', fontWeight: 800, fontSize: 11, letterSpacing: 1 }}>BIRTH FINANCE SYSTEM</div>
            <h1 className="brand" style={{ fontSize: 18, margin: '2px 0', wordBreak: 'break-word' }}>{performance.name}</h1>
            <div className="subtitle" style={{ fontSize: 12 }}>経費 簡易登録</div>
          </div>
        </div>
      </div>

      {msg && (
        <div className="card" style={{ marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', borderColor: msg.type === 'success' ? '#bbf7d0' : '#fecaca' }}>
          <p style={{ margin: 0, color: msg.type === 'success' ? '#059669' : '#dc2626', fontSize: 14 }}>{msg.text}</p>
        </div>
      )}

      <div className="card">
        <h2 className="brand" style={{ fontSize: 16, marginBottom: 12 }}>経費登録</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="subtitle" style={{ fontSize: 12 }}>担当者 <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="select" value={userId} onChange={e => setUserId(e.target.value)} required style={{ width: '100%' }}>
              <option value="">選択してください</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </select>
          </div>
          <div>
            <label className="subtitle" style={{ fontSize: 12 }}>日付 <span style={{ color: '#dc2626' }}>*</span></label>
            <input className="input" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required style={{ width: '100%' }} />
          </div>
          <div>
            <label className="subtitle" style={{ fontSize: 12 }}>カテゴリ <span style={{ color: '#dc2626' }}>*</span></label>
            <select className="select" value={expenseCategoryId} onChange={e => setExpenseCategoryId(e.target.value)} required style={{ width: '100%' }}>
              <option value="">選択してください</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="subtitle" style={{ fontSize: 12 }}>品名 <span style={{ color: '#dc2626' }}>*</span></label>
            <input className="input" value={itemName} onChange={e => setItemName(e.target.value)} required placeholder="例：印刷代" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="subtitle" style={{ fontSize: 12 }}>金額 <span style={{ color: '#dc2626' }}>*</span></label>
            <input className="input" type="number" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="例：3000" style={{ width: '100%' }} inputMode="numeric" />
          </div>
          <div>
            <label className="subtitle" style={{ fontSize: 12 }}>メモ</label>
            <input className="input" value={memo} onChange={e => setMemo(e.target.value)} placeholder="任意" style={{ width: '100%' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={isProvisional} onChange={e => setIsProvisional(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#f59e0b' }} />
            暫定経費（後で金額が変わる可能性あり）
          </label>
          <button className="primary" type="submit" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? '登録中...' : '経費を登録'}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: '#94a3b8' }}>
        ※ このページは公演関係者向けのものです。<br />
        登録内容は管理画面から編集・削除できます。
      </div>
    </div>
  );
}
