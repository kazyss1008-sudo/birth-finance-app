const {test}=require('node:test');
const assert=require('node:assert/strict');
const {amount,totals,cutoff,assertWindow,snapshotLines,bookingInput}=require('../lib/tickets/domain.ts');
const types=[{id:'adult',name:'一般',price:3500,active:true},{id:'invite',name:'招待',price:500,active:true}];
test('mixed cards, variable discounts and zero floor',()=>{
 const lines=snapshotLines([{ticketTypeId:'adult',quantity:2,repeater:false},{ticketTypeId:'adult',quantity:1,repeater:true},{ticketTypeId:'invite',quantity:2,repeater:true}],[],types,true,1200);
 assert.deepEqual(totals(lines),{quantity:5,amount:9300});assert.equal(amount(lines[2]),0);
});
test('existing price and discount are preserved after master changes, removing discount restores saved base price',()=>{
 const old=[{id:'a',ticketTypeId:'adult',name:'旧一般',basePrice:3000,discount:1000,repeater:true,quantity:1}];
 const next=snapshotLines([{id:'a',ticketTypeId:'adult',quantity:2,repeater:false},{ticketTypeId:'adult',quantity:1,repeater:true}],old,types,true,1500);
 assert.equal(next[0].name,'旧一般');assert.equal(next[0].discount,1000);assert.deepEqual(totals(next),{quantity:3,amount:8000});
 assert.throws(()=>snapshotLines([{id:'other',ticketTypeId:'adult',quantity:1,repeater:true}],old,types,true,1000));
 assert.throws(()=>snapshotLines([{id:'a',ticketTypeId:'invite',quantity:1,repeater:true}],old,types,true,1000));
});
test('sale start inclusive; JST midnight exclusive across host timezones',()=>{
 const stage=new Date('2026-12-20T00:00:00Z'),start=new Date('2026-12-01T01:00:00Z');
 assert.equal(cutoff(stage).toISOString(),'2026-12-19T15:00:00.000Z');
 assert.throws(()=>assertWindow(false,start,[stage],new Date(start-1)));
 assert.doesNotThrow(()=>assertWindow(false,start,[stage],start));
 assert.doesNotThrow(()=>assertWindow(false,start,[stage],new Date('2026-12-19T14:59:59.999Z')));
 assert.throws(()=>assertWindow(false,start,[stage],new Date('2026-12-19T15:00:00.000Z')));
 assert.doesNotThrow(()=>assertWindow(true,null,[null],new Date('2030-01-01')));
 assert.throws(()=>assertWindow(false,start,[stage,new Date('2026-12-21')],new Date('2026-12-19T15:00:00Z')));
});
test('client amounts cannot override trusted snapshot; invalid quantities rejected',()=>{
 const b={requestKey:crypto.randomUUID(),stageId:'1',customerName:'テスト',email:'test@example.invalid',lines:[{ticketTypeId:'adult',quantity:1,repeater:false,basePrice:1,discount:99999}]};
 const input=bookingInput.parse(b);assert.equal(input.lines[0].basePrice,undefined);
 assert.equal(totals(snapshotLines(input.lines,[],types,true,1000)).amount,3500);
 assert.throws(()=>bookingInput.parse({...b,lines:[{...b.lines[0],quantity:0}]}));
});
