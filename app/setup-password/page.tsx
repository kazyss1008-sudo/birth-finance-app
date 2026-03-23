'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shell } from '@/components/Shell';

export default function SetupPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('パスワードは8文字以上にしてください。'); return; }
    if (password !== confirm) { setError('パスワードが一致しません。'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: 'admin', password, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'エラーが発生しました。'); return; }
      router.push('/login');
    } catch { setError('通信エラーが発生しました。'); } finally { setLoading(false); }
  }

  return (
    <Shell title="劇団Birth公演収支管理" subtitle="管理者の初回パスワードを設定してください。">
      <div className="grid-2">
        <div className="card" style={{ background: 'linear-gradient(135deg, #153b96, #305fd6)', color: 'white' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.25em', opacity: 0.85, fontWeight: 700 }}>BIRTH FINANCE SYSTEM</div>
          <h2 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 900, whiteSpace: 'nowrap' }}>初回パスワード設定</h2>
          <p style={{ opacity: 0.9 }}>adminアカウントのパスワードを設定します。8文字以上で入力してください。</p>
        </div>
        <form className="card" onSubmit={handleSubmit}>
          <div className="grid">
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>新しいパスワード</div>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="8文字以上" />
            </label>
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>パスワード（確認）</div>
              <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="もう一度入力" />
            </label>
            {error && <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 14 }}>{error}</div>}
            <button className="primary" type="submit" disabled={loading}>{loading ? '設定中...' : 'パスワードを設定'}</button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
