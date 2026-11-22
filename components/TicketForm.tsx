'use client';
import { useEffect, useState } from 'react';
import { amount, totals, cutoff, type Snapshot } from '@/lib/tickets/domain';
import styles from './Tickets.module.css';
export type TicketMaster={id:string;name:string;price:number;active:boolean};
export type TicketStage={id:string;stageName:string;stageDate:string|null;startTime:string|null;capacity:number|null};
export type TicketPerformance={id:string;name:string;venue:string;ticketSalesStart:string|null;ticketSalesEnabled:boolean;repeaterEnabled:boolean;repeaterDiscount:number;ticketTypes:TicketMaster[];stages:TicketStage[]};
export type Booking={id:string;number:string;version:number;stageId:string;castId:string|null;source:string;externalKey:string|null;customerName:string;email:string;phone:string;note:string;cancelled:boolean;lines:Snapshot[];mail?:{state:string;sentAt?:string|null;attemptedAt?:string|null};history?:{id:string;actor:string;createdAt:string;before:unknown;after:unknown}[]};
export function TicketForm({performance:p, initial, admin=false, proxy=false, casts=[], submit, close}:{performance:TicketPerformance;initial?:Booking;admin?:boolean;proxy?:boolean;casts?:{id:string;name:string}[];submit:(body:unknown)=>Promise<void>;close?:()=>void}){
 const fresh=()=>({ticketTypeId:p.ticketTypes.find(t=>t.active)?.id??'',quantity:1,repeater:false});
 const [lines,setLines]=useState<(Partial<Snapshot>&{ticketTypeId:string;quantity:number;repeater:boolean})[]>(initial?initial.lines.map(l=>({...l,ticketTypeId:l.ticketTypeId??''})):[fresh()]);
 const [stageId,setStage]=useState(initial?.stageId??p.stages[0]?.id??'');
 const [name,setName]=useState(initial?.customerName??'');const [email,setEmail]=useState(initial?.email??'');const [phone,setPhone]=useState(initial?.phone??'');const [note,setNote]=useState(initial?.note??'');
 const [castId,setCast]=useState(initial?.castId??'');const [source,setSource]=useState(initial?.source??'代理予約');const [externalNumber,setExternal]=useState('');
 const [key,setKey]=useState(()=>crypto.randomUUID());
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const storageKey=`birth-booking:${location.pathname}:${initial?.id??'new'}`;const previous=sessionStorage.getItem(storageKey);if(previous)setKey(previous);else sessionStorage.setItem(storageKey,key);const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const selectedStage=p.stages.find(s=>s.id===stageId);
 const blocked=!admin&&(!p.ticketSalesStart||now<new Date(p.ticketSalesStart).getTime()||!selectedStage?.stageDate||now>=cutoff(new Date(selectedStage.stageDate)).getTime()||(!initial&&!p.ticketSalesEnabled));const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [review,setReview]=useState(false);
 const calculated:Snapshot[]=lines.map(l=>{const t=p.ticketTypes.find(t=>t.id===l.ticketTypeId);return {...l,name:l.name??t?.name??'',basePrice:l.basePrice??t?.price??0,discount:l.discount??(p.repeaterEnabled?p.repeaterDiscount:0)};});
 const sum=totals(calculated);
 const update=(i:number,patch:Partial<typeof lines[number]>)=>{setLines(a=>a.map((l,j)=>j===i?{...l,...patch}:l));setReview(false);};
 async function save(cancelled=false){if(blocked)return;setBusy(true);setError('');try{await submit({id:initial?.id,version:initial?.version,requestKey:key,stageId,castId:castId||null,source,externalNumber,customerName:name,email,phone,note,lines:lines.map(l=>({id:l.id,ticketTypeId:l.ticketTypeId,quantity:l.quantity,repeater:l.repeater})),cancelled});sessionStorage.removeItem(`birth-booking:${location.pathname}:${initial?.id??'new'}`);}catch(e){setError(e instanceof Error?e.message:'保存できませんでした。同じ内容で再試行してください');}finally{setBusy(false);}}
 return <form className={styles.form} onSubmit={e=>{e.preventDefault();if(blocked)return;if(!review)setReview(true);else void save();}}>
 <fieldset disabled={busy} className={styles.fieldset}>
 <label>公演回<select value={stageId} onChange={e=>{setStage(e.target.value);setReview(false);}} required>{p.stages.map(s=><option key={s.id} value={s.id}>{s.stageDate?.slice(0,10)} {s.startTime} {s.stageName}</option>)}</select></label>
 {admin&&<><label>取扱<select value={castId} onChange={e=>setCast(e.target.value)}><option value="">劇団Birth</option>{casts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>予約経路<input value={source} disabled={!!initial} onChange={e=>setSource(e.target.value)} required maxLength={60}/></label>{!initial&&<label>外部予約番号（外部サービスは必須）<input value={externalNumber} onChange={e=>setExternal(e.target.value)} maxLength={100}/></label>}</>}
 {lines.map((l,i)=><section className={styles.line} key={l.id??i} aria-label={`チケット明細 ${i+1}`}>
 <label>券種<select aria-label="券種" value={l.ticketTypeId} disabled={!!l.id} onChange={e=>update(i,{ticketTypeId:e.target.value})} required>{l.id?<option value={l.ticketTypeId}>{l.name}</option>:p.ticketTypes.filter(t=>t.active).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>枚数<input type="number" min={1} max={100} value={l.quantity} onChange={e=>update(i,{quantity:Number(e.target.value)})} required/></label>
 {(p.repeaterEnabled||!!l.id)&&<label className={styles.check}><input type="checkbox" checked={l.repeater} onChange={e=>update(i,{repeater:e.target.checked})}/>リピーター割引</label>}
 <p>{!l.id&&!p.ticketTypes.some(t=>t.id===l.ticketTypeId)?'券種・料金は準備中です':<>単価 {amount({...calculated[i],quantity:1}).toLocaleString()}円 ／ 小計 {amount(calculated[i]).toLocaleString()}円</>}</p>
 {l.id&&<small>保存済みの単価・割引額を使用します。券種を変える場合はカードを削除し、追加してください。</small>}
 {lines.length>1&&<button type="button" onClick={()=>{setLines(a=>a.filter((_,j)=>i!==j));setReview(false);}}>この明細を削除</button>}
 </section>)}
 <button type="button" onClick={()=>{setLines(a=>[...a,fresh()]);setReview(false);}} disabled={lines.length>=30}>別の券種・割引を追加</button>
 <label>お名前<input value={name} onChange={e=>{setName(e.target.value);setReview(false);}} required maxLength={200} autoComplete="name"/></label>
 <label>メールアドレス<input type="email" value={email} onChange={e=>{setEmail(e.target.value);setReview(false);}} required={!proxy} maxLength={254} autoComplete="email"/></label>
 <label>電話番号<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength={50} autoComplete="tel"/></label>
 <label>備考<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></label>
 <p>全席自由・当日精算です。リピーター割引の方は、受付で同じ公演の半券をご提示ください。</p>
 <strong className={styles.total}>{!initial&&!p.ticketTypes.length?'券種・料金は準備中です':<>合計 {sum.quantity}枚 ／ {sum.amount.toLocaleString()}円</>}</strong>
 {review&&<div className={styles.line} role="status"><h3>予約内容の確認</h3><p>{name} 様 ／ {email}</p><p>{p.stages.find(s=>s.id===stageId)?.stageDate?.slice(0,10)} {p.stages.find(s=>s.id===stageId)?.startTime}</p>{calculated.map((l,i)=><p key={i}>{l.name} {l.repeater?'（リピーター割引）':''} {l.quantity}枚：{amount(l).toLocaleString()}円</p>)}<p>当日お支払い：{sum.amount.toLocaleString()}円</p></div>}
 {error&&<p role="alert">{error}</p>}
 {blocked&&<p role="status">{(!p.ticketSalesStart||now<new Date(p.ticketSalesStart).getTime()) && !(selectedStage?.stageDate&&now>=cutoff(new Date(selectedStage.stageDate)).getTime())?'販売開始前です。販売開始まで少々お待ちください':'販売を終了しています。当日券をご希望の場合は直接お問い合わせください。tac.birth2003@gmail.com'}</p>}<div className={styles.actions}><button type="submit" disabled={blocked||!lines.length||sum.quantity>100}>{busy?'保存中…':review?(initial?'変更を保存':'予約を確定'):'予約内容を確認'}</button>{initial&&!initial.cancelled&&<button disabled={blocked} type="button" onClick={()=>{if(confirm('この予約をキャンセルしますか？'))void save(true);}}>予約をキャンセル</button>}{close&&<button type="button" onClick={close}>閉じる</button>}</div>
 </fieldset></form>;
}
