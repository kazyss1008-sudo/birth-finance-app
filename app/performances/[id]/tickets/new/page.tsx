import TicketManager from '@/components/TicketManager';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <TicketManager id={id} formMode="new"/>;}
