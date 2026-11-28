const {test}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const original=Module._load;let saleQuery;
const lines=[{id:'l1',ticketTypeId:'adult',name:'通常',basePrice:6000,discount:1000,repeater:false,quantity:2},{id:'l2',ticketTypeId:'adult',name:'通常',basePrice:6000,discount:1000,repeater:true,quantity:1}];
const sales=[{id:1n,castId:null,ticketCount:3,salesAmount:17000,reservation:{lines}}];
const db={performance:{findUnique:async()=>({id:10n,status:'CLOSED',casts:[],ticketBackRules:[]})},sale:{findMany:async query=>{saleQuery=query;return sales;}}};
for(const name of ['expense','expenseCategory','user','goods','sponsorship'])db[name]={findMany:async()=>[]};
Module._load=function(id,...args){if(id==='@/lib/prisma')return{prisma:db};return original.call(this,id,...args)};
const route=require('../app/api/performances/[id]/all-data/route.ts');
test('finance loads stored reservation details while accounting still uses the one-row ledger totals',async()=>{
 const response=await route.GET(new Request('http://localhost'),{params:Promise.resolve({id:'10'})});
 assert.equal(response.status,200);const data=await response.json();
 assert.equal(data.sales.length,1);assert.equal(data.sales[0].reservation.lines.length,2);
 assert.equal(data.summary.totalTickets,3);assert.equal(data.summary.totalSales,17000);
 assert.equal(data.summary.castDetails[0].ticketCount,3);assert.equal(data.summary.castDetails[0].salesAmount,17000);
 assert.deepEqual(saleQuery.where,{performanceId:10n});
 assert.deepEqual(Object.keys(saleQuery.include.reservation.select),['lines']);
 assert.equal(saleQuery.include.reservation.select.lines.select.basePrice,true);
 assert.equal(saleQuery.include.reservation.select.lines.select.discount,true);
});
