const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const orig=Module._load;let records,changes,legacy;
const tx={sale:{count:async()=>legacy},performanceStage:{findMany:async()=>[{id:1n,stageDate:new Date('2099-12-20'),startTime:'14:00'}]},cast:{findMany:async()=>[{id:2n,name:'役者'}]},reservation:{findUnique:async({where})=>records.find(r=>r.externalKey===where.externalKey)||null}};
Module._load=function(id,...args){if(id==='@/lib/prisma')return{prisma:{$transaction:async fn=>fn(tx)}};if(id==='./service')return{lockPerformance:async()=>{},mutateBooking:async(_tx,pid,actor,input,hash,id,imported)=>{changes.push({input,id,imported});const old=records.find(r=>r.id===id);if(old)old.version++;else records.push({id:crypto.randomUUID(),version:1,externalKey:`${pid}:${input.source}:${input.externalNumber}`,importSource:imported.source})}};return orig.call(this,id,...args)};
const {importTicketCsv}=require('../lib/tickets/csv.ts');const actor={kind:'admin',id:'1'};
const header='取扱窓口,枚数,合計額,公演日時,予約No,チケット名称,名前';const row='Web,3,1000,2099/12/20 14:00,external1,通常[自由],検証';
beforeEach(()=>{records=[];changes=[];legacy=0});
test('preview is read-only, legacy odd totals preserved, reimport updates only same external key',async()=>{const csv=header+'\n'+row;const preview=await importTicketCsv(10n,actor,csv,'外部A');assert.equal(changes.length,0);assert.equal(preview.preview[0].amount,1000);assert.equal(preview.preview[0].quantity,3);await importTicketCsv(10n,actor,csv,'外部A',preview.token);assert.equal(records.length,1);const again=await importTicketCsv(10n,actor,csv,'外部A');assert.equal(again.preview[0].action,'更新');await importTicketCsv(10n,actor,csv,'外部A',again.token);assert.equal(records.length,1);assert.equal(changes.at(-1).id,records[0].id)});
test('manual duplicate, legacy overlap and duplicate rows abort before any mutations',async()=>{const csv=header+'\n'+row;records.push({id:'manual',externalKey:'10:外部A:external1',importSource:null,version:1});await assert.rejects(importTicketCsv(10n,actor,csv,'外部A'),/手入力済み/);records=[];legacy=1;await assert.rejects(importTicketCsv(10n,actor,csv,'外部A'),/従来CSV/);legacy=0;await assert.rejects(importTicketCsv(10n,actor,csv+'\n'+row,'外部A'),/重複/);assert.equal(changes.length,0)});
test('modified preview is rejected and missing rows never imply deletion',async()=>{records.push({id:'omitted',externalKey:'10:外部A:omitted',importSource:'外部A',version:2});const csv=header+'\n'+row;const p=await importTicketCsv(10n,actor,csv,'外部A');await assert.rejects(importTicketCsv(10n,actor,csv.replace(',1000,',',999,'),'外部A',p.token),/もう一度確認/);assert.equal(changes.length,0);await importTicketCsv(10n,actor,csv,'外部A',p.token);assert.ok(records.some(r=>r.id==='omitted'));});
test('explicit discount columns are validated and preserve discount snapshot',async()=>{const csv=header+',基本単価,割引額,リピーター割引\n'+row.replace(',1000,',',6000,')+',3000,1000,有';const p=await importTicketCsv(10n,actor,csv,'外部A');assert.equal(p.preview[0].lines[0].repeater,true);assert.equal(p.preview[0].amount,6000);await assert.rejects(importTicketCsv(10n,actor,csv.replace(',6000,',',5000,'),'外部A'),/合計額/);});

test('reimport preserves operator cancellation',async()=>{records.push({id:'cancelled',externalKey:'10:外部A:external1',importSource:'外部A',version:2,cancelled:true});const csv=header+'\n'+row;const p=await importTicketCsv(10n,actor,csv,'外部A');await importTicketCsv(10n,actor,csv,'外部A',p.token);assert.equal(changes[0].input.cancelled,true);});


test('both legacy and new internal booking numbers cannot be imported as external bookings',async()=>{
 for(const number of ['BIRTH-12345678-abcd-4321-abcd-123456789012','B-001-0001']){
  await assert.rejects(importTicketCsv(10n,actor,header+'\n'+row.replace('external1',number),'外部A'),/自前予約/);
 }
 assert.equal(changes.length,0);
});
