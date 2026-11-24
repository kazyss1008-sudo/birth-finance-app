'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import styles from './login.module.css';
import editor from '@/components/ScheduleCards.module.css';
import { CastNav } from '@/components/CastNav';
import { CastLogout } from '@/components/CastLogout';
import { ScheduleCards } from '@/components/ScheduleCards';

type Rehearsal = { id: string; performanceId: string; date: string; startTime: string; endTime: string; location: string; memo: string | null };
type Cast = { id: string; performanceId: string; name: string; roleName: string; sortOrder: number };
type CastSchedule = { id: string; castId: string; rehearsalId: string; performanceId: string; status: 'UNDECIDED' | 'OK' | 'NG' | 'TIME_LIMITED'; availableFrom: string | null; availableTo: string | null; memo: string | null };
type Performance = { id: string; name: string };

export default function CastNGPage() {
  const { id: perfId, castId } = useParams<{ id: string; castId: string }>();
  const [showSchedule,setShowSchedule]=useState(false);
  useEffect(()=>{setShowSchedule(new URLSearchParams(location.search).get('view')==='schedule');},[]);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [cast, setCast] = useState<Cast | null>(null);
  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([]);
  const [schedules, setSchedules] = useState<CastSchedule[]>([]);
  const [localSchedules, setLocalSchedules] = useState<Record<string, { status: string; from: string; to: string; memo: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const localSchedulesRef = useRef(localSchedules);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersions = useRef<Record<string, number>>({});
  const blocked = useRef(false);
  useEffect(() => () => { Object.values(saveTimers.current).forEach(clearTimeout); }, []);

  const loadAll = useCallback(async () => {
    try {
      const query = new URLSearchParams({ performanceId: perfId });
      if (castId) query.set('castId', castId);
      const res = await fetch(`/api/cast/grid?${query}`);
      if (res.status === 401 || res.status === 403) {
        setNeedsLogin(true); setCast(null); setPerf(null);
        const info = await fetch(`/api/cast/login-info?${query}`);
        const data = await info.json();
        if (!info.ok) { setErr(data.error || '公演情報を読み込めませんでした'); return; }
        setPerf(data.performance);
        return;
      }
      if (!res.ok) throw new Error();
      setNeedsLogin(false);
      const data = await res.json();
      setPerf(data.performance);
      setRehearsals(data.rehearsals);
      setSchedules(data.schedules);
      const c = castId ? data.casts.find((c: Cast) => c.id === castId) : data.casts[0];
      setCast(c ?? null);
    } catch { setErr('データの読み込みに失敗しました'); }
    finally { setLoading(false); }
  }, [perfId, castId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Build local schedules when data loads
  useEffect(() => {
    if (!cast || rehearsals.length === 0) return;
    const map: Record<string, { status: string; from: string; to: string; memo: string }> = {};
    for (const r of rehearsals) {
      const existing = schedules.find(s => s.castId === cast.id && s.rehearsalId === r.id);
      map[r.id] = existing
        ? { status: existing.status, from: existing.availableFrom ?? '', to: existing.availableTo ?? '', memo: existing.memo ?? '' }
        : { status: 'UNDECIDED', from: '', to: '', memo: '' };
    }
    localSchedulesRef.current = map;
    setLocalSchedules(map);
  }, [cast, schedules, rehearsals]);

  function saveCell(rehearsalId: string) {
    const version = saveVersions.current[rehearsalId];
    const updated = { ...localSchedulesRef.current[rehearsalId] };
    const actorId = cast?.id;
    const run = async () => {
      // One save at a time for this cast, even across different rehearsal cards.
      // Superseded queued values are skipped; the latest edit has its own queued save.
      if (blocked.current || saveVersions.current[rehearsalId] !== version) return;
      try {
        const res = await fetch('/api/cast/schedules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ castId: actorId, rehearsalId, status: updated.status,
            availableFrom: updated.status === 'TIME_LIMITED' ? (updated.from || null) : null,
            availableTo: updated.status === 'TIME_LIMITED' ? (updated.to || null) : null, memo: updated.memo || null }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (res.status === 401) {
            blocked.current = true;
            Object.values(saveTimers.current).forEach(clearTimeout);
            setSaving({}); setNeedsLogin(true);
            setErr('ログインの有効期限が切れました。再ログイン後、未保存だった日の内容をご確認ください');
          }
          throw new Error(data?.error || '保存できませんでした。時間をおいて「再保存」を押してください');
        }
        if (saveVersions.current[rehearsalId] === version) setSaveErrors(prev => { const next = { ...prev }; delete next[rehearsalId]; return next; });
      } catch (error) {
        if (saveVersions.current[rehearsalId] === version) setSaveErrors(prev => ({ ...prev,
          [rehearsalId]: error instanceof TypeError ? '通信に失敗しました。接続を確認して「再保存」を押してください' : error instanceof Error ? error.message : '保存できませんでした。「再保存」を押してください' }));
      } finally {
        if (saveVersions.current[rehearsalId] === version) setSaving(prev => ({ ...prev, [rehearsalId]: false }));
      }
    };
    saveQueue.current = saveQueue.current.then(run, run);
  }

  function updateAndSave(rehearsalId: string, field: string, value: string) {
    saveVersions.current[rehearsalId] = (saveVersions.current[rehearsalId] || 0) + 1;
    setSaving(prev => ({ ...prev, [rehearsalId]: true }));
    const updated = { ...localSchedulesRef.current[rehearsalId], [field]: value };
    localSchedulesRef.current = { ...localSchedulesRef.current, [rehearsalId]: updated };
    setLocalSchedules(localSchedulesRef.current);
    setSaveErrors(prev => { const next = { ...prev }; delete next[rehearsalId]; return next; });
    if (saveTimers.current[rehearsalId]) clearTimeout(saveTimers.current[rehearsalId]);
    saveTimers.current[rehearsalId] = setTimeout(() => saveCell(rehearsalId), field === 'memo' ? 500 : 250);
  }

  function clearAndSave(rehearsalId: string, field: string) { updateAndSave(rehearsalId, field, ''); }

  function retrySave(rehearsalId: string) {
    saveVersions.current[rehearsalId] = (saveVersions.current[rehearsalId] || 0) + 1;
    setSaving(prev => ({ ...prev, [rehearsalId]: true }));
    if (saveTimers.current[rehearsalId]) clearTimeout(saveTimers.current[rehearsalId]);
    saveCell(rehearsalId);
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (Object.values(saving).some(Boolean) || Object.keys(saveErrors).length) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving, saveErrors]);

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7ff' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>読み込み中...</div>
    </div>
  );

  if (needsLogin) return (
    <main className={`container ${styles.page}`}>
      <header className={`card ${styles.header}`}>
        <Image src="/logo.png" alt="劇団Birth" width={56} height={56} className={styles.logo} priority />
        <div>
          <p className={styles.eyebrow}>BIRTH MANAGEMENT SYSTEM</p>
          <h1 className={styles.appTitle}>劇団Birth マイページ</h1>
        </div>
      </header>
      <div className="grid-2">
        <section className={`card ${styles.intro}`} aria-label="対象公演">
          <p className={styles.label}>公演名</p>
          <h2 className={styles.performanceName}>{perf?.name || '公演情報を確認できませんでした'}</h2>
          <p className={styles.description}>キャストの皆さまへ<br />こちらは本公演専用のマイページです。<br />スケジュール登録と自分のチケット管理をご利用いただけます。</p>
        </section>
        <section className={`card ${styles.form}`}>
          <h2 className={styles.formTitle}>キャスト用ログイン</h2>
          <p className={styles.help}>劇団に登録したメールアドレスと、案内されたパスワードでログインしてください。</p>
        <form onSubmit={async e => {
          e.preventDefault(); setLoggingIn(true); setErr('');
          await saveQueue.current;
          try {
            const response = await fetch('/api/cast/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ performanceId: perfId, castId, email, password }) });
            const data = await response.json();
            if (!response.ok) { setErr(data.error || 'ログインできませんでした'); return; }
            setShowSchedule(false); window.history.replaceState(null,'',`/performances/${perfId}/cast`); blocked.current = false; setPassword(''); setSaveErrors({}); setSaving({}); await loadAll();
          } catch { setErr('通信エラー。もう一度お試しください'); }
          finally { setLoggingIn(false); }
        }}>
          <div className="grid">
            <label>
              <span className={styles.fieldLabel}>メールアドレス</span>
              <input className="input" type="email" autoComplete="username" placeholder="メールアドレスを入力" value={email} onChange={e => setEmail(e.target.value)} required />
            </label>
            <label>
              <span className={styles.fieldLabel}>パスワード</span>
              <input className="input" type="password" autoComplete="current-password" placeholder="パスワードを入力" value={password} onChange={e => setPassword(e.target.value)} required />
            </label>
            {err && <div className="error-msg" role="alert">{err}</div>}
            <button className="primary" disabled={loggingIn || !perf}>{loggingIn ? 'ログイン中…' : 'ログイン'}</button>
          </div>
        </form>
        <p className={styles.contact}>パスワードが分からない場合は劇団へお問い合わせください。</p>
        </section>
      </div>
      <footer className={styles.footer}>劇団Birth キャスト用スケジュール</footer>
    </main>
  );

  if (!cast) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7f7ff' }}>
      <div style={{ textAlign: 'center', color: '#dc2626' }}>{err || 'キャストが見つかりません'}</div>
    </div>
  );

  return (
    <div style={{ background: '#f7f7ff', minHeight: '100vh' }}>
      <div className={editor.page}>
        {/* Header */}
        <div style={{ background: 'white', borderRadius: 24, padding: '20px 24px', boxShadow: '0 12px 30px rgba(61,72,152,0.08)', marginBottom: 16 }}>
          <CastLogout id={perfId} disabled={Object.values(saving).some(Boolean)} onLogout={async () => {
            blocked.current = true;
            Object.values(saveTimers.current).forEach(clearTimeout);
            await saveQueue.current;
            try {
              const response = await fetch('/api/cast/logout', { method: 'POST' });
              if (!response.ok) throw new Error('ログアウトできませんでした');
              setCast(null); setSchedules([]); setLocalSchedules({}); localSchedulesRef.current = {}; setSaveErrors({}); setNeedsLogin(true);
            } catch (error) { blocked.current = false; throw error; }
          }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div className={editor.identity}>
              <Image src="/logo.png" alt="劇団Birth" width={40} height={40} style={{ height: 40, width: 'auto', objectFit: 'contain' }} priority />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: '#e74c3c' }}>BIRTH MANAGEMENT SYSTEM</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#153b96' }}>{cast.name} 様</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {perf?.name} — {showSchedule?'スケジュール登録':'マイページ'}
                  {cast.roleName && <span style={{ marginLeft: 8 }}>役: {cast.roleName}</span>}
                </div>
              </div>
            </div>
            <a href="/cast-guide.html" target="_blank" rel="noopener noreferrer"
              style={{ background: '#edf2ff', color: '#153b96', border: 'none', borderRadius: 16, padding: '8px 14px', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              📖 入力ガイド
            </a>
          </div>
        </div>

        {err && <div role="alert" style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontWeight: 700, marginBottom: 12 }}>{err}</div>}

        {showSchedule&&<CastNav id={perfId} active="schedule"/>}
        {!showSchedule&&<div className="grid grid-2"><a className="cast-menu-card" href={`/performances/${perfId}/cast?view=schedule`}><h2>スケジュール登録</h2><p>稽古の参加可否を登録・変更する</p></a><a className="cast-menu-card" href={`/performances/${perfId}/cast/tickets`}><h2>チケット管理</h2><p>自分扱いの予約・販売URLを確認する</p></a></div>}
        {showSchedule&&<ScheduleCards rehearsals={rehearsals} values={localSchedules} saving={saving} errors={saveErrors}
          onChange={updateAndSave} onClear={clearAndSave} onRetry={retrySave} />}

        {/* Footer */}
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 12 }}>
          劇団Birth 稽古スケジュール管理
        </div>
      </div>
    </div>
  );
}
