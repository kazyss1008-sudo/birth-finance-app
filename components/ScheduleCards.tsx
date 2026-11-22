'use client';
import editor from './ScheduleCards.module.css';

export type ScheduleDraft = { status: string; from: string; to: string; memo: string };
type Rehearsal = { id: string; date: string; startTime: string; endTime: string; location: string };
const days = ['日', '月', '火', '水', '木', '金', '土'];
function formatDateJP(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
}
export function ScheduleCards({ rehearsals, values, saving, errors, onChange, onClear, onRetry, embedded = false }: {
  rehearsals: Rehearsal[]; values: Record<string, ScheduleDraft>; saving: Record<string, boolean>; errors: Record<string, string>;
  onChange: (id: string, field: string, value: string) => void;
  onClear: (id: string, field: string) => void; onRetry: (id: string) => void;
  embedded?: boolean;
}) {
  return (
    <section className={`${editor.section} ${embedded ? editor.embedded : ''}`} aria-labelledby="schedule-heading">
      <div className={editor.sectionHeading}>
        <h2 id="schedule-heading">スケジュール入力</h2>
        <p>変更は自動保存されます。保存中・未保存の表示がないことを確認してから画面を閉じてください。</p>
      </div>
      <div className={editor.list}>
        {rehearsals.map(r => {
          const ls = values[r.id];
          if (!ls) return null;
          return <article key={r.id} className={editor.rehearsal} data-status={ls.status} aria-labelledby={`date-${r.id}`}>
            <div className={editor.rehearsalHeading}>
              <div>
                <h3 id={`date-${r.id}`}>{formatDateJP(r.date)}</h3>
                <p className={editor.rehearsalTime}>{r.startTime}〜{r.endTime}</p>
                <p className={editor.location}>{r.location || '場所未定'}</p>
              </div>
              <span className={editor.saving} data-failed={!!errors[r.id]} role="status">{saving[r.id] ? '保存中…' : errors[r.id] ? '未保存' : ''}</span>
            </div>
            <div className={editor.fields}>
              <div>
                <div className={editor.fieldLabel} id={`status-${r.id}`}>参加可否</div>
                <div className={editor.statusButtons} role="group" aria-labelledby={`status-${r.id}`}>
                  {[{ value: 'OK', label: '○ OK' }, { value: 'NG', label: '✕ NG' }, { value: 'TIME_LIMITED', label: '△ 時間指定' }, { value: 'UNDECIDED', label: 'ー 未定' }].map(option =>
                    <button key={option.value} type="button" aria-pressed={ls.status === option.value} data-status={option.value}
                      onClick={() => { if (ls.status !== option.value) onChange(r.id, 'status', option.value); }}>{option.label}</button>)}
                </div>
              </div>
              {ls.status === 'TIME_LIMITED' && <div className={editor.timeSection}>
                <div className={editor.timeFields}>
                  <div>
                    <label className={editor.fieldLabel} htmlFor={`from-${r.id}`}>遅刻時間</label>
                    <input id={`from-${r.id}`} className={editor.timeInput} type="time" value={ls.from} onChange={e => onChange(r.id, 'from', e.target.value)} />
                    <button type="button" className={editor.clearTime} disabled={!ls.from} onClick={() => onClear(r.id, 'from')}>遅刻時間をクリア</button>
                  </div>
                  <span className={editor.timeSeparator} aria-hidden="true">〜</span>
                  <div>
                    <label className={editor.fieldLabel} htmlFor={`to-${r.id}`}>早退時間</label>
                    <input id={`to-${r.id}`} className={editor.timeInput} type="time" value={ls.to} onChange={e => onChange(r.id, 'to', e.target.value)} />
                    <button type="button" className={editor.clearTime} disabled={!ls.to} onClick={() => onClear(r.id, 'to')}>早退時間をクリア</button>
                  </div>
                </div>
                <p className={editor.hint}>遅れて参加する日は開始時刻だけ、早退する日は終了時刻だけでも登録できます。</p>
              </div>}
              <div>
                <label className={editor.fieldLabel} htmlFor={`memo-${r.id}`}>メモ（任意）</label>
                <textarea id={`memo-${r.id}`} className={editor.memo} rows={2} maxLength={2000} value={ls.memo}
                  onChange={e => onChange(r.id, 'memo', e.target.value)} placeholder="遅刻・早退の補足など" />
              </div>
              {errors[r.id] && <div className={editor.saveError} role="alert">
                <p>{errors[r.id]}</p>
                <button type="button" className="secondary" disabled={saving[r.id]} onClick={() => onRetry(r.id)}>再保存</button>
              </div>}
            </div>
          </article>;
        })}
        {rehearsals.length === 0 && <p className={editor.hint}>稽古日程はまだ登録されていません。</p>}
      </div>
    </section>
  );
}
