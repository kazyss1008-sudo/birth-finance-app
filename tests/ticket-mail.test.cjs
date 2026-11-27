const {test,beforeEach}=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const orig=Module._load;let mail,sends,fail,delivered;
const db={reservationMail:{findUnique:async()=>({...mail}),updateMany:async({where,data})=>{if(where.state!==mail.state||(where.attempts!==undefined&&where.attempts!==mail.attempts))return{count:0};Object.assign(mail,{...data,attempts:data.attempts?mail.attempts+1:mail.attempts});return{count:1}},update:async({data})=>Object.assign(mail,data)}};
Module._load=function(id,...args){if(id==='@/lib/prisma')return{prisma:db};if(id==='@/lib/mail')return{sendMail:async(...args)=>{delivered=args;sends++;if(fail)throw Error('timeout')}};return orig.call(this,id,...args)};
const {deliverReservationMail}=require('../lib/tickets/notification.ts');
beforeEach(()=>{mail={state:'PENDING',attempts:0,recipient:'test@example.invalid',subject:'test',body:'test'};sends=0;fail=false;delete process.env.RESERVATION_MAIL_ENABLED;delete process.env.GMAIL_APP_PASSWORD;});
test('unconfigured mail is not success and never calls SMTP',async()=>{await deliverReservationMail('1');assert.equal(mail.state,'UNCONFIGURED');assert.equal(sends,0)});
test('single compare-and-set claim prevents concurrent double send',async()=>{Object.assign(process.env,{RESERVATION_MAIL_ENABLED:'true',GMAIL_USER:'tac.birth2003@gmail.com',GMAIL_APP_PASSWORD:'mock-only'});await Promise.all([deliverReservationMail('1'),deliverReservationMail('1')]);assert.equal(sends,1);assert.equal(mail.state,'SENT');await deliverReservationMail('1',true,true);assert.equal(sends,1)});
test('ambiguous SMTP failure preserves reservation and requires sent-folder review before retry',async()=>{Object.assign(process.env,{RESERVATION_MAIL_ENABLED:'true',GMAIL_USER:'tac.birth2003@gmail.com',GMAIL_APP_PASSWORD:'mock-only'});fail=true;await deliverReservationMail('1');assert.equal(mail.state,'UNKNOWN');await deliverReservationMail('1');assert.equal(sends,1);await assert.rejects(deliverReservationMail('1',true),/送信済み/);fail=false;await deliverReservationMail('1',true,true);assert.equal(mail.state,'SENT');assert.equal(sends,2)});

test('delivery includes named map HTML and the original text fallback from the saved receipt',async()=>{
 Object.assign(process.env,{RESERVATION_MAIL_ENABLED:'true',GMAIL_USER:'tac.birth2003@gmail.com',GMAIL_APP_PASSWORD:'mock-only'});
 mail.body='会場：予約時の会場\n　https://maps.google.com/saved\n予約番号：B-1';
 await deliverReservationMail('1');
 assert.equal(delivered[2],mail.body);
 assert.match(delivered[4],/<a href="https:\/\/maps.google.com\/saved">会場地図<\/a>/);
 assert.equal(mail.state,'SENT');
});
