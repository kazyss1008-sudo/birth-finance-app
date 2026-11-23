export function CastNav({id,active}:{id:string;active:'home'|'schedule'|'tickets'}){
 const base=`/performances/${id}/cast`;
 return <nav className="performance-nav" aria-label="マイページメニュー">{[['schedule','スケジュール登録',base+'?view=schedule'],['tickets','チケット管理',base+'/tickets']].map(([key,label,url])=><a key={key} href={url} className={active===key?'secondary':'performance-link'} aria-current={active===key?'page':undefined}>{label}</a>)}</nav>;
}
