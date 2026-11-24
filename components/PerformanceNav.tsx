 'use client';
import {usePathname} from 'next/navigation';
export function PerformanceNav(){
 const path=usePathname();const match=path.match(/^\/performances\/(\d+)(?:\/(schedule|tickets|master)(?:\/.*)?)?$/);if(!match)return null;
 const base=`/performances/${match[1]}`;
 const active=match[2]??'finance';
 return <nav className="performance-nav" aria-label="公演メニュー">{[['スケジュール',base+'/schedule','schedule'],['チケット',base+'/tickets','tickets'],['収支・売上',base,'finance'],['マスタ',base+'/master','master']].map(([label,url,key])=><a key={key} className={active===key?'secondary':'performance-link'} href={url} aria-current={active===key?'page':undefined}>{label}</a>)}</nav>;
}
