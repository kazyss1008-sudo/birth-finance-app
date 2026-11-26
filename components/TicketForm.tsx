'use client';
import {showDateTime} from '@/lib/display-date';
import { useEffect, useId, useState } from 'react';
import { amount, totals, cutoff, type Snapshot } from '@/lib/tickets/domain';
import {IntegerInput} from './IntegerInput';
import styles from './Tickets.module.css';
export type TicketMaster={id:string;name:string;price:number;active:boolean};
export type TicketStage={id:string;stageName:string;stageDate:string|null;startTime:string|null;capacity:number|null};
export type TicketPerformance={id:string;name:string;venue:string;venueMapUrl?:string|null;ticketSalesStart:string|null;ticketSalesEnabled:boolean;repeaterEnabled:boolean;repeaterDiscount:number;ticketTypes:TicketMaster[];stages:TicketStage[]};
export type Booking={id:string;number:string;version:number;stageId:string;castId:string|null;source:string;externalKey:string|null;customerName:string;email:string;phone:string;note:string;cancelled:boolean;deletedAt?:string|null;lines:Snapshot[];mail?:{state:string;sentAt?:string|null;attemptedAt?:string|null};history?:{id:string;actor:string;createdAt:string;before:unknown;after:unknown}[]};
export function TicketForm({performance:p, initial, admin=false, proxy=false, casts=[], submit, close}:{performance:TicketPerformance;initial?:Booking;admin?:boolean;proxy?:boolean;casts?:{id:string;name:string}[];submit:(body:unknown)=>Promise<void>;close?:()=>void}){
 const formId=useId();
 const fresh=()=>({ticketTypeId:p.ticketTypes.find(t=>t.active)?.id??'',quantity:1,repeater:false});
 const [lines,setLines]=useState<(Partial<Snapshot>&{ticketTypeId:string;quantity:number;repeater:boolean})[]>(initial?initial.lines.map(l=>({...l,ticketTypeId:l.ticketTypeId??''})):[fresh()]);
 const [stageId,setStage]=useState(initial?.stageId??p.stages[0]?.id??'');
 const [name,setName]=useState(initial?.customerName??'');const [email,setEmail]=useState(initial?.email??'');const phone=initial?.phone??'';const [note,setNote]=useState(initial?.note??'');
 const [castId,setCast]=useState(initial?.castId??'');
 const [key,setKey]=useState(()=>crypto.randomUUID());
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const storageKey=`birth-booking:${location.pathname}:${initial?.id??'new'}`;const previous=sessionStorage.getItem(storageKey);if(previous)setKey(previous);else sessionStorage.setItem(storageKey,key);const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const selectedStage=p.stages.find(s=>s.id===stageId);
 const blocked=!admin&&(!p.ticketSalesStart||now<new Date(p.ticketSalesStart).getTime()||!selectedStage?.stageDate||now>=cutoff(new Date(selectedStage.stageDate)).getTime()||(!initial&&!p.ticketSalesEnabled));const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [review,setReview]=useState(false);
 const calculated:Snapshot[]=lines.map(l=>{const t=p.ticketTypes.find(t=>t.id===l.ticketTypeId);return {...l,name:l.name??t?.name??'',basePrice:l.basePrice??t?.price??0,discount:l.discount??(p.repeaterEnabled?p.repeaterDiscount:0)};});
 const sum=totals(calculated);
 const update=(i:number,patch:Partial<typeof lines[number]>)=>{setLines(a=>a.map((l,j)=>j===i?{...l,...patch}:l));setReview(false);};
 async function save(cancelled=false){if(blocked)return;setBusy(true);setError('');try{await submit({id:initial?.id,version:initial?.version,requestKey:key,stageId,castId:castId||null,customerName:name,email,phone,note,lines:lines.map(l=>({id:l.id,ticketTypeId:l.ticketTypeId,quantity:l.quantity,repeater:l.repeater})),cancelled});sessionStorage.removeItem(`birth-booking:${location.pathname}:${initial?.id??'new'}`);}catch(e){setError(e instanceof Error?e.message:'保存できませんでした。同じ内容で再試行してください');}finally{setBusy(false);}}
 return <form className={styles.form} onSubmit={e=>{e.preventDefault();if(blocked)return;if(!review)setReview(true);else void save();}}>
 <fieldset disabled={busy} className={styles.fieldset}><p className="subtitle">* は必須項目です。</p>
 <label><span>公演回<span className={styles.requiredMark} aria-hidden="true">*</span></span><select value={stageId} onChange={e=>{setStage(e.target.value);setReview(false);}} required>{p.stages.map(s=><option key={s.id} value={s.id}>{showDateTime(s.stageDate,s.startTime)} {s.stageName}</option>)}</select></label>
 {admin&&<><label><span>取扱<span className={styles.requiredMark} aria-hidden="true">*</span></span><select value={castId} onChange={e=>setCast(e.target.value)}><option value="">劇団Birth</option>{casts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></>}
 {lines.map((l,i)=>{const options=p.ticketTypes.filter(t=>t.active||t.id===l.ticketTypeId);return <section className={styles.line} key={l.id??i} aria-label={`チケット明細 ${i+1}`}>
 <h3>明細{i+1}</h3>
 <fieldset className={styles.typeChoices} disabled={!!l.id}><legend>チケット種別<span className={styles.requiredMark} aria-hidden="true">*</span></legend>{options.map(t=><label className={styles.check} key={t.id}><input type="radio" name={`${formId}-ticket-type-${i}`} value={t.id} required checked={l.ticketTypeId===t.id} onChange={()=>update(i,{ticketTypeId:t.id})}/>{l.id&&t.id===l.ticketTypeId?(l.name??t.name):t.name}（{(l.id&&t.id===l.ticketTypeId?(l.basePrice??t.price):t.price).toLocaleString()}円）</label>)}{!!l.id&&!options.some(t=>t.id===l.ticketTypeId)&&<label className={styles.check}><input type="radio" name={`${formId}-ticket-type-${i}`} value={l.ticketTypeId} checked readOnly/>{l.name}（{(l.basePrice??0).toLocaleString()}円）</label>}</fieldset>
 <label><span>枚数<span className={styles.requiredMark} aria-hidden="true">*</span></span><IntegerInput min={1} max={100} value={l.quantity} onChange={quantity=>update(i,{quantity})}/></label>
 {(p.repeaterEnabled||!!l.id)&&<label className={styles.check}><input type="checkbox" checked={l.repeater} onChange={e=>update(i,{repeater:e.target.checked})}/>リピーター割引</label>}
 <p>{!l.id&&!p.ticketTypes.some(t=>t.id===l.ticketTypeId)?'チケット種別・料金は準備中です':<>単価 {amount({...calculated[i],quantity:1}).toLocaleString()}円 ／ 小計 {amount(calculated[i]).toLocaleString()}円</>}</p>
 {l.id&&<small>保存済みの単価・割引額を使用します。チケット種別を変える場合は、この明細を削除して追加してください。</small>}

 {lines.length>1&&<button type="button" onClick={()=>{setLines(a=>a.filter((_,j)=>i!==j));setReview(false);}}>この明細を削除</button>}
 </section>})}
 <button type="button" onClick={()=>{setLines(a=>[...a,fresh()]);setReview(false);}} disabled={lines.length>=30||!p.ticketTypes.some(t=>t.active)}>チケットを追加</button>
 <label><span>お名前<span className={styles.requiredMark} aria-hidden="true">*</span></span><input value={name} onChange={e=>{setName(e.target.value);setReview(false);}} required maxLength={200} autoComplete="name"/></label>
 {!proxy&&<label><span>メールアドレス<span className={styles.requiredMark} aria-hidden="true">*</span></span><input type="email" value={email} onChange={e=>{setEmail(e.target.value);setReview(false);}} required={!proxy} maxLength={254} autoComplete="email"/></label>}
 {proxy&&initial?.email&&<div className={styles.line}><strong>メールアドレス</strong><p>{initial.email}</p></div>}
 <label>備考（任意）<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></label>
 <p>全席自由・当日精算です。<br/>リピーター割引の方は、受付で本公演チケットの半券をご提示いただく必要がございます。</p>
 <strong className={styles.total}>{!initial&&!p.ticketTypes.length?'チケット種別・料金は準備中です':<>合計 {sum.quantity}枚 ／ {sum.amount.toLocaleString()}円</>}</strong>
 {review&&<div className={styles.line} role="status"><h3>予約内容の確認</h3><p>{name} 様 ／ {email}</p><p>{showDateTime(selectedStage?.stageDate,selectedStage?.startTime)}</p>{calculated.map((l,i)=><p key={i}>{l.name} {l.repeater?'（リピーター割引）':''} {l.quantity}枚：{amount(l).toLocaleString()}円</p>)}<p>当日お支払い：{sum.amount.toLocaleString()}円</p></div>}
 {error&&<p role="alert">{error}</p>}
 {blocked&&<p role="status">{(!p.ticketSalesStart||now<new Date(p.ticketSalesStart).getTime()) && !(selectedStage?.stageDate&&now>=cutoff(new Date(selectedStage.stageDate)).getTime())?'販売開始前です。販売開始まで少々お待ちください':'販売を終了しています。当日券をご希望の場合は直接お問い合わせください。tac.birth2003@gmail.com'}</p>}<div className={styles.actions}><button type="submit" disabled={blocked||!lines.length||sum.quantity>100}>{busy?'保存中…':review?(initial?'変更を保存':'予約を確定'):'予約内容を確認'}</button>{initial&&!initial.cancelled&&<button disabled={blocked} type="button" onClick={()=>{if(confirm('この予約をキャンセルしますか？'))void save(true);}}>予約をキャンセル</button>}{close&&<button type="button" onClick={close}>閉じる</button>}</div>
 </fieldset></form>;
}
