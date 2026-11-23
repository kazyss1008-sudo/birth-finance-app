import TicketManager from '@/components/TicketManager';
export default async function Page({params}:{params:Promise<{id:string}>}){return <TicketManager castOnly id={(await params).id}/>;}
