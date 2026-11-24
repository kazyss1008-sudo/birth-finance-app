'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import {useParams} from 'next/navigation';
type Settings = { schedulerOwner?: 'schedule'|'finance'; mode: 'TEST' | 'PRODUCTION'; testTargetId: string | null; productionTargetId: string | null; rehearsalImageEnabled: boolean };
type Destination = { id: string; name: string; type: string };
export default function LineSettingsPage() {
  const masterId=useParams<{id?:string}>()?.id;

  const [settings, setSettings] = useState<Settings>({ mode: 'TEST', testTargetId: null, productionTargetId: null, rehearsalImageEnabled: false });
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const rehearsalTestId = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/line/settings');
      if (res.status === 401) { window.location.assign('/login'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '読み込みに失敗しました');
      setSettings(data.settings); setDestinations(data.destinations); setConnected(data.connected); setDirty(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : '読み込みに失敗しました'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  function update(data: Partial<Settings>) {
    if ('testTargetId' in data) rehearsalTestId.current = null;
    setSettings(prev => ({ ...prev, ...data, ...('productionTargetId' in data && !data.productionTargetId ? { rehearsalImageEnabled: false } : {}) }));
    setDirty(true); setMessage('');
  }
  async function save() {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/line/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDirty(false);
      setMessage(`設定を保存しました。朝の変更通知：${settings.mode === 'PRODUCTION' ? 'オン' : 'オフ'} ／ 前日夜の画像通知：${settings.rehearsalImageEnabled ? 'オン' : 'オフ'}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : '保存に失敗しました'); }
    finally { setBusy(false); }
  }
  async function test(kind: 'SAMPLE' | 'CHANGES') {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/line/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID(), kind }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(data.sent === false ? '前回のテストから差分がありません。元に戻した変更は通知しません。' :
        kind === 'CHANGES' ? `${data.name} 様の個人LINEへ実際の変更${data.count}件をテスト送信しました。本番通知の対象は残っています。` : `${data.name} 様の個人LINEへテスト通知を送信しました。`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'テスト送信に失敗しました'); }
    finally { setBusy(false); }
  }
  async function testRehearsalImage() {
    setBusy(true); setMessage('');
    try {
      const requestId = rehearsalTestId.current ??= crypto.randomUUID();
      const res = await fetch('/api/line/rehearsal-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId }),
      });
      if (res.status < 500) rehearsalTestId.current = null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`${data.date} の稽古案内（画像1枚）を、${data.name} 様の個人LINEへテスト送信しました。`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'テスト送信に失敗しました'); }
    finally { setBusy(false); }
  }
  return <Shell title="LINE通知設定" subtitle="劇団Birthスケジュール管理 @773bgnjo" actions={<a href={masterId?`/performances/${masterId}/master?section=common`:'/master'} className="secondary">マスタへ戻る</a>}>
    <div className="card" style={{ maxWidth: 800, margin: '0 auto' }}>
      <h2 className="brand">テストは個人宛、本番は運営グループへ</h2><label>定時通知の担当アプリ<select className="select" value={settings.schedulerOwner??'schedule'} onChange={e=>update({schedulerOwner:e.target.value as 'schedule'|'finance'})}><option value="schedule">旧スケジュール管理</option><option value="finance">基幹システム</option></select></label>
      <p style={{ lineHeight: 1.8 }}>朝の変更通知はテストモードでは送信しません。「個人宛にテスト送信」は、モードにかかわらず指定した個人宛にだけサンプルを送り、実際の変更履歴は通知済みにしません。</p>
      <p style={{ lineHeight: 1.8 }}>「実際の変更を個人宛にテスト送信」では、前回のテスト以降の差分をキャスト別・稽古日順に送ります。同じ稽古日の修正は最終結果にまとめ、元に戻した変更は省きます。初回は未通知分を対象とし、本番通知の対象は残ります。</p>
      {!connected && !loading && <p className="error-msg">LINE連携の初期設定が完了していません。通知先登録と送信は設定完了後にご利用いただけます。</p>}
      <details style={{ margin: '20px 0' }} open>
        <summary style={{ fontWeight: 700 }}>通知先の登録方法</summary>
        <ol style={{ lineHeight: 1.9, paddingLeft: 24 }}>
          <li>ご自身のLINEで <a className="brand" href="https://line.me/R/ti/p/%40773bgnjo" target="_blank" rel="noopener noreferrer">@773bgnjo を友だち追加</a>し、1対1のトークに「通知登録」と送信します。</li>
          <li>本番用の運営グループに公式アカウントを招待し、そのグループ内でも「通知登録」と送信します。</li>
          <li>この画面で「宛先を再読み込み」を押し、表示された名前からそれぞれの宛先を選んで保存します。</li>
        </ol>
      </details>
      <fieldset disabled={busy || loading} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="grid">
          <label><div style={{ marginBottom: 8, fontWeight: 700 }}>テスト用の個人宛先</div>
            <select className="select" value={settings.testTargetId || ''} onChange={e => update({ testTargetId: e.target.value || null })}>
              <option value="">個人のLINEを選択</option>
              {destinations.filter(d => d.type === 'user').map(d => <option key={d.id} value={d.id}>{d.name}（…{d.id.slice(-6)}）</option>)}
            </select>
          </label>
          <label><div style={{ marginBottom: 8, fontWeight: 700 }}>本番用の運営グループ</div>
            <select className="select" value={settings.productionTargetId || ''} onChange={e => update({ productionTargetId: e.target.value || null })}>
              <option value="">運営グループを選択</option>
              {destinations.filter(d => d.type === 'group').map(d => <option key={d.id} value={d.id}>{d.name}（…{d.id.slice(-6)}）</option>)}
            </select>
          </label>
          <label><div style={{ marginBottom: 8, fontWeight: 700 }}>朝の変更通知モード</div>
            <select className="select" value={settings.mode} onChange={e => update({ mode: e.target.value as Settings['mode'] })}>
              <option value="TEST">テスト（朝の自動通知を停止）</option>
              <option value="PRODUCTION">本番（運営グループへ1日1回通知）</option>
            </select>
          </label>
          <p className="subtitle">朝の変更通知を本番モードにすると、前日までの未通知の変更を翌朝9時台にまとめます。変更がない日は送りません。</p>
          <div style={{ borderTop: '1px solid #eef2f7', paddingTop: 14 }}>
            <div style={{ fontWeight: 700 }}>前日夜の稽古案内（画像）</div>
            <p className="subtitle" style={{ lineHeight: 1.7 }}>翌日に稽古がある日の20時台に、日別参照の画像を運営グループへ送ります。朝の変更通知とは別に設定できます。</p>
            <button className="secondary" disabled={dirty || !settings.testTargetId || !connected} onClick={testRehearsalImage}>
              稽古案内の画像を個人宛にテスト送信
            </button>
            <p className="subtitle">明日以降で最初に予定されている稽古日の画像を送ります。見え方を確認してからグループへの配信を有効にしてください。</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <input type="checkbox" checked={settings.rehearsalImageEnabled} disabled={!settings.productionTargetId}
                onChange={e => update({ rehearsalImageEnabled: e.target.checked })} />
              運営グループへ前日夜の画像通知を送る
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="primary" disabled={!dirty} onClick={save}>設定を保存</button>
            <button className="secondary" disabled={dirty || !settings.testTargetId || !connected} onClick={() => test('SAMPLE')}>個人宛にテスト送信</button>
            <button className="secondary" disabled={dirty || !settings.testTargetId || !connected} onClick={() => test('CHANGES')}>実際の変更を個人宛にテスト送信</button>
            <button className="secondary" disabled={dirty} onClick={load}>宛先を再読み込み</button>
          </div>
        </div>
      </fieldset>
      {loading && <p role="status">読み込み中…</p>}
      {busy && <p role="status">処理中…</p>}
      {message && <p role="status" style={{ marginTop: 20, lineHeight: 1.8 }}>{message}</p>}
    </div>
  </Shell>;
}
