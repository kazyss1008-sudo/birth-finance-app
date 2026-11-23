import type {Booking,TicketPerformance} from './TicketForm';
import styles from './Tickets.module.css';
export function StageMatrix({performance:p,reservations,admin}:{performance:TicketPerformance;reservations:Booking[];admin:boolean}){
 const active=reservations.filter(r=>!r.cancelled);
 const columns=new Map(p.ticketTypes.map(t=>[t.id,t.name]));
 const key=(line:Booking['lines'][number])=>line.ticketTypeId||`history:${line.name}`;
 for(const r of active)for(const l of r.lines)if(!columns.has(key(l)))columns.set(key(l),l.name);
 const count=(stageId:string|null,typeId?:string)=>active.filter(r=>stageId===null||r.stageId===stageId).reduce((sum,r)=>sum+r.lines.filter(l=>!typeId||key(l)===typeId).reduce((n,l)=>n+l.quantity,0),0);
 return <section className={styles.line}><h2>公演回別の予約枚数{admin?'・残席':''}</h2><p className="subtitle">{admin?'有効な予約の枚数です。':'自分扱いの有効な予約の枚数です。'}割引の有無を合算しています。</p><div className={styles.matrixScroll}><table className={styles.matrix}><thead><tr><th scope="col">公演回</th>{[...columns].map(([id,name])=><th scope="col" key={id}>{name}</th>)}<th scope="col">合計</th>{admin&&<><th scope="col">定員</th><th scope="col">残席</th></>}</tr></thead><tbody>{p.stages.map(s=><tr key={s.id}><th scope="row">{s.stageDate?.slice(0,10)} {s.startTime}<small>{s.stageName}</small></th>{[...columns].map(([id])=><td key={id}>{count(s.id,id)}枚</td>)}<td><strong>{count(s.id)}枚</strong></td>{admin&&<><td>{s.capacity??'未設定'}</td><td>{s.capacity===null?'未設定':`${s.capacity-count(s.id)}席`}</td></>}</tr>)}</tbody><tfoot><tr><th scope="row">全公演回の合計</th>{[...columns].map(([id])=><td key={id}>{count(null,id)}枚</td>)}<td>{count(null)}枚</td>{admin&&<><td>—</td><td>—</td></>}</tr></tfoot></table></div></section>;
}
