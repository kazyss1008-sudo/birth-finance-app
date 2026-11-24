'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import html2canvas from 'html2canvas';
import { Shell } from '@/components/Shell';
import { ScheduleCards, type ScheduleDraft } from '@/components/ScheduleCards';
import Link from 'next/link';
import gridStyles from './grid.module.css';
import { makeDayCard } from '@/lib/day-attendance';
import { RehearsalDayCard } from '@/components/RehearsalDayCard';

type Performance = { id: string; name: string; startDate: string | null; endDate: string | null; status: string };
type Rehearsal = { id: string; performanceId: string; date: string; startTime: string; endTime: string; location: string; memo: string | null; sortOrder: number };
type Cast = { id: string; performanceId: string; name: string; roleName: string; sortOrder: number };
type CastSchedule = { id: string; castId: string; rehearsalId: string; performanceId: string; status: 'UNDECIDED' | 'OK' | 'NG' | 'TIME_LIMITED'; availableFrom: string | null; availableTo: string | null; memo: string | null };

const TABS = ['一覧表', '日別参照', 'NG表更新', 'URL配布'] as const;
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJP(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日(${DAY_NAMES[d.getDay()]})`;
}

export default function PerformanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [perf, setPerf] = useState<Performance | null>(null);
  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([]);
  const [casts, setCasts] = useState<Cast[]>([]);
  const [schedules, setSchedules] = useState<CastSchedule[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [ngDirty, setNgDirty] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch(`/api/performances/${id}/schedule-grid`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPerf(data.performance);
      setRehearsals(data.rehearsals);
      setCasts(data.casts);
      setSchedules(data.schedules);
    } catch { setErr('データの読み込みに失敗しました'); }
  }, [id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  function flash(m: string) { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 2000); }
  function flashErr(m: string) { setErr(m); setMsg(''); }

  if (!perf) return <div className="container"><div className="card" style={{ textAlign: 'center', padding: 48 }}>読み込み中...</div></div>;

  return (
    <Shell
      title={perf.name}
      subtitle={perf.startDate ? `${perf.startDate} 〜 ${perf.endDate ?? ''}` : '稽古スケジュール管理'}
      actions={<>
        <Link href="/performances" className="secondary" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>← 公演一覧</Link>
      </>}
    >
      {msg && <div className="success-msg" style={{ marginBottom: 12 }}>{msg}</div>}
      {err && <div className="error-msg" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="card">
        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={t} disabled={ngDirty && tab !== i} className={`tab${tab === i ? ' active' : ''}`} onClick={() => {
              setTab(i);
              loadAll();
            }}>{t}</button>
          ))}
        </div>

        {tab === 0 && <GridTab rehearsals={rehearsals} casts={casts} schedules={schedules} />}
        {tab === 1 && <DayTab rehearsals={rehearsals} casts={casts} schedules={schedules} />}
        {tab === 2 && <NGTab perfId={id} rehearsals={rehearsals} casts={casts} schedules={schedules} onSaved={saved => setSchedules(prev => [...prev.filter(s => s.castId !== saved.castId || s.rehearsalId !== saved.rehearsalId), saved])} onDirtyChange={setNgDirty} />}
        {tab === 3 && <CastUrlTab perfId={id} casts={casts} />}

      </div>
    </Shell>
  );
}

/* ===== Tab 3: NG表（キャスト別スケジュール登録） ===== */
function NGTab({ perfId, rehearsals, casts, schedules, onSaved, onDirtyChange }: {
  perfId: string; rehearsals: Rehearsal[]; casts: Cast[]; schedules: CastSchedule[];
  onSaved: (saved: CastSchedule) => void; onDirtyChange: (dirty: boolean) => void;
}) {
  const [selectedCast, setSelectedCast] = useState(casts[0]?.id ?? '');
  const [localSchedules, setLocalSchedules] = useState<Record<string, ScheduleDraft>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const latest = useRef(localSchedules);
  const drafts = useRef<Record<string, Record<string, ScheduleDraft>>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const versions = useRef<Record<string, number>>({});
  const queue = useRef<Promise<void>>(Promise.resolve());
  const cancelled = useRef(false);
  const busy = Object.values(saving).some(Boolean) || Object.keys(saveErrors).length > 0;

  useEffect(() => {
    const map: Record<string, ScheduleDraft> = {};
    for (const r of rehearsals) {
      const existing = schedules.find(s => s.castId === selectedCast && s.rehearsalId === r.id);
      map[r.id] = drafts.current[selectedCast]?.[r.id] ?? (existing
        ? { status: existing.status, from: existing.availableFrom ?? '', to: existing.availableTo ?? '', memo: existing.memo ?? '' }
        : { status: 'UNDECIDED', from: '', to: '', memo: '' });
    }
    latest.current = map; setLocalSchedules(map);
  }, [selectedCast, rehearsals, schedules]);

  useEffect(() => { onDirtyChange(busy); }, [busy, onDirtyChange]);
  useEffect(() => {
    cancelled.current = false;
    return () => { cancelled.current = true; Object.values(timers.current).forEach(clearTimeout); onDirtyChange(false); };
  }, [onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  function saveCell(rehearsalId: string) {
    const actorId = selectedCast;
    const version = versions.current[rehearsalId];
    const value = { ...latest.current[rehearsalId] };
    const run = async () => {
      if (cancelled.current || versions.current[rehearsalId] !== version) return;
      const data = { castId: actorId, rehearsalId, status: value.status as CastSchedule['status'],
        availableFrom: value.status === 'TIME_LIMITED' ? value.from || null : null,
        availableTo: value.status === 'TIME_LIMITED' ? value.to || null : null, memo: value.memo || null };
      try {
        const res = await fetch(`/api/performances/${perfId}/cast-schedules`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        const result = await res.json().catch(() => null);
        if (!res.ok || !result?.id) throw new Error(result?.error || '保存できませんでした。時間をおいて「再保存」を押してください');
        if (versions.current[rehearsalId] === version) {
          delete drafts.current[actorId]?.[rehearsalId];
          setSaveErrors(prev => { const next = { ...prev }; delete next[rehearsalId]; return next; });
        }
        onSaved({ ...data, id: String(result.id), performanceId: perfId });
      } catch (error) {
        if (versions.current[rehearsalId] === version) setSaveErrors(prev => ({ ...prev,
          [rehearsalId]: error instanceof TypeError ? '通信に失敗しました。接続を確認して「再保存」を押してください' : error instanceof Error ? error.message : '保存できませんでした。「再保存」を押してください' }));
      } finally {
        if (versions.current[rehearsalId] === version) setSaving(prev => ({ ...prev, [rehearsalId]: false }));
      }
    };
    queue.current = queue.current.then(run, run);
  }
  function updateAndSave(id: string, field: string, value: string) {
    versions.current[id] = (versions.current[id] || 0) + 1;
    const updated = { ...latest.current[id], [field]: value };
    latest.current = { ...latest.current, [id]: updated };
    drafts.current[selectedCast] = { ...drafts.current[selectedCast], [id]: updated };
    setLocalSchedules(latest.current); setSaving(prev => ({ ...prev, [id]: true }));
    setSaveErrors(prev => { const next = { ...prev }; delete next[id]; return next; });
    if (timers.current[id]) clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => saveCell(id), field === 'memo' ? 500 : 250);
  }
  function retrySave(id: string) {
    versions.current[id] = (versions.current[id] || 0) + 1;
    setSaving(prev => ({ ...prev, [id]: true }));
    if (timers.current[id]) clearTimeout(timers.current[id]);
    saveCell(id);
  }
  if (!casts.length || !rehearsals.length) return <p className="subtitle" style={{ textAlign: 'center', padding: 24 }}>先にキャストと稽古日程を登録してください</p>;
  const castObj = casts.find(c => c.id === selectedCast);
  return <div style={{ minWidth: 0 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
      <h2 className="brand" style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>キャスト別スケジュール</h2>
      <label style={{ flex: '1 1 220px', maxWidth: 340, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>入力するキャスト</span>
        <select className="select" aria-label="入力するキャスト" value={selectedCast} disabled={busy} onChange={e => setSelectedCast(e.target.value)} style={{ fontSize: 16 }}>
          {casts.map(c => <option key={c.id} value={c.id}>{c.name}{c.roleName ? ` (${c.roleName})` : ''}</option>)}
        </select>
      </label>
      {castObj?.roleName && <span className="badge">役: {castObj.roleName}</span>}
    </div>
    {busy && <p className="subtitle" role="status">保存が完了してからキャストやタブを切り替えてください。</p>}
    <ScheduleCards embedded rehearsals={rehearsals} values={localSchedules} saving={saving} errors={saveErrors}
      onChange={updateAndSave} onClear={(id, field) => updateAndSave(id, field, '')} onRetry={retrySave} />
  </div>;
}

/* ===== Tab: URL配布 ===== */
function CastUrlTab({ perfId }: { perfId: string; casts: Cast[] }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/performances/${perfId}/cast`;
  return <div>
    <h2 className="brand" style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>キャスト用スケジュール 共通ログインURL</h2>
    <p className="subtitle">この公演のキャスト全員に、同じURLを配布できます。登録済みメールアドレスとパスワードでログインすると、ご本人のスケジュールだけを表示します。</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
      <input className="input" aria-label="公演共通のキャスト用ログインURL" readOnly value={url} style={{ flex: '1 1 240px', minWidth: 0 }} onClick={e => e.currentTarget.select()} />
      <button className="secondary" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
        catch { setCopied(false); }
      }}>{copied ? '✓ コピー済' : 'URLをコピー'}</button>
    </div>
    <p className="subtitle">メール・パスワードの登録と案内メールの一括送信は、収支管理アプリのキャスト一覧で行えます。</p>
  </div>;
}

/* ===== Tab 4: 一覧表（全キャスト×全稽古のマトリクス） ===== */
function ScheduleMark({ status }: { status: CastSchedule['status'] }) {
  const label = { OK: 'OK', NG: 'NG', TIME_LIMITED: '時間指定', UNDECIDED: '未定' }[status];
  return <svg className={gridStyles.mark} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={label}>
    {status === 'OK' ? <circle cx="12" cy="12" r="8" />
      : status === 'NG' ? <path d="M5 5 19 19M19 5 5 19" />
      : status === 'TIME_LIMITED' ? <path d="m12 4 9 16H3Z" />
      : <path d="M4 12h16" />}
  </svg>;
}

function GridTab({ rehearsals, casts, schedules }: { rehearsals: Rehearsal[]; casts: Cast[]; schedules: CastSchedule[] }) {
  if (casts.length === 0 || rehearsals.length === 0) {
    return <p className="subtitle" style={{ textAlign: 'center', padding: 24 }}>先にキャストと稽古日程を登録してください</p>;
  }

  const scheduleMap = new Map<string, CastSchedule>();
  for (const s of schedules) scheduleMap.set(`${s.castId}_${s.rehearsalId}`, s);

  // Stats
  const castStats = casts.map(c => {
    let ok = 0, ng = 0, tl = 0, undecided = 0;
    for (const r of rehearsals) {
      const s = scheduleMap.get(`${c.id}_${r.id}`);
      if (!s || s.status === 'UNDECIDED') undecided++;
      else if (s.status === 'OK') ok++;
      else if (s.status === 'NG') ng++;
      else tl++;
    }
    return { ...c, ok, ng, tl, undecided };
  });

  return (
    <div>
      <h2 className="brand" style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>スケジュール一覧</h2>
      <div className={gridStyles.legend}>
        {(['OK', 'NG', 'TIME_LIMITED', 'UNDECIDED'] as const).map(status => (
          <span key={status} className={gridStyles.legendItem}>
            <span className={`${gridStyles.legendMark} ${status === 'OK' ? 'cell-ok' : status === 'NG' ? 'cell-ng' : status === 'TIME_LIMITED' ? 'cell-time' : 'cell-undecided'}`}><ScheduleMark status={status} /></span>
            {{ OK: 'OK', NG: 'NG', TIME_LIMITED: '時間指定', UNDECIDED: '未定' }[status]}
          </span>
        ))}
      </div>
      <div className="responsive-table">
        <table className={`table ${gridStyles.matrix}`}>
          <thead>
            <tr>
              <th className={gridStyles.castHeader}>キャスト</th>
              {rehearsals.map(r => (
                <th key={r.id} className={gridStyles.dateHeader}>
                  {formatDateJP(r.date)}<br />{r.startTime}〜
                </th>
              ))}
              <th className={gridStyles.countHeader}><ScheduleMark status="OK" /></th>
              <th className={gridStyles.countHeader}><ScheduleMark status="NG" /></th>
              <th className={gridStyles.countHeader}><ScheduleMark status="TIME_LIMITED" /></th>
              <th className={gridStyles.countHeader}><ScheduleMark status="UNDECIDED" /></th>
            </tr>
          </thead>
          <tbody>
            {castStats.map(c => (
              <tr key={c.id}>
                <td className={gridStyles.castName}>
                  {c.name}
                  {c.roleName && <span className={gridStyles.roleName}>{c.roleName}</span>}
                </td>
                {rehearsals.map(r => {
                  const s = scheduleMap.get(`${c.id}_${r.id}`);
                  const status = s?.status ?? 'UNDECIDED';
                  const cls = status === 'UNDECIDED' ? 'cell-undecided' : status === 'NG' ? 'cell-ng' : status === 'TIME_LIMITED' ? 'cell-time' : 'cell-ok';
                  const time = status === 'TIME_LIMITED' && (s?.availableFrom || s?.availableTo)
                    ? `${s.availableFrom || ''}〜${s.availableTo || ''}` : null;
                  return <td key={r.id} className={cls} title={s?.memo ?? ''}>
                    {time ? <span className={gridStyles.time}>{time}</span> : <ScheduleMark status={status} />}
                  </td>;
                })}
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#059669' }}>{c.ok}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#dc2626' }}>{c.ng}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#92400e' }}>{c.tl}</td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#6b7280' }}>{c.undecided}</td>
              </tr>
            ))}
            {/* Rehearsal attendance summary row */}
            <tr style={{ background: '#f4f7ff' }}>
              <td style={{ position: 'sticky', left: 0, background: '#f4f7ff', zIndex: 1, fontWeight: 700, color: '#153b96' }}>参加可能数</td>
              {rehearsals.map(r => {
                const available = casts.filter(c => {
                  const s = scheduleMap.get(`${c.id}_${r.id}`);
                  return s?.status === 'OK' || s?.status === 'TIME_LIMITED';
                }).length;
                return <td key={r.id} style={{ textAlign: 'center', fontWeight: 700, color: '#153b96' }}>{available}/{casts.length}</td>;
              })}
              <td colSpan={4}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===== Tab 5: 日別参照 ===== */
function DayTab({ rehearsals, casts, schedules }: { rehearsals: Rehearsal[]; casts: Cast[]; schedules: CastSchedule[] }) {
  const [selectedDate, setSelectedDate] = useState<string>(rehearsals[0]?.date ?? '');
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  if (rehearsals.length === 0) {
    return <p className="subtitle" style={{ textAlign: 'center', padding: 24 }}>先に稽古日程を登録してください</p>;
  }

  const uniqueDates = [...new Set(rehearsals.map(r => r.date))].sort();
  const dayRehearsals = rehearsals.filter(r => r.date === selectedDate);

  const scheduleMap = new Map<string, CastSchedule>();
  for (const s of schedules) scheduleMap.set(`${s.castId}_${s.rehearsalId}`, s);

  async function handleScreenshot() {
    if (!captureRef.current) return;
    setCapturing(true);
    try {
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });
      canvas.toBlob(async (blob: Blob | null) => {
        if (!blob) return;
        const file = new File([blob], `稽古_${formatDateJP(selectedDate)}.png`, { type: 'image/png' });

        // Web Share API（モバイル対応）
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
          } catch { /* cancelled */ }
        } else {
          // フォールバック: ダウンロード
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        }
        setCapturing(false);
      }, 'image/png');
    } catch { setCapturing(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 className="brand" style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>日別参照</h2>
        <select className="select" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ maxWidth: 220 }}>
          {uniqueDates.map(d => <option key={d} value={d}>{formatDateJP(d)}</option>)}
        </select>
        <button className="secondary show-mobile" onClick={handleScreenshot} disabled={capturing}
          style={{ display: 'none', whiteSpace: 'nowrap' }}>
          {capturing ? '作成中...' : '📷 スクショ共有'}
        </button>
      </div>

      <div ref={captureRef}>
      {dayRehearsals.length === 0 ? (
        <p className="subtitle" style={{ textAlign: 'center', padding: 24 }}>この日の稽古はありません</p>
      ) : dayRehearsals.map(r => (
        <div key={r.id} style={{ marginBottom: 16 }}>
          <RehearsalDayCard card={makeDayCard({
            date: r.date, startTime: r.startTime, endTime: r.endTime, location: r.location, memo: r.memo,
          }, casts, c => scheduleMap.get(`${c.id}_${r.id}`))} />
        </div>
      ))}
      </div>
    </div>
  );
}
