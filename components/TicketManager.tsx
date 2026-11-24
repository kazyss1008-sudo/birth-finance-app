'use client';
import {useEffect,useState,useCallback,type ReactNode} from 'react';
import {TicketForm,type TicketPerformance,type Booking} from './TicketForm';
import {amount,totals,cutoff} from '@/lib/tickets/domain';
import styles from './Tickets.module.css';
import {TicketCsv} from './TicketCsv';
import {CastNav} from './CastNav';
import {CastLogout} from './CastLogout';
import {StageMatrix} from './StageMatrix';
import {Shell} from './Shell';
type Data={performance:TicketPerformance;reservations:Booking[];casts:{id:string;name:string}[];actor:{kind:string;castId:string|null}};
export default function TicketManager({id,castOnly=false,bookingId}:{id:string;castOnly?:boolean;bookingId?:string}){
 const [stageFilter,setStageFilter]=useState('');const [statusFilter,setStatusFilter]=useState('active');const [busy,setBusy]=useState(false);const [now,setNow]=useState(Date.now());
 const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [edit,setEdit]=useState<Booking|'new'|null>(null);const [q,setQ]=useState('');const [origin,setOrigin]=useState('');const [tab,setTab]=useState('予約一覧');
 const load=useCallback(async()=>{const r=await fetch(`/api/cast/tickets/${id}${castOnly?'?scope=cast':''}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);},[id,castOnly]);
 useEffect(()=>{setOrigin(location.origin);const view=new URLSearchParams(location.search).get('view');if(view==='stages')setTab('公演回・残席');if(view==='settings'&&!castOnly){location.replace(`/performances/${id}/master`);return;}load().catch(e=>setError(e.message));},[load]);
 async function post(body:unknown){const r=await fetch(`/api/cast/tickets/${id}${castOnly?'?scope=cast':''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);setEdit(null);await load();}
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 async function operate(action:'cancel'|'delete',r:Booking){
  if(!confirm(action==='cancel'?'この予約をキャンセルしますか？':'このキャンセル済み予約を一覧から削除しますか？'))return;
  setBusy(true);setError('');
  try{
   if(action==='cancel')await post({action,id:r.id,version:r.version});
   else{const response=await fetch(`/api/cast/tickets/${id}${castOnly?'?scope=cast':''}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id,version:r.version})});const result=await response.json();if(!response.ok)throw new Error(result.error||'削除できませんでした');location.assign(`/performances/${id}/tickets`);}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 if(!data)return <main className={styles.page}>{castOnly&&<CastLogout id={id}/>}<p>{error||'読み込み中…'}</p><a href={`/performances/${id}/cast`}>キャストログイン</a></main>;
 const {performance:p,reservations,casts,actor}=data;const admin=actor.kind==='admin';
 const listBase=castOnly?`/performances/${id}/cast/tickets`:`/performances/${id}/tickets`;
 if(bookingId){
  const r=reservations.find(r=>r.id===bookingId);
  const stage=r?p.stages.find(s=>s.id===r.stageId):undefined;
  const closed=!admin&&(!p.ticketSalesStart||now<new Date(p.ticketSalesStart).getTime()||!stage?.stageDate||now>=cutoff(new Date(stage.stageDate)).getTime());
  return <Shell compact title={p.name} subtitle="予約詳細" hideManual={!admin} topActions={!admin?<CastLogout id={id}/>:undefined}><main className={styles.page}>{!admin&&<CastNav id={id} active="tickets"/>}<a href={listBase}>← 予約一覧に戻る</a>{error&&<p role="alert">{error}</p>}{!r?<p role="alert">予約が見つかりません。</p>:<>
  <BookingDetail r={r} p={p} casts={casts} admin={admin}/>
  <div className={styles.actions}><button disabled={closed||busy} onClick={()=>setEdit(r)}>予約内容を変更{r.cancelled?'・再開':''}</button>{!r.cancelled&&<button type="button" className={styles.cancelButton} disabled={closed||busy} onClick={()=>operate('cancel',r)}>予約をキャンセル</button>}{admin&&r.cancelled&&<button type="button" className={styles.deleteButton} disabled={busy} onClick={()=>operate('delete',r)}>この予約を削除</button>}{admin&&!r.cancelled&&r.mail&&r.mail.state!=='SENT'&&<button onClick={()=>{if(confirm('予約時点の受付メールを再送します。変更済みの場合は現在の予約内容と異なります。Gmailの送信済みを確認し、未送信であることを確認しましたか？'))post({action:'resend',id:r.id,reviewed:true}).catch(e=>setError(e.message));}}>受付メール再送</button>}</div>
  {closed&&<p>この公演回の変更受付は終了しました。劇団へご連絡ください。</p>}
  {edit&&<TicketForm key={`${r.id}:${r.version}`} performance={p} initial={r} admin={admin} proxy casts={casts} submit={post} close={()=>setEdit(null)}/>}
  </>}</main></Shell>;
 }
 const urls=admin?[{id:'birth',name:'劇団Birth'},...casts]:[{id:actor.castId!,name:'自分の販売URL'}];
 return <Shell compact title={p.name} subtitle={admin?'チケット管理':'自分のチケット'} hideManual={!admin} topActions={!admin?<CastLogout id={id}/>:undefined}><main className={styles.page}>{!admin&&<CastNav id={id} active="tickets"/>}{error&&<p role="alert">{error}</p>}
 <div className={styles.subtabs} role="tablist" aria-label="チケット管理">{(admin?['予約一覧','公演回・残席','予約URL','CSV取込']:['予約一覧','公演回・残席','予約URL']).map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} aria-controls={'ticket-panel-'+t} onClick={()=>setTab(t)}>{t}</button>)}</div>
 <div role="tabpanel" id="ticket-panel-公演回・残席" hidden={tab!=='公演回・残席'}>
 <StageMatrix performance={p} reservations={reservations} admin={admin}/></div>
 <section role="tabpanel" id="ticket-panel-予約URL" hidden={tab!=='予約URL'} className={styles.line}><h2>予約ページURL一覧</h2><div className={styles.urlGrid}>{urls.map(c=>{const url=`${origin}/reserve/${id}/${c.id}`;return <div key={c.id} className={styles.urlCard}><h3>{c.name}</h3><input className={styles.url} aria-label={`${c.name}の予約URL`} readOnly value={url} onFocus={e=>e.target.select()}/><div className={styles.actions}><button onClick={()=>navigator.clipboard.writeText(url).catch(()=>setError('URLを選択してコピーしてください'))}>コピー</button><a href={url} target="_blank" rel="noreferrer">ページを開く</a></div></div>;})}</div></section>
 {admin&&<div role="tabpanel" id="ticket-panel-CSV取込" hidden={tab!=='CSV取込'}><TicketCsv id={id} saved={load}/></div>}
 <div role="tabpanel" id="ticket-panel-予約一覧" hidden={tab!=='予約一覧'}>
 <div className={styles.reservationToolbar}><div className={styles.actions}><button onClick={()=>setEdit('new')}>予約を追加</button><button onClick={()=>load().catch(e=>setError(e.message))}>再読み込み</button></div>
 <label>予約検索<input aria-label="予約検索" value={q} onChange={e=>setQ(e.target.value)} placeholder="予約番号・お名前・メール・経路"/></label></div>
 {edit&&<TicketForm key={edit==='new'?'new':`${edit.id}:${edit.version}`} performance={p} initial={edit==='new'?undefined:edit} admin={admin} proxy casts={casts} submit={post} close={()=>setEdit(null)}/>}
 <div className={styles.reservationFilters}><label>公演回<select aria-label="公演回で絞り込み" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="">すべての公演回</option>{p.stages.map(stage=><option key={stage.id} value={stage.id}>{stage.stageDate?.slice(0,10)} {stage.startTime} {stage.stageName}</option>)}</select></label><label>予約状態<select aria-label="予約状態で絞り込み" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="active">有効な予約のみ</option><option value="cancelled">キャンセル済みのみ</option><option value="all">キャンセルを含むすべて</option></select></label></div>
 <ReservationList reservations={reservations} p={p} casts={casts} q={q} base={listBase} stageFilter={stageFilter} statusFilter={statusFilter}/>
</div></main></Shell>;
}

function HistorySnapshot({title,value,p,casts}:{title:string;value:unknown;p:TicketPerformance;casts:{id:string;name:string}[]}){
 if(!value||typeof value!=='object')return <p>{title}：新規受付</p>;
 const r=value as Booking;
 return <section className={styles.historyPanel}><h4>{title}</h4><BookingSummary r={r} p={p} casts={casts}/><TicketBreakdown lines={r.lines??[]}/></section>;
}

function mailLabel(r:Booking){return ({SENT:'送信済み',PENDING:'送信待ち',UNCONFIGURED:'設定未完了',SENDING:'送信処理中',UNKNOWN:'結果不明'} as Record<string,string>)[r.mail?.state??'']??'送信対象外';}
function handler(r:Booking,casts:{id:string;name:string}[]){return r.castId?(casts.find(c=>c.id===r.castId)?.name??'自分'):'劇団Birth';}
function ReservationList({reservations,p,casts,q,base,stageFilter,statusFilter}:{reservations:Booking[];p:TicketPerformance;casts:{id:string;name:string}[];q:string;base:string;stageFilter:string;statusFilter:string}){
 const rows=reservations.filter(r=>!r.deletedAt&&(!stageFilter||r.stageId===stageFilter)&&(statusFilter==='all'||(statusFilter==='cancelled'?r.cancelled:!r.cancelled))&&[r.number,r.customerName,r.email,r.source,r.externalKey,handler(r,casts)].join(' ').includes(q));
 return <><p className={styles.listCount}>{rows.length}件表示 / 全{reservations.length}件</p><div className={styles.reservationScroll} role="region" aria-label="予約一覧" tabIndex={0}><table className={styles.reservationTable}><thead><tr><th scope="col">予約番号 / お名前</th><th scope="col">公演回</th><th scope="col">枚数</th><th scope="col">金額</th><th scope="col">取扱</th><th scope="col">状態</th><th scope="col">経路 / メール</th><th scope="col">詳細</th></tr></thead><tbody>{rows.map(r=>{const sum=totals(r.lines),stage=p.stages.find(s=>s.id===r.stageId);return <tr key={r.id} className={r.cancelled?styles.cancelledRow:undefined}><th scope="row"><a href={`${base}/${r.id}`}>{r.number}</a><span>{r.customerName} 様</span></th><td>{stage?.stageDate?.slice(5,10)} {stage?.startTime}<small>{stage?.stageName}</small></td><td className={styles.numeric}>{sum.quantity}</td><td className={styles.numeric}>{sum.amount.toLocaleString()}円</td><td>{handler(r,casts)}</td><td><span className={r.cancelled?styles.cancelledBadge:styles.activeBadge}>{r.cancelled?'キャンセル':'有効'}</span></td><td>{r.source}<small>{mailLabel(r)}</small></td><td><a href={`${base}/${r.id}`} aria-label={`${r.number}の詳細`}>詳細</a></td></tr>})}</tbody></table></div>{!rows.length&&<p className="subtitle">{reservations.length?'条件に一致する予約はありません。':'予約はまだありません。'}</p>}</>;
}
function BookingSummary({r,p,casts}:{r:Booking;p:TicketPerformance;casts:{id:string;name:string}[]}){
 const stage=p.stages.find(s=>s.id===r.stageId),sum=totals(r.lines??[]);
 const fields:[string,ReactNode][]=[['予約番号',r.number],['お名前',`${r.customerName} 様`],['状態',<span key="state" className={r.cancelled?styles.cancelledBadge:styles.activeBadge}>{r.deletedAt?'削除済み':r.cancelled?'キャンセル済み':'有効'}</span>],['公演回',`${stage?.stageDate?.slice(0,10)??''} ${stage?.startTime??''} ${stage?.stageName??''}`],['取扱',handler(r,casts)],['予約経路',r.source],['枚数',`${sum.quantity}枚`],['予約金額',`${sum.amount.toLocaleString()}円`],['メールアドレス',r.email||'未登録'],...(r.phone?[['電話番号',r.phone] as [string,ReactNode]]:[]),['備考',r.note||'—']];
 return <table className={styles.detailTable}><tbody>{fields.map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>;
}
function TicketBreakdown({lines}:{lines:Booking['lines']}){
 const sum=totals(lines);
 return <div className={styles.detailScroll}><table className={styles.detailLines}><thead><tr><th scope="col">券種</th><th scope="col">基本単価</th><th scope="col">割引 / 1枚</th><th scope="col">枚数</th><th scope="col">小計</th></tr></thead><tbody>{lines.map((line,i)=><tr key={line.id??i}><th scope="row">{line.name}</th><td>{line.basePrice.toLocaleString()}円</td><td>{line.repeater?<>リピーター割引<br/>{line.discount.toLocaleString()}円</>:'—'}</td><td>{line.quantity}枚</td><td>{amount(line).toLocaleString()}円</td></tr>)}</tbody><tfoot><tr><th scope="row" colSpan={3}>合計</th><td>{sum.quantity}枚</td><td>{sum.amount.toLocaleString()}円</td></tr></tfoot></table></div>;
}
function BookingDetail({r,p,casts,admin}:{r:Booking;p:TicketPerformance;casts:{id:string;name:string}[];admin:boolean}){
 return <article className={styles.line}><h2>予約内容</h2><BookingSummary r={r} p={p} casts={casts}/><h3>チケット明細</h3><TicketBreakdown lines={r.lines}/><h3>受付メール</h3><table className={styles.detailTable}><tbody><tr><th scope="row">送信状態</th><td>{mailLabel(r)}</td></tr><tr><th scope="row">送信日時</th><td>{r.mail?.sentAt?new Date(r.mail.sentAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'—'}</td></tr></tbody></table>{admin&&<details className={styles.historyPanel}><summary>変更履歴</summary>{r.history?.map(h=><div key={h.id}><p>{new Date(h.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ {h.actor.startsWith('admin:')?'管理者':h.actor.startsWith('cast:')?'キャスト':'お客様'}</p><HistorySnapshot title="変更前" value={h.before} p={p} casts={casts}/><HistorySnapshot title="変更後" value={h.after} p={p} casts={casts}/></div>)}</details>}</article>;
}
