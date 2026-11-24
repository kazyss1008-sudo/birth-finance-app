'use client';
import { useState } from 'react';

export function CastLogout({ id, disabled, onLogout }: { id: string; disabled?: boolean; onLogout?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
    {error && <span role="alert">{error}</span>}
    <button type="button" className="secondary" disabled={disabled || busy} onClick={async () => {
      setBusy(true); setError('');
      try {
        if (onLogout) await onLogout();
        else {
          const response = await fetch('/api/cast/logout', { method: 'POST' });
          if (!response.ok) throw new Error('ログアウトできませんでした。もう一度お試しください。');
          location.replace(`/performances/${id}/cast`);
        }
      } catch { setError('ログアウトできませんでした。もう一度お試しください。'); }
      finally { setBusy(false); }
    }}>{busy ? 'ログアウト中…' : 'ログアウト'}</button>
  </div>;
}
