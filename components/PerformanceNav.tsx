 'use client';
import {usePathname} from 'next/navigation';
export function PerformanceNav(){
 const path=usePathname();const match=path.match(/^\/performances\/(\d+)(?:\/(schedule|tickets))?$/);if(!match)return null;
 const base=`/performances/${match[1]}`;
 return <nav className="performance-nav" aria-label="公演メニュー">{[['収支・売上',base],['チケット',base+'/tickets'],['スケジュール',base+'/schedule'],['キャスト・役名',base+'?tab='+encodeURIComponent('キャスト')],['公演一覧','/performances']].map(([label,url])=><a key={label} className={path===url?'secondary':'performance-link'} href={url} aria-current={path===url?'page':undefined}>{label}</a>)}</nav>;
}
