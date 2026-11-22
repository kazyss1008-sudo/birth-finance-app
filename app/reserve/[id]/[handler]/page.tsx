'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {TicketForm,type TicketPerformance} from '@/components/TicketForm';
import styles from '@/components/Tickets.module.css';
export default function Reserve(){const {id,handler}=useParams<{id:string;handler:string}>();const [p,setP]=useState<(TicketPerformance&{handlerName:string})|null>(null);const [error,setError]=useState('');const [done,setDone]=useState<{number:string;mailState:string}|null>(null);
useEffect(()=>{fetch(`/api/booking/${id}/${handler}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setP(d);}).catch(e=>setError(e.message));},[id,handler]);
return <main className={styles.page}><h1>劇団Birth チケット予約</h1>{error&&<p role="alert">{error}</p>}{p&&<><h2>{p.name}</h2><p>{p.venue} ／ 取扱：{p.handlerName}</p>{done?<section className={styles.line}><h2>ご予約が成立しました</h2><p>予約番号：{done.number}</p><p>{done.mailState==='SENT'?'受付メールを送信しました。':'受付メールの送信は確認できていません。予約は成立していますので、再予約せず、この予約番号をお控えください。'}</p><p>当日精算・全席自由です。</p></section>:<TicketForm performance={p} submit={async body=>{const r=await fetch(`/api/booking/${id}/${handler}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error);setDone(d);}}/>}</>}<p>変更・キャンセル、締切後のご相談：<a href="mailto:tac.birth2003@gmail.com">tac.birth2003@gmail.com</a></p></main>}
