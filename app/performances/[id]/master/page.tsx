import MasterManager from '@/components/MasterManager';
export default async function Page({params}:{params:Promise<{id:string}>}){return <MasterManager id={(await params).id}/>;}
