const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');
const original=Module._load;let state;let serial=Promise.resolve();
const clone=x=>structuredClone(x);
const stage={id:1n,performanceId:10n,stageDate:new Date('2099-12-20'),startTime:'14:00',capacity:3,stageName:'昼'};
const p={id:10n,name:'検証公演',venue:'会場',ticketSalesEnabled:true,ticketSalesStart:new Date('2000-01-01'),repeaterEnabled:true,repeaterDiscount:1000,ticketTypes:[{id:'adult',name:'一般',price:3000,active:true}]};
const cast={id:2n,performanceId:10n,email:'cast@example.invalid',schedulePasswordHash:'hash',scheduleAuthVersion:1,name:'役者'};
const db={
 $queryRaw:async(strings,...values)=>{state.locks++;if(strings.join('').includes('MAX(SUBSTRING(number')){const pattern=new RegExp(values[0]);const numbers=state.reservations.map(r=>pattern.exec(r.number)?.[1]).filter(Boolean).map(Number);return [{next:Math.max(0,...numbers)+1}]}},
 performance:{findUnique:async()=>p},cast:{findUnique:async()=>cast,findFirst:async({where})=>where.id===cast.id?cast:null},
 performanceStage:{findFirst:async({where})=>where.id===1n?stage:{...stage,id:where.id,stageDate:new Date('2000-01-01')}},
 reservation:{
 findUnique:async({where})=>clone(state.reservations.find(r=>Object.entries(where).every(([k,v])=>r[k]===v))??null),
 create:async({data})=>{const r={...data,id:crypto.randomUUID(),version:1,lines:data.lines.create.map(l=>({...l,id:crypto.randomUUID()})),stage};state.reservations.push(r);return clone(r)},
 update:async({where,data})=>{const r=state.reservations.find(r=>r.id===where.id);const {lines,...rest}=data;Object.assign(r,{...rest,version:r.version+1,...(lines?{lines:lines.create.map(l=>({...l,id:crypto.randomUUID()}))}:{})});r.stage=r.stageId===1n?stage:{...stage,id:r.stageId,stageDate:new Date('2000-01-01')};return clone(r)},
 },
 reservationLine:{deleteMany:async()=>{},aggregate:async({where})=>({_sum:{quantity:state.reservations.filter(r=>!r.cancelled&&r.stageId===where.reservation.stageId&&r.id!==where.reservation.id?.not).reduce((s,r)=>s+r.lines.reduce((n,l)=>n+l.quantity,0),0)}})},
 reservationHistory:{create:async({data})=>state.history.push(data)},
 reservationMail:{create:async({data})=>state.mails.push(data)},
 sale:{count:async()=>state.legacy,upsert:async({where,create,update})=>{state.sales[where.reservationId]={...(state.sales[where.reservationId]?update:create)}},deleteMany:async({where})=>{delete state.sales[where.reservationId]}},
 $transaction:async fn=>{const prev=serial;let release;serial=new Promise(r=>release=r);await prev;const backup=clone(state);try{return await fn(db)}catch(e){state=backup;throw e}finally{release()}},
};
Module._load=function(id,...args){if(id==='@/lib/prisma')return {prisma:db};if(id==='@/lib/auth')return {getSessionUser:async()=>state.admin};if(id==='@/lib/cast-auth')return {getCastSession:async()=>state.cast};return original.call(this,id,...args)};
const {saveBooking,actorFor}=require('../lib/tickets/service.ts');const {mailText}=require('../lib/tickets/notification.ts');
const admin={kind:'admin',id:'1',castId:null};const actor={kind:'cast',id:'2',castId:2n,version:1};const publicActor={kind:'public',id:'public',castId:null};
const input=(extra={})=>({requestKey:crypto.randomUUID(),stageId:'1',customerName:'テスト',email:'customer@example.invalid',lines:[{ticketTypeId:'adult',quantity:2,repeater:true}],...extra});
beforeEach(()=>{state={reservations:[],history:[],mails:[],sales:{},locks:0,legacy:0};process.env.TICKETS_PUBLIC_ENABLED='true';stage.capacity=3;});
test('concurrent booking capacity and duplicate replay preserve one ledger and projection',async()=>{
 const data=input();const results=await Promise.allSettled([saveBooking(10n,publicActor,data),saveBooking(10n,publicActor,input())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(state.reservations.length,1);assert.equal(state.mails.length,1);
 const replay=await saveBooking(10n,publicActor,data);assert.equal(replay.id,state.reservations[0].id);assert.equal(state.reservations.length,1);assert.equal(Object.values(state.sales)[0].salesAmount,4000);assert.equal(Object.values(state.sales)[0].castId,null);
 await assert.rejects(saveBooking(10n,publicActor,{...data,customerName:'別人'}),/送信済み/);
});
test('cast ownership, stale version, deadline on source and destination, administrator override',async()=>{
 const created=await saveBooking(10n,actor,input());const edit=input({version:1,lines:created.lines,stageId:'2'});
 await assert.rejects(saveBooking(10n,actor,edit,created.id),/受付は終了/);
 await assert.rejects(saveBooking(10n,{...actor,castId:3n},input({version:1}),created.id),/予約がありません/);
 await assert.rejects(saveBooking(10n,actor,input({version:99}),created.id),/他の操作/);
 const updated=await saveBooking(10n,admin,{...edit,castId:'2'},created.id);assert.equal(updated.stageId,2n);
 await assert.rejects(saveBooking(10n,actor,input({version:2,stageId:'1'}),created.id),/受付は終了/);
 const cancelled=await saveBooking(10n,admin,input({version:2,stageId:'2',castId:'2',cancelled:true}),created.id);assert.equal(cancelled.cancelled,true);assert.equal(Object.keys(state.sales).length,0);assert.equal(state.history.length,3);
});
test('editing toggles saved discount and updates finance instantly',async()=>{
 const r=await saveBooking(10n,admin,input());const line={...r.lines[0],repeater:false};await saveBooking(10n,admin,input({version:1,lines:[line]}),r.id);
 assert.equal(state.sales[r.id].salesAmount,6000);assert.equal(state.sales[r.id].ticketCount,2);
});
test('public flag is closed by default; cast auth versions revoked; old CSV protected',async()=>{
 delete process.env.TICKETS_PUBLIC_ENABLED;await assert.rejects(saveBooking(10n,publicActor,input()),/受付を停止/);
 await assert.rejects(saveBooking(10n,{...actor,version:0},input()),/再ログイン/);
 state.legacy=1;await assert.rejects(saveBooking(10n,admin,input()),/既存CSV/);
 assert.equal(state.reservations.length,0);
});
test('actor resolution never accepts a cast from another performance',async()=>{
 state.cast=cast;assert.equal((await actorFor(10n)).id,'2');await assert.rejects(actorFor(11n),/ログイン/);
});
test('receipt contains required details but no cast attribution',async()=>{
 const r=await saveBooking(10n,actor,input());const body=mailText(r,p,stage);assert.match(body,/申込内容\n　/);assert.match(body,/リピーター割引/);assert.match(body,/4000円/);assert.match(body,/合計金額：/);assert.match(body,/日時：\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}〜/);assert.match(body,/当日精算/);assert.match(body,/会場/);assert.doesNotMatch(body,/役者|取扱|お支払い予定額|半券/);
});
test('ticket back and quota respond to quantity, not discount or type price, and cancellation clears sales',async()=>{
 const {calculateTicketBack}=require('../lib/ticketBack.ts');const rules=[{minTicketCount:1,maxTicketCount:1,backUnitPrice:100},{minTicketCount:2,maxTicketCount:null,backUnitPrice:200}];
 const r=await saveBooking(10n,actor,input());const settlement=()=>{const tickets=Object.values(state.sales).filter(s=>s.castId===2n).reduce((n,s)=>n+s.ticketCount,0);return{back:calculateTicketBack(tickets,rules),norma:Math.max(3-tickets,0)*3000}};
 assert.deepEqual(settlement(),{back:300,norma:3000});await saveBooking(10n,admin,input({castId:'2',version:1,lines:[{...r.lines[0],repeater:false}]}),r.id);assert.deepEqual(settlement(),{back:300,norma:3000});await saveBooking(10n,admin,input({castId:'2',version:2,cancelled:true}),r.id);assert.deepEqual(settlement(),{back:0,norma:9000});
});

test('cast ticket mode keeps its own identity even with a simultaneous admin login', async()=>{
 state.admin={id:1n};state.cast=cast;
 assert.equal((await actorFor(10n)).kind,'admin');
 assert.deepEqual(await actorFor(10n,undefined,true),actor);
 state.cast=null;
 await assert.rejects(()=>actorFor(10n,undefined,true),/ログイン/);
});

test('new booking sources are server-assigned and proxy bookings do not collect email or create mail',async()=>{
 const proxy=await saveBooking(10n,admin,input({source:'偽装経路'}));assert.equal(proxy.source,'管理ページ');assert.equal(proxy.email,'');assert.equal(state.mails.length,0);
 state.reservations=[];state.sales={};
 const customer=await saveBooking(10n,publicActor,input({source:'偽装経路'}));assert.equal(customer.source,'予約ページ');assert.equal(state.mails.length,1);
 const updated=await saveBooking(10n,admin,input({version:customer.version,lines:customer.lines,email:''}),customer.id);
 assert.equal(updated.email,customer.email);assert.equal(updated.source,'予約ページ');
});
test('CSV source label stays separate from its stable reimport key',async()=>{
 const {mutateBooking}=require('../lib/tickets/service.ts');
 const result=await mutateBooking(db,10n,admin,input({source:'外部A',externalNumber:'external-1'}),'hash',undefined,{source:'外部A',lines:[{ticketTypeId:null,name:'一般',basePrice:3000,discount:0,repeater:false,quantity:1}]});
 assert.equal(result.source,'CSV');assert.equal(result.importSource,'外部A');assert.equal(result.externalKey,'10:外部A:external-1');
});

test('short numbers are sequential, ignore legacy UUIDs, and remain stable on replay and editing',async()=>{
 stage.capacity=10;
 state.reservations.push({id:'legacy',number:'BIRTH-12345678-abcd-4321-abcd-123456789012',cancelled:true,lines:[]});
 const data=input();
 const first=await saveBooking(10n,publicActor,data);
 assert.equal(first.number,'B-001-0001');
 assert.equal(state.mails[0].subject.includes(first.number),true);
 assert.equal(Object.values(state.sales)[0].reservationNo,first.number);
 assert.equal((await saveBooking(10n,publicActor,data)).number,first.number);
 const second=await saveBooking(10n,admin,input());
 assert.equal(second.number,'B-001-0002');
 const cancelled=await saveBooking(10n,admin,input({version:1,cancelled:true}),first.id);
 assert.equal(cancelled.number,first.number);
 assert.equal((await saveBooking(10n,admin,input())).number,'B-001-0003');
 assert.equal(state.reservations[0].number,'BIRTH-12345678-abcd-4321-abcd-123456789012');
});

test('simultaneous bookings receive different short numbers',async()=>{
 stage.capacity=10;
 const results=await Promise.all([saveBooking(10n,admin,input()),saveBooking(10n,admin,input())]);
 assert.deepEqual(results.map(r=>r.number),['B-001-0001','B-001-0002']);
});


test('each stage starts at 0001, moving a reservation keeps its issued number',async()=>{
 stage.capacity=10;
 const first=await saveBooking(10n,admin,input());
 const other=await saveBooking(10n,admin,input({stageId:'2'}));
 assert.equal(first.number,'B-001-0001');assert.equal(other.number,'B-002-0001');
 const moved=await saveBooking(10n,admin,input({version:1,stageId:'2',lines:first.lines}),first.id);
 assert.equal(moved.number,'B-001-0001');
 assert.equal((await saveBooking(10n,admin,input())).number,'B-001-0002');
});

test('fixed-width codes reject overflow and do not reuse cancelled numbers',async()=>{
 state.reservations.push({id:'last',number:'B-001-9999',cancelled:true,lines:[]});
 await assert.rejects(saveBooking(10n,admin,input()),/4桁上限/);
 await assert.rejects(saveBooking(10n,admin,input({stageId:'1000'})),/3桁上限/);
 assert.equal(state.reservations.length,1);assert.equal(state.history.length,0);
});


test('direct cancellation uses the same finance, ownership, deadline and version checks as editing',async()=>{
 const {cancelBooking}=require('../lib/tickets/service.ts');
 const r=await saveBooking(10n,actor,input());
 await assert.rejects(cancelBooking(10n,{...actor,castId:3n},r.id,1),/予約がありません/);
 await assert.rejects(cancelBooking(11n,admin,r.id,1),/予約がありません/);
 await assert.rejects(cancelBooking(10n,actor,r.id,99),/他の操作/);
 const cancelled=await cancelBooking(10n,actor,r.id,1);
 assert.equal(cancelled.cancelled,true);assert.equal(Object.keys(state.sales).length,0);
 assert.equal(cancelled.number,r.number);assert.equal(state.history.length,2);
});

test('only administrators can remove cancelled bookings; deletion preserves numbers and rejects revival',async()=>{
 const {cancelBooking,deleteCancelledBooking}=require('../lib/tickets/service.ts');
 const body=input();const r=await saveBooking(10n,publicActor,body);
 await assert.rejects(deleteCancelledBooking(10n,actor,r.id,1),/管理者のみ/);
 await assert.rejects(deleteCancelledBooking(11n,admin,r.id,1),/予約がありません/);
 await assert.rejects(deleteCancelledBooking(10n,admin,r.id,1),/キャンセル済み/);
 await cancelBooking(10n,admin,r.id,1);
 await assert.rejects(deleteCancelledBooking(10n,admin,r.id,1),/他の操作/);
 await deleteCancelledBooking(10n,admin,r.id,2);
 const removed=state.reservations.find(x=>x.id===r.id);assert.ok(removed.deletedAt);assert.equal(removed.cancelled,true);
 assert.equal(state.reservations.length,1);assert.equal(state.history.length,3);assert.equal(Object.keys(state.sales).length,0);
 await deleteCancelledBooking(10n,admin,r.id,2);assert.equal(state.history.length,3);
 await assert.rejects(saveBooking(10n,admin,input({version:3}),r.id),/削除済み/);
 await assert.rejects(saveBooking(10n,publicActor,body),/削除済み/);
 const next=await saveBooking(10n,admin,input());assert.equal(next.number,'B-001-0002');
});
