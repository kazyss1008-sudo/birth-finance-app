const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const original=Module._load;let user,used,history,enabled,exists,removed,locked,updates;
const tx={performanceStage:{findMany:async()=>[]},ticketType:{findFirst:async()=>exists?{id:'t',active:true}:null,count:async()=>1,delete:async()=>{assert.ok(locked);removed++}},reservationLine:{count:async()=>used},reservationHistory:{findFirst:async()=>history?{id:'h'}:null},performance:{findUnique:async()=>({ticketSalesEnabled:enabled}),update:async query=>{updates.push(query.data);return{}}}};
Module._load=function(id,...args){if(id==='@/lib/prisma')return{prisma:{$transaction:async fn=>fn(tx)}};if(id==='@/lib/auth')return{getSessionUser:async()=>user};if(id==='@/lib/tickets/service')return{lockPerformance:async()=>{locked=true}};return original.call(this,id,...args)};
const {DELETE,PUT}=require('../app/api/performances/[id]/ticket-settings/route.ts');
const call=(origin)=>DELETE(new Request('http://localhost/api/performances/1/ticket-settings',{method:'DELETE',headers:origin?{origin}:{},body:JSON.stringify({ticketTypeId:'t'})}),{params:Promise.resolve({id:'1'})});
beforeEach(()=>{user={id:1};used=0;history=false;enabled=false;exists=true;removed=0;locked=false;updates=[]});
test('unused type can be deleted under the same performance lock as reservations',async()=>{assert.equal((await call()).status,200);assert.equal(removed,1)});
test('current or cancelled reservation lines prevent deletion',async()=>{used=1;assert.equal((await call()).status,409);assert.equal(removed,0)});
test('past reservation history prevents deletion after its line was edited out',async()=>{history=true;assert.equal((await call()).status,409);assert.equal(removed,0)});
test('another performance type and anonymous/cross-origin requests cannot delete',async()=>{exists=false;assert.equal((await call()).status,404);user=null;assert.equal((await call()).status,401);assert.equal((await call('https://other.invalid')).status,403);assert.equal(removed,0)});
test('last active type is retained while reception is enabled',async()=>{enabled=true;assert.equal((await call()).status,409);assert.equal(removed,0)});

test('map URLs reject executable schemes before beginning a transaction',async()=>{
 const body={name:'公演',ticketSalesEnabled:false,ticketSalesStart:null,venue:'会場',venueMapUrl:'javascript:alert(1)',repeaterEnabled:false,repeaterDiscount:1000,ticketTypes:[],stages:[]};
 const result=await PUT(new Request('http://localhost/api/performances/1/ticket-settings',{method:'PUT',body:JSON.stringify(body)}),{params:Promise.resolve({id:'1'})});
 assert.equal(result.status,422);assert.equal(locked,false);
});

test('venue map URL saves HTTPS and normalizes empty input to null',async()=>{
 for(const value of ['https://maps.google.com/test','']){
  updates=[];
  const body={name:'公演',ticketSalesEnabled:false,ticketSalesStart:null,venue:'会場',venueMapUrl:value,repeaterEnabled:false,repeaterDiscount:1000,ticketTypes:[],stages:[]};
  const result=await PUT(new Request('http://localhost/api/performances/1/ticket-settings',{method:'PUT',body:JSON.stringify(body)}),{params:Promise.resolve({id:'1'})});
  assert.equal(result.status,200);assert.equal(updates[0].venueMapUrl,value||null);
 }
});
