'use client';
import {useEffect,useState} from 'react';
import styles from './Tickets.module.css';
export function CastMaster({id,saved}:{id:string;saved:()=>Promise<void>}){
 const [rows,setRows]=useState<{id:string;name:string;roleName:string}[]>([]);const [name,setName]=useState('');const [role,setRole]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){const r=await fetch(`/api/performances/${id}/casts`);if(!r.ok)throw new Error('キャストを取得できません');setRows(await r.json());}
 useEffect(()=>{load().catch(e=>setMessage(e.message));},[id]);
 async function save(body:unknown,method:string){setBusy(true);setMessage('');try{const r=await fetch(`/api/performances/${id}/casts`,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error('保存できませんでした。名前の重複・入力内容をご確認ください');await load();await saved();setMessage('保存しました');if(method==='POST'){setName('');setRole('');}}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <details className={styles.line}><summary>キャスト・役名マスタ</summary><p>ノルマ・バック対象設定とログイン設定は、公演トップのキャスト画面で管理します。</p>{rows.map((r,i)=><div key={r.id} className={styles.line}><label>キャスト名<input value={r.name} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/></label><label>役名<input value={r.roleName} onChange={e=>setRows(rows.map((x,j)=>j===i?{...x,roleName:e.target.value}:x))}/></label><button disabled={busy} onClick={()=>save({castId:r.id,name:r.name,roleName:r.roleName},'PUT')}>保存</button></div>)}<h3>キャスト追加</h3><label>名前<input value={name} onChange={e=>setName(e.target.value)}/></label><label>役名<input value={role} onChange={e=>setRole(e.target.value)}/></label><button disabled={busy||!name.trim()} onClick={()=>save({name,roleName:role},'POST')}>追加</button><p role="status">{message}</p></details>;
}
