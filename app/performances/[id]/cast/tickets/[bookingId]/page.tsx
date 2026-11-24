import TicketManager from '@/components/TicketManager';
export default async function Page({params}:{params:Promise<{id:string;bookingId:string}>}){const {id,bookingId}=await params;return <TicketManager id={id} bookingId={bookingId} castOnly/>;}
