'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/Shell';

/* ---------- types ---------- */

interface Stage {
  stageNo: number;
  stageName: string;
  stageDate: string;
  sortOrder: number;
}

interface Cast {
  name: string;
  normaTicketCount: number | '';
  normaUnitPrice: number | '';
  isTicketBackTarget: boolean;
}

interface TicketBackRule {
  stepNo: number;
  minTicketCount: number | '';
  maxTicketCount: number | '' | null;
  backUnitPrice: number | '';
}

interface BasicInfo {
  name: string;
  startDate: string;
  endDate: string;
  stageCount: number | '';
  defaultNormaUnitPrice: number | '';
}

/* ---------- helpers ---------- */

/** Arrow key navigation: move focus to the same column input in the adjacent row */
function handleGridKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const input = e.currentTarget;
  const row = input.closest('[data-row]');
  if (!row) return;
  const container = row.parentElement;
  if (!container) return;
  const rows = Array.from(container.querySelectorAll('[data-row]'));
  const rowIdx = rows.indexOf(row);
  const inputs = Array.from(row.querySelectorAll('input'));
  const colIdx = inputs.indexOf(input);
  const targetRowIdx = e.key === 'ArrowDown' ? rowIdx + 1 : rowIdx - 1;
  if (targetRowIdx < 0 || targetRowIdx >= rows.length) return;
  const targetInputs = Array.from(rows[targetRowIdx].querySelectorAll('input'));
  if (colIdx < targetInputs.length) {
    e.preventDefault();
    (targetInputs[colIdx] as HTMLInputElement).focus();
  }
}

const STEP_LABELS = ['公演基本情報', 'ステージ登録', 'キャスト登録', 'チケットバックルール'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {STEP_LABELS.map((label, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 9999,
              fontSize: 13,
              fontWeight: 700,
              background: active ? '#153b96' : done ? '#d1fae5' : '#edf2ff',
              color: active ? '#fff' : done ? '#065f46' : '#153b96',
            }}
          >
            <span>{done ? '✓' : `${i + 1}`}</span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function NavButtons({
  step,
  onPrev,
  onNext,
  onSave,
  saving,
}: {
  step: number;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
      {step > 0 && (
        <button type="button" className="secondary" onClick={onPrev}>
          戻る
        </button>
      )}
      {step < 3 && (
        <button type="button" className="primary" onClick={onNext}>
          次へ
        </button>
      )}
      {step === 3 && (
        <button type="button" className="primary" onClick={onSave} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      )}
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span style={{ color: '#dc2626', fontSize: 12, marginTop: 4, display: 'block' }}>{msg}</span>;
}

/* ---------- main component ---------- */

export default function NewPerformancePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  // Step 1
  const [basic, setBasic] = useState<BasicInfo>({
    name: '',
    startDate: '',
    endDate: '',
    stageCount: '',
    defaultNormaUnitPrice: '',
  });

  // Step 2
  const [stages, setStages] = useState<Stage[]>([]);
  const [stagesInitialized, setStagesInitialized] = useState(false);

  // Step 3
  const [casts, setCasts] = useState<Cast[]>([{ name: '', normaTicketCount: '', normaUnitPrice: '', isTicketBackTarget: true }]);

  // Step 4
  const [rules, setRules] = useState<TicketBackRule[]>([{ stepNo: 1, minTicketCount: '', maxTicketCount: '', backUnitPrice: '' }]);

  /* ---- validation ---- */

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!basic.name.trim()) e['name'] = '公演名は必須です';
      if (basic.stageCount !== '' && Number(basic.stageCount) < 0) e['stageCount'] = '0以上を入力してください';
      if (basic.defaultNormaUnitPrice !== '' && Number(basic.defaultNormaUnitPrice) < 0) e['defaultNormaUnitPrice'] = '0以上を入力してください';
      if (basic.startDate && basic.endDate && basic.startDate > basic.endDate) e['endDate'] = '終了日は開始日以降にしてください';
    }
    if (s === 1) {
      stages.forEach((st, i) => {
        if (!st.stageName.trim()) e[`stage_name_${i}`] = 'ステージ名は必須です';
      });
    }
    if (s === 2) {
      casts.forEach((c, i) => {
        if (!c.name.trim()) e[`cast_name_${i}`] = 'キャスト名は必須です';
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ---- navigation ---- */

  function goNext() {
    if (!validateStep(step)) return;
    // When moving from step 0 to step 1, pre-populate stages if not yet done
    if (step === 0 && !stagesInitialized) {
      const count = Number(basic.stageCount) || 0;
      if (count > 0) {
        setStages(
          Array.from({ length: count }, (_, i) => ({
            stageNo: i + 1,
            stageName: '',
            stageDate: '',
            sortOrder: i + 1,
          }))
        );
      }
      setStagesInitialized(true);
    }
    // When moving from step 1 to step 2, pre-fill normaUnitPrice for new casts
    if (step === 1) {
      setCasts((prev) =>
        prev.map((c) => ({
          ...c,
          normaUnitPrice: c.normaUnitPrice === '' ? (basic.defaultNormaUnitPrice || '') : c.normaUnitPrice,
        }))
      );
    }
    setStep((s) => s + 1);
  }

  function goPrev() {
    setErrors({});
    setStep((s) => s - 1);
  }

  /* ---- save ---- */

  async function handleSave() {
    if (!validateStep(step)) return;
    setSaving(true);
    setApiError('');

    const body = {
      name: basic.name,
      startDate: basic.startDate || null,
      endDate: basic.endDate || null,
      stageCount: Number(basic.stageCount) || 0,
      defaultNormaUnitPrice: Number(basic.defaultNormaUnitPrice) || 0,
      stages: stages.map((s, i) => ({
        stageNo: s.stageNo,
        stageName: s.stageName,
        stageDate: s.stageDate || null,
        sortOrder: i + 1,
      })),
      casts: casts.map((c) => ({
        name: c.name,
        normaTicketCount: Number(c.normaTicketCount) || 0,
        normaUnitPrice: Number(c.normaUnitPrice) || 0,
        isTicketBackTarget: c.isTicketBackTarget,
      })),
      ticketBackRules: rules.map((r, i) => ({
        stepNo: i + 1,
        minTicketCount: Number(r.minTicketCount) || 0,
        maxTicketCount: r.maxTicketCount === '' || r.maxTicketCount === null ? null : Number(r.maxTicketCount),
        backUnitPrice: Number(r.backUnitPrice) || 0,
      })),
    };

    try {
      const res = await fetch('/api/performances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      router.push('/performances');
    } catch (err: unknown) {
      setApiError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  /* ---- stage helpers ---- */

  function updateStage(index: number, field: keyof Stage, value: string) {
    setStages((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      { stageNo: prev.length + 1, stageName: '', stageDate: '', sortOrder: prev.length + 1 },
    ]);
  }

  function removeStage(index: number) {
    setStages((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stageNo: i + 1, sortOrder: i + 1 })));
  }

  /* ---- cast helpers ---- */

  function updateCast(index: number, field: keyof Cast, value: string | number | boolean) {
    setCasts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function addCast() {
    setCasts((prev) => [
      ...prev,
      { name: '', normaTicketCount: '', normaUnitPrice: basic.defaultNormaUnitPrice || '', isTicketBackTarget: true },
    ]);
  }

  function removeCast(index: number) {
    setCasts((prev) => prev.filter((_, i) => i !== index));
  }

  /* ---- rule helpers ---- */

  function updateRule(index: number, field: keyof TicketBackRule, value: string | number | null) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRule() {
    setRules((prev) => [...prev, { stepNo: prev.length + 1, minTicketCount: '', maxTicketCount: '', backUnitPrice: '' }]);
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, stepNo: i + 1 })));
  }

  /* ---- render steps ---- */

  function renderStep0() {
    return (
      <div className="card">
        <span className="badge">Step 1 / 4</span>
        <h2 className="brand" style={{ margin: '12px 0 16px' }}>公演基本情報</h2>
        <div className="grid-2">
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>
              公演名 <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              className="input"
              placeholder="例: 春の本公演 2026"
              value={basic.name}
              onChange={(e) => setBasic({ ...basic, name: e.target.value })}
            />
            <FieldError msg={errors['name']} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>ステージ数</label>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="例: 4"
              value={basic.stageCount}
              onChange={(e) => setBasic({ ...basic, stageCount: e.target.value === '' ? '' : Number(e.target.value) })}
            />
            <FieldError msg={errors['stageCount']} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>開始日</label>
            <input
              className="input"
              type="date"
              value={basic.startDate}
              onChange={(e) => setBasic({ ...basic, startDate: e.target.value })}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>終了日</label>
            <input
              className="input"
              type="date"
              value={basic.endDate}
              onChange={(e) => setBasic({ ...basic, endDate: e.target.value })}
            />
            <FieldError msg={errors['endDate']} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, display: 'block' }}>デフォルトノルマ単価</label>
            <input
              className="input"
              type="number"
              min={0}
              placeholder="例: 3500"
              value={basic.defaultNormaUnitPrice}
              onChange={(e) => setBasic({ ...basic, defaultNormaUnitPrice: e.target.value === '' ? '' : Number(e.target.value) })}
            />
            <FieldError msg={errors['defaultNormaUnitPrice']} />
          </div>
        </div>
      </div>
    );
  }

  function renderStep1() {
    return (
      <div className="card">
        <span className="badge">Step 2 / 4</span>
        <h2 className="brand" style={{ margin: '12px 0 16px' }}>ステージ登録</h2>
        {stages.length === 0 ? (
          <p className="subtitle">ステージがありません。行を追加してください。</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {stages.map((s, i) => (
              <div key={i} data-row style={{ display: 'grid', gridTemplateColumns: '32px 1fr 140px 28px', gap: 6, alignItems: 'center', background: '#f8faff', borderRadius: 12, padding: '8px 10px' }}>
                <span style={{ fontWeight: 900, color: '#153b96', fontSize: 14, textAlign: 'center' }}>{s.stageNo}</span>
                <div>
                  <input className="input" placeholder="ステージ名" value={s.stageName} onChange={(e) => updateStage(i, 'stageName', e.target.value)} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} />
                  <FieldError msg={errors[`stage_name_${i}`]} />
                </div>
                <input className="input" type="date" value={s.stageDate} onChange={(e) => updateStage(i, 'stageDate', e.target.value)} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} />
                <button type="button" onClick={() => removeStage(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: 16 }} title="削除">×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={addStage}>
            + 行追加
          </button>
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="card">
        <span className="badge">Step 3 / 4</span>
        <h2 className="brand" style={{ margin: '12px 0 16px' }}>キャスト登録</h2>
        {casts.length === 0 ? (
          <p className="subtitle">キャストがありません。行を追加してください。</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {casts.map((c, i) => (
              <div key={i} data-row style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 32px 28px', gap: 6, alignItems: 'center', background: '#f8faff', borderRadius: 12, padding: '8px 10px' }}>
                <div>
                  <input className="input" placeholder="キャスト名" value={c.name} onChange={(e) => updateCast(i, 'name', e.target.value)} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} />
                  <FieldError msg={errors[`cast_name_${i}`]} />
                </div>
                <input className="input" type="number" min={0} placeholder="ノルマ枚" value={c.normaTicketCount} onChange={(e) => updateCast(i, 'normaTicketCount', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} title="ノルマ枚数" />
                <input className="input" type="number" min={0} placeholder="単価" value={c.normaUnitPrice} onChange={(e) => updateCast(i, 'normaUnitPrice', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} title="ノルマ単価" />
                <input type="checkbox" checked={c.isTicketBackTarget} onChange={(e) => updateCast(i, 'isTicketBackTarget', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#153b96', cursor: 'pointer' }} title="バック対象" />
                <button type="button" onClick={() => removeCast(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: 16 }} title="削除">×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={addCast}>
            + 行追加
          </button>
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="card">
        <span className="badge">Step 4 / 4</span>
        <h2 className="brand" style={{ margin: '12px 0 16px' }}>チケットバックルール</h2>
        <p className="subtitle" style={{ marginBottom: 12 }}>
          枚数に応じたバック単価を段階的に設定します。最大枚数を空欄にすると「上限なし」になります。
        </p>
        {rules.length === 0 ? (
          <p className="subtitle">ルールがありません。行を追加してください。</p>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {rules.map((r, i) => (
              <div key={i} data-row style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 1fr 28px', gap: 6, alignItems: 'center', background: '#f8faff', borderRadius: 12, padding: '8px 10px' }}>
                <span style={{ fontWeight: 900, color: '#153b96', fontSize: 14, textAlign: 'center' }}>{r.stepNo}</span>
                <input className="input" type="number" min={0} placeholder="最小枚数" value={r.minTicketCount} onChange={(e) => updateRule(i, 'minTicketCount', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} title="最小枚数" />
                <input className="input" type="number" min={0} placeholder="最大(空=∞)" value={r.maxTicketCount ?? ''} onChange={(e) => updateRule(i, 'maxTicketCount', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} title="最大枚数" />
                <input className="input" type="number" min={0} placeholder="単価" value={r.backUnitPrice} onChange={(e) => updateRule(i, 'backUnitPrice', e.target.value === '' ? '' : Number(e.target.value))} onKeyDown={handleGridKeyDown} style={{ padding: '8px 10px', borderRadius: 10 }} title="バック単価" />
                <button type="button" onClick={() => removeRule(i)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: 16 }} title="削除">×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="secondary" onClick={addRule}>
            + 行追加
          </button>
        </div>
      </div>
    );
  }

  /* ---- main render ---- */

  return (
    <Shell
      title="新規公演作成"
      subtitle="ウィザード形式で公演情報を登録します。"
      actions={
        <Link href="/performances" className="secondary">
          一覧に戻る
        </Link>
      }
    >
      <StepIndicator current={step} />

      {apiError && (
        <div
          className="card"
          style={{ background: '#fef2f2', borderLeft: '4px solid #dc2626', marginBottom: 16, color: '#dc2626', fontWeight: 700 }}
        >
          {apiError}
        </div>
      )}

      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}

      <NavButtons step={step} onPrev={goPrev} onNext={goNext} onSave={handleSave} saving={saving} />
    </Shell>
  );
}
