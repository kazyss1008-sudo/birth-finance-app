 'use client';
import {usePathname} from 'next/navigation';
export function PerformanceNav(){
 const path=usePathname();const match=path.match(/^\/performances\/(\d+)(?:\/(schedule|tickets))?$/);if(!match)return null;
 const base=`/performances/${match[1]}`;
 return <nav className="performance-nav" aria-label="公演メニュー">{[['スケジュール',base+'/schedule'],['チケット',base+'/tickets'],['収支・売上',base],['キャスト',base+'?tab='+encodeURIComponent('キャスト')],['公演設定',base+'/tickets?view=settings']].map(([label,url])=><a key={label} className={path===url?'secondary':'performance-link'} href={url} aria-current={path===url?'page':undefined}>{label}</a>)}</nav>;
}
