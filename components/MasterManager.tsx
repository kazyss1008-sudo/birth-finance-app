 'use client';
import {useEffect,useState,useCallback} from 'react';
import {Shell} from './Shell';
import {CastAccounts} from './CastAccounts';
import {TicketSettings} from './TicketSettings';
import {RehearsalMaster} from './RehearsalMaster';
import FinanceManager from './FinanceManager';
import {type TicketPerformance} from './TicketForm';
import styles from './Tickets.module.css';
const sections=[['performance','公演・販売設定'],['casts','キャスト'],['back','バックルール'],['goods','グッズ'],['rehearsals','稽古日程'],['common','共通設定']] as const;
export default function MasterManager({id}:{id:string}){
 const [visited,setVisited]=useState<string[]>(['performance']);
 const [p,setP]=useState<TicketPerformance|null>(null),[error,setError]=useState(''),[section,setSection]=useState('performance');
 const load=useCallback(async()=>{const r=await fetch(`/api/cast/tickets/${id}`);const d=await r.json();if(!r.ok)throw new Error(d.error||'マスタを読み込めませんでした');if(d.actor.kind!=='admin')throw new Error('管理者ログインが必要です');setP(d.performance);},[id]);
 useEffect(()=>{const requested=new URLSearchParams(location.search).get('section');if(sections.some(([key])=>key===requested)){setSection(requested!);setVisited(v=>[...new Set([...v,requested!])]);}load().catch(e=>setError(e.message));},[load]);
 return <Shell title={p?.name??'マスタ'} subtitle="マスタ管理"><main className={styles.page}>{error&&<p role="alert">{error}</p>}{!p?<p>読み込み中…</p>:<><div className={styles.subtabs} role="tablist" aria-label="マスタ管理">{sections.map(([key,label])=><button type="button" role="tab" aria-selected={section===key} aria-controls={`master-${key}`} key={key} onClick={()=>{setSection(key);setVisited(v=>[...new Set([...v,key])]);history.replaceState(null,'',`?section=${key}`)}}>{label}</button>)}</div>{sections.filter(([key])=>visited.includes(key)).map(([panel])=><section key={panel} role="tabpanel" id={`master-${panel}`} hidden={section!==panel}>
 {panel==='performance'&&<TicketSettings p={p} saved={load}/>}
 {panel==='casts'&&<div className="card"><CastAccounts performanceId={id}/></div>}
 {panel==='back'&&<FinanceManager masterTab="バック"/>}
 {panel==='goods'&&<FinanceManager masterTab="グッズ"/>}
 {panel==='rehearsals'&&<RehearsalMaster id={id}/>}
 {panel==='common'&&<div className="card"><h2>共通設定</h2><div className={styles.masterLinks}><a href={`/performances/${id}/master/users`}>ユーザー管理</a><a href={`/performances/${id}/master/expense-categories`}>経費カテゴリ</a><a href={`/performances/${id}/master/line-settings`}>LINE通知設定</a><a href="/master">全公演のマスタ・公演作成</a></div></div>}
 </section>)}</>}</main></Shell>;
}
