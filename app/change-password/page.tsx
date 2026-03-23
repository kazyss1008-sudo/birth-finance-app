'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/Shell';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) { setError('新しいパスワードは8文字以上にしてください。'); return; }
    if (newPassword !== confirmPassword) { setError('新しいパスワードが一致しません。'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || 'エラーが発生しました。'); return; }
      setSuccess('パスワードを変更しました。3秒後にログイン画面に遷移します。');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell title="パスワード変更" subtitle="現在のパスワードを入力して新しいパスワードに変更します。" actions={<Link href="/performances" className="secondary">戻る</Link>}>
      <div className="grid-2">
        <div className="card" style={{ background: 'linear-gradient(135deg, #153b96, #305fd6)', color: 'white' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.25em', opacity: 0.85, fontWeight: 700 }}>BIRTH FINANCE SYSTEM</div>
          <h2 style={{ fontSize: 28, lineHeight: 1.2, fontWeight: 900 }}>パスワード変更</h2>
          <p style={{ opacity: 0.9 }}>セキュリティのため、定期的なパスワード変更をお勧めします。</p>
        </div>
        <form className="card" onSubmit={handleSubmit} autoComplete="off">
          <div className="grid">
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>現在のパスワード</div>
              <input type="password" className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
            </label>
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>新しいパスワード</div>
              <input type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="8文字以上" required autoComplete="new-password" />
            </label>
            <label>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>新しいパスワード（確認）</div>
              <input type="password" className="input" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="もう一度入力" required autoComplete="new-password" />
            </label>
            {error && <div style={{ color: '#e74c3c', fontWeight: 700, fontSize: 14 }}>{error}</div>}
            {success && <div className="success-msg">{success}</div>}
            <button className="primary" type="submit" disabled={loading}>{loading ? '変更中...' : 'パスワードを変更'}</button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
