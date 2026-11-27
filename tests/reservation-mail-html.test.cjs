const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reservationMailHtml}=require('../lib/tickets/mail-html.ts');

test('saved venue URL becomes a named map link with unchanged destination',()=>{
 const html=reservationMailHtml('お客様様\n会場：会場\n　https://maps.google.com/?q=Birth&zoom=15\n予約番号：B-02101900-0001\n申込内容');
 assert.match(html,/<a href="https:\/\/maps.google.com\/\?q=Birth&amp;zoom=15">会場地図<\/a>/);
 assert.match(html,/予約番号：B-02101900-0001<br>\n申込内容/);
});
test('no map leaves no link or extra map row',()=>{
 const html=reservationMailHtml('会場：会場\n予約番号：B-02101900-0001');
 assert.doesNotMatch(html,/会場地図|<a /);
 assert.match(html,/会場：会場<br>\n予約番号/);
});
test('customer text and URL attributes are escaped; executable and unrelated URLs are never links',()=>{
 const html=reservationMailHtml('<img src=x onerror=alert(1)>様\n会場：会場\n　https://example.com/?q="test"&x=1\n予約番号：B-1');
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;様/);
 assert.match(html,/href="https:\/\/example.com\/\?q=&quot;test&quot;&amp;x=1"/);
 for(const url of ['javascript:alert(1)','data:text/html,test','not-a-url']){
  assert.doesNotMatch(reservationMailHtml(`会場：会場\n　${url}\n予約番号：B-1`),/<a /);
 }
 assert.doesNotMatch(reservationMailHtml('備考\n　https://example.com/\n予約番号：B-1'),/<a /);
});
