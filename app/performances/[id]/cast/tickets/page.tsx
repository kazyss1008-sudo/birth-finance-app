import TicketManager from '@/components/TicketManager';
export default async function Page({params}:{params:Promise<{id:string}>}){return <TicketManager id={(await params).id}/>;}
