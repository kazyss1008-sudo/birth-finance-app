const {test}=require('node:test');const assert=require('node:assert/strict');
const {saleDetailRows}=require('../lib/tickets/sale-rows.ts');
const lines=[{id:'l1',ticketTypeId:'adult',name:'通常',basePrice:6000,discount:1000,repeater:false,quantity:2},{id:'l2',ticketTypeId:'adult',name:'通常',basePrice:6000,discount:1000,repeater:true,quantity:1}];
const sale={id:'1',ticketCount:3,salesAmount:17000,ticketType:'通常・通常/リピーター割引',reservationNo:'B-02101900-0001',customerName:'お客様',handledCastName:'劇団Birth',visitedAt:'2027-02-10T19:00:00Z',reservation:{lines}};
test('one reservation expands into its detail quantities and stored-price amounts without duplicating totals',()=>{
 const rows=saleDetailRows([sale]);
 assert.equal(rows.length,2);assert.equal(new Set(rows.map(r=>r.id)).size,2);
 assert.deepEqual(rows.map(r=>[r.ticketType,r.ticketCount,r.salesAmount]),[['通常',2,12000],['通常/リピーター割引',1,5000]]);
 assert.equal(rows.reduce((n,r)=>n+r.ticketCount,0),sale.ticketCount);
 assert.equal(rows.reduce((n,r)=>n+r.salesAmount,0),sale.salesAmount);
 for(const row of rows){for(const key of ['reservationNo','customerName','handledCastName','visitedAt'])assert.equal(row[key],sale[key]);}
 assert.equal(sale.ticketCount,3);assert.equal(sale.ticketType,'通常・通常/リピーター割引');
 assert.equal(rows.filter(r=>r.ticketType==='通常/リピーター割引').length,1);
});
test('separate identical details remain separate; discounts cannot make a line negative',()=>{
 const rows=saleDetailRows([{...sale,reservation:{lines:[lines[0],{...lines[0],id:'l3'},{...lines[1],id:'l4',basePrice:500,discount:1000}]}}]);
 assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.id)).size,3);assert.equal(rows[2].salesAmount,0);
});
test('legacy CSV sales and single-line reservations retain correct amounts and rows',()=>{
 const legacy={...sale,id:'legacy',reservation:null};const empty={...sale,id:'empty',reservation:{lines:[]}};
 const single={...sale,id:'single',ticketCount:2,salesAmount:12000,reservation:{lines:[lines[0]]}};
 const rows=saleDetailRows([legacy,empty,single]);assert.equal(rows.length,3);
 assert.deepEqual(rows.slice(0,2),[legacy,empty]);assert.equal(rows[2].ticketCount,2);assert.equal(rows[2].salesAmount,12000);
});
