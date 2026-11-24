import { useRef, useState } from 'react';
import type {Booking,TicketPerformance} from './TicketForm';
import styles from './Tickets.module.css';
export function StageMatrix({performance:p,reservations,admin}:{performance:TicketPerformance;reservations:Booking[];admin:boolean}){
 const captureRef=useRef<HTMLDivElement>(null);
 const [capturing,setCapturing]=useState(false);
 const [error,setError]=useState('');
 const active=reservations.filter(r=>!r.cancelled&&!r.deletedAt);
 const columns=new Map(p.ticketTypes.map(t=>[t.id,t.name]));
 const key=(line:Booking['lines'][number])=>line.ticketTypeId||`history:${line.name}`;
 for(const r of active)for(const l of r.lines)if(!columns.has(key(l)))columns.set(key(l),l.name);
 const count=(stageId:string|null,typeId?:string)=>active.filter(r=>stageId===null||r.stageId===stageId).reduce((sum,r)=>sum+r.lines.filter(l=>!typeId||key(l)===typeId).reduce((n,l)=>n+l.quantity,0),0);
 async function handleScreenshot(){
  if(!admin||!captureRef.current)return;
  setCapturing(true);setError('');
  try{
   const {default:html2canvas}=await import('html2canvas');
   const target=captureRef.current;
   const table=target.querySelector('table')!;
   const width=Math.max(target.offsetWidth,table.scrollWidth+32);
   const canvas:HTMLCanvasElement=await html2canvas(target,{backgroundColor:'#ffffff',scale:2,useCORS:true,width,
    windowWidth:Math.max(document.documentElement.clientWidth,width),
    onclone:(_document:Document,element:HTMLElement)=>{
     element.style.width=`${width}px`;
     const scroll=element.querySelector<HTMLElement>(`.${styles.matrixScroll}`);
     if(scroll){scroll.style.overflow='visible';scroll.style.width='100%';scroll.scrollLeft=0;}
     element.querySelectorAll<HTMLElement>('th').forEach(th=>{th.style.position='static';});
    }});
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('画像を作成できませんでした')),'image/png'));
   const file=new File([blob],`${p.name.replace(/[\\/:*?"<>|]/g,'_')}_公演回・残席.png`,{type:'image/png'});
   if(navigator.share&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({files:[file]});return;}
    catch(e){if(e instanceof Error&&e.name==='AbortError')return;}
   }
   const url=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=url;link.download=file.name;link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{setError('画像を作成できませんでした。もう一度お試しください。');}
  finally{setCapturing(false);}
 }
 return <section className={styles.line}><div className={styles.matrixHeading}><h2>公演回別の予約枚数{admin?'・残席':''}</h2>{admin&&<button type="button" className={`secondary show-mobile ${styles.matrixShare}`} style={{display:'none'}} onClick={handleScreenshot} disabled={capturing}>{capturing?'作成中...':'📷 スクショ共有'}</button>}</div>{error&&<p role="alert">{error}</p>}<div ref={captureRef} className={styles.matrixCapture}><h3>{p.name}</h3><p className="subtitle">{admin?'有効な予約の枚数・残席です。':'自分扱いの有効な予約の枚数です。'}割引の有無を合算しています。</p><div className={styles.matrixScroll}><table className={styles.matrix}><thead><tr><th scope="col">公演回</th>{[...columns].map(([id,name])=><th scope="col" key={id}>{name}</th>)}<th scope="col">合計</th>{admin&&<><th scope="col">定員</th><th scope="col">残席</th></>}</tr></thead><tbody>{p.stages.map(s=><tr key={s.id}><th scope="row">{s.stageDate?.slice(0,10)} {s.startTime}<small>{s.stageName}</small></th>{[...columns].map(([id])=><td key={id}>{count(s.id,id)}枚</td>)}<td><strong>{count(s.id)}枚</strong></td>{admin&&<><td>{s.capacity??'未設定'}</td><td>{s.capacity===null?'未設定':`${s.capacity-count(s.id)}席`}</td></>}</tr>)}</tbody><tfoot><tr><th scope="row">全公演回の合計</th>{[...columns].map(([id])=><td key={id}>{count(null,id)}枚</td>)}<td>{count(null)}枚</td>{admin&&<><td>—</td><td>—</td></>}</tr></tfoot></table></div></div></section>;
}
