'use client';
import {useEffect,useState,useCallback} from 'react';
import {TicketForm,type TicketPerformance,type Booking} from './TicketForm';
import {totals,cutoff} from '@/lib/tickets/domain';
import styles from './Tickets.module.css';
import {TicketCsv} from './TicketCsv';
import {CastNav} from './CastNav';
import {StageMatrix} from './StageMatrix';
import {Shell} from './Shell';
type Data={performance:TicketPerformance;reservations:Booking[];casts:{id:string;name:string}[];actor:{kind:string;castId:string|null}};
export default function TicketManager({id,castOnly=false,bookingId}:{id:string;castOnly?:boolean;bookingId?:string}){
 const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [edit,setEdit]=useState<Booking|'new'|null>(null);const [q,setQ]=useState('');const [origin,setOrigin]=useState('');const [tab,setTab]=useState('予約一覧');
 const load=useCallback(async()=>{const r=await fetch(`/api/cast/tickets/${id}${castOnly?'?scope=cast':''}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);},[id,castOnly]);
 useEffect(()=>{setOrigin(location.origin);const view=new URLSearchParams(location.search).get('view');if(view==='stages')setTab('公演回・残席');if(view==='settings'&&!castOnly){location.replace(`/performances/${id}/master`);return;}load().catch(e=>setError(e.message));},[load]);
 async function post(body:unknown){const r=await fetch(`/api/cast/tickets/${id}${castOnly?'?scope=cast':''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);setEdit(null);await load();}
 if(!data)return <main className={styles.page}><p>{error||'読み込み中…'}</p><a href={`/performances/${id}/cast`}>キャストログイン</a></main>;
 const {performance:p,reservations,casts,actor}=data;const admin=actor.kind==='admin';
 const listBase=castOnly?`/performances/${id}/cast/tickets`:`/performances/${id}/tickets`;
 if(bookingId){
  const r=reservations.find(r=>r.id===bookingId);
  const stage=r?p.stages.find(s=>s.id===r.stageId):undefined;
  const closed=!admin&&(!stage?.stageDate||Date.now()>=cutoff(new Date(stage.stageDate)).getTime());
  return <Shell compact title={p.name} subtitle="予約詳細" hideManual={!admin}><main className={styles.page}>{!admin&&<CastNav id={id} active="tickets"/>}<a href={listBase}>← 予約一覧に戻る</a>{error&&<p role="alert">{error}</p>}{!r?<p role="alert">予約が見つかりません。</p>:<>
  <BookingDetail r={r} p={p} casts={casts} admin={admin}/>
  <div className={styles.actions}><button disabled={closed} onClick={()=>setEdit(r)}>予約内容を変更{r.cancelled?'・再開':''}</button>{admin&&!r.cancelled&&r.mail&&r.mail.state!=='SENT'&&<button onClick={()=>{if(confirm('予約時点の受付メールを再送します。変更済みの場合は現在の予約内容と異なります。Gmailの送信済みを確認し、未送信であることを確認しましたか？'))post({action:'resend',id:r.id,reviewed:true}).catch(e=>setError(e.message));}}>受付メール再送</button>}</div>
  {closed&&<p>この公演回の変更受付は終了しました。劇団へご連絡ください。</p>}
  {edit&&<TicketForm key={`${r.id}:${r.version}`} performance={p} initial={r} admin={admin} proxy casts={casts} submit={post} close={()=>setEdit(null)}/>}
  </>}</main></Shell>;
 }
 const urls=admin?[{id:'birth',name:'劇団Birth'},...casts]:[{id:actor.castId!,name:'自分の販売URL'}];
 return <Shell compact title={p.name} subtitle={admin?'チケット管理':'自分のチケット'} hideManual={!admin}><main className={styles.page}>{!admin&&<CastNav id={id} active="tickets"/>}{error&&<p role="alert">{error}</p>}
 <div className={styles.subtabs} role="tablist" aria-label="チケット管理">{(admin?['予約一覧','公演回・残席','予約URL','CSV取込']:['予約一覧','公演回・残席','予約URL']).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} aria-controls={'ticket-panel-'+t} onClick={()=>setTab(t)}>{t}</button>)}</div>
 <div role="tabpanel" id="ticket-panel-公演回・残席" hidden={tab!=='公演回・残席'}>
 <StageMatrix performance={p} reservations={reservations} admin={admin}/></div>
 <section role="tabpanel" id="ticket-panel-予約URL" hidden={tab!=='予約URL'} className={styles.line}><h2>予約ページURL一覧</h2><div className={styles.urlGrid}>{urls.map(c=>{const url=`${origin}/reserve/${id}/${c.id}`;return <div key={c.id} className={styles.urlCard}><h3>{c.name}</h3><input className={styles.url} aria-label={`${c.name}の予約URL`} readOnly value={url} onFocus={e=>e.target.select()}/><div className={styles.actions}><button onClick={()=>navigator.clipboard.writeText(url).catch(()=>setError('URLを選択してコピーしてください'))}>コピー</button><a href={url} target="_blank" rel="noreferrer">ページを開く</a></div></div>;})}</div></section>
 {admin&&<div role="tabpanel" id="ticket-panel-CSV取込" hidden={tab!=='CSV取込'}><TicketCsv id={id} saved={load}/></div>}
 <div role="tabpanel" id="ticket-panel-予約一覧" hidden={tab!=='予約一覧'}>
 <div className={styles.reservationToolbar}><div className={styles.actions}><button onClick={()=>setEdit('new')}>予約を追加</button><button onClick={()=>load().catch(e=>setError(e.message))}>再読み込み</button></div>
 <label>予約検索<input aria-label="予約検索" value={q} onChange={e=>setQ(e.target.value)} placeholder="予約番号・お名前・メール・経路"/></label></div>
 {edit&&<TicketForm key={edit==='new'?'new':`${edit.id}:${edit.version}`} performance={p} initial={edit==='new'?undefined:edit} admin={admin} proxy casts={casts} submit={post} close={()=>setEdit(null)}/>}
 <ReservationList reservations={reservations} p={p} casts={casts} q={q} base={listBase}/>
</div></main></Shell>;
}

function HistorySnapshot({title,value,p,casts}:{title:string;value:unknown;p:TicketPerformance;casts:{id:string;name:string}[]}){
 if(!value||typeof value!=='object')return <p>{title}：新規受付</p>;
 const r=value as Booking;const s=p.stages.find(s=>s.id===r.stageId);const lines=r.lines??[];const sum=totals(lines);
 return <section className={styles.line}><h4>{title}</h4><p>{r.cancelled?'キャンセル':'有効'} ／ {s?.stageDate?.slice(0,10)} {s?.startTime} {s?.stageName}</p><p>{r.customerName} 様 ／ {r.email||'メール未登録'} ／ {r.phone}</p><p>取扱：{r.castId?(casts.find(c=>c.id===r.castId)?.name??'キャスト'):'劇団Birth'} ／ 経路：{r.source}</p>{lines.map((l,i)=><p key={i}>{l.name} {l.repeater?'（リピーター割引）':''}：基本単価{l.basePrice}円、割引{l.repeater?l.discount:0}円、{l.quantity}枚</p>)}<p>合計 {sum.quantity}枚・{sum.amount.toLocaleString()}円</p><p>{r.note}</p></section>;
}

function mailLabel(r:Booking){return ({SENT:'送信済み',PENDING:'送信待ち',UNCONFIGURED:'設定未完了',SENDING:'送信処理中',UNKNOWN:'結果不明'} as Record<string,string>)[r.mail?.state??'']??'送信対象外';}
function handler(r:Booking,casts:{id:string;name:string}[]){return r.castId?(casts.find(c=>c.id===r.castId)?.name??'自分'):'劇団Birth';}
function ReservationList({reservations,p,casts,q,base}:{reservations:Booking[];p:TicketPerformance;casts:{id:string;name:string}[];q:string;base:string}){
 const rows=reservations.filter(r=>[r.number,r.customerName,r.email,r.source,r.externalKey,handler(r,casts)].join(' ').includes(q));
 return <><p className={styles.listCount}>{rows.length}件表示 / 全{reservations.length}件</p><div className={styles.reservationScroll} role="region" aria-label="予約一覧" tabIndex={0}><table className={styles.reservationTable}><thead><tr><th scope="col">予約番号 / お名前</th><th scope="col">公演回</th><th scope="col">枚数</th><th scope="col">金額</th><th scope="col">取扱</th><th scope="col">状態</th><th scope="col">経路 / メール</th><th scope="col">詳細</th></tr></thead><tbody>{rows.map(r=>{const sum=totals(r.lines),stage=p.stages.find(s=>s.id===r.stageId);return <tr key={r.id} className={r.cancelled?styles.cancelledRow:undefined}><th scope="row"><a href={`${base}/${r.id}`}>{r.number}</a><span>{r.customerName} 様</span></th><td>{stage?.stageDate?.slice(5,10)} {stage?.startTime}<small>{stage?.stageName}</small></td><td className={styles.numeric}>{sum.quantity}</td><td className={styles.numeric}>{sum.amount.toLocaleString()}円</td><td>{handler(r,casts)}</td><td><span className={r.cancelled?styles.cancelledBadge:styles.activeBadge}>{r.cancelled?'キャンセル':'有効'}</span></td><td>{r.source}<small>{mailLabel(r)}</small></td><td><a href={`${base}/${r.id}`} aria-label={`${r.number}の詳細`}>詳細</a></td></tr>})}</tbody></table></div>{!rows.length&&<p className="subtitle">{reservations.length?'条件に一致する予約はありません。':'予約はまだありません。'}</p>}</>;
}
function BookingDetail({r,p,casts,admin}:{r:Booking;p:TicketPerformance;casts:{id:string;name:string}[];admin:boolean}){
 const sum=totals(r.lines),stage=p.stages.find(s=>s.id===r.stageId);
 return <article className={styles.line}><h2>{r.customerName} 様 {r.cancelled?'（キャンセル）':''}</h2><p>予約番号：{r.number}</p><p>{stage?.stageDate?.slice(0,10)} {stage?.startTime} {stage?.stageName} ／ {sum.quantity}枚 ／ {sum.amount.toLocaleString()}円</p><p>取扱：{handler(r,casts)} ／ 経路：{r.source}</p><p>{r.email||'メール未登録'}</p>{r.phone&&<p>{r.phone}</p>}{r.note&&<p className={styles.detailNote}>{r.note}</p>}{r.lines.map((l,i)=><p key={i}>{l.name} {l.repeater?'（リピーター割引）':''} × {l.quantity}枚</p>)}<p>受付メール：{mailLabel(r)}{r.mail?.sentAt&&<> ／ {new Date(r.mail.sentAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</>}</p>{admin&&<details><summary>変更履歴</summary>{r.history?.map(h=><div key={h.id}><p>{new Date(h.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ {h.actor.startsWith('admin:')?'管理者':h.actor.startsWith('cast:')?'キャスト':'お客様'}</p><HistorySnapshot title="変更前" value={h.before} p={p} casts={casts}/><HistorySnapshot title="変更後" value={h.after} p={p} casts={casts}/></div>)}</details>}</article>;
}
