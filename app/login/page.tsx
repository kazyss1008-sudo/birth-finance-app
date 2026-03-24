'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/Shell';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId, password }),
      });
      const data = await res.json();
      if (data.needsSetup) {
        router.push('/setup-password');
        return;
      }
      if (!res.ok) { setError(data.message || 'ログインに失敗しました。'); return; }
      router.push(data.redirectTo || '/performances');
    } catch { setError('通信エラーが発生しました。'); } finally { setLoading(false); }
  }

  return (
    <Shell title="劇団Birth公演収支管理" subtitle="ログイン後に公演を選択して管理を開始します。">
      <div className="grid-2">
        <div className="card" style={{ background: 'linear-gradient(135deg, #153b96, #305fd6)', color: 'white' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.25em', opacity: 0.85, fontWeight: 700 }}>BIRTH FINANCE SYSTEM</div>
          <h2 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 900, whiteSpace: 'nowrap' }}>ログイン</h2>
          <p style={{ opacity: 0.9 }}>売上・経費・キャスト精算・CSV取込を一元管理するための運用画面です。</p>
        </div>
        <form className="card" onSubmit={handleSubmit}>
          <div className="grid">
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>ログインID</div>
              <input className="input" value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="admin" />
            </label>
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>パスワード</div>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="パスワードを入力" />
            </label>
            {error && <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 14 }}>{error}</div>}
            <button className="primary" type="submit" disabled={loading}>{loading ? 'ログイン中...' : 'ログイン'}</button>
            <div style={{ textAlign: 'right' }}>
              <Link href="/change-password" style={{ fontSize: 13, color: '#153b96', fontWeight: 600 }}>パスワード変更</Link>
            </div>
          </div>
        </form>
      </div>
    </Shell>
  );
}
