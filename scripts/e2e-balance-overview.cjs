// HTTP integration tests against the dedicated synthetic UAT environment.
const assert=require('node:assert/strict');
const base=process.env.E2E_BASE_URL;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):3121$/.test(base))throw Error('Explicit independent UAT server :3121 required');
let checks=0;function check(value,message){assert.ok(value,message);checks++}
async function call(url,cookie,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{cookie:cookie||'',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
async function login(username){const r=await call('/api/auth/login','',{username,password:'Demo12345!'});check(r.status===200,'login '+username);return r.cookie}
(async()=>{
const admin=await login('epacket.admin'),sales=await login('epacket.sales'),client=await login('uat.partial'),finance=await login('uat.finance');
check((await call('/api/financials?view=overview')).status===401,'anonymous denied');
check((await call('/api/financials?view=overview',client)).status===403,'Client overview denied');
check((await call('/api/financials?view=overview',finance)).status===403,'Finance operational overview denied');
const all=await call('/api/financials?view=overview',admin),scoped=await call('/api/financials?view=overview',sales);
check(all.status===200&&all.data.items.length>=16,'Admin sees all synthetic clients');
const users=(await call('/api/users',admin)).data,salesId=users.find(u=>u.username==='epacket.sales').id;
const expected=users.filter(u=>u.role==='CLIENT'&&u.sales_user_id===salesId).map(u=>u.id).sort((a,b)=>a-b);
check(JSON.stringify(scoped.data.items.map(u=>u.id).sort((a,b)=>a-b))===JSON.stringify(expected),'Sales exactly assigned Clients');
for(const c of all.data.items){const f=(await call('/api/financials?client_id='+c.id,admin)).data;for(const key of ['purchasing_balance_cents','credit_limit_cents','receivable_cents','reserved_cents','available_to_buy_cents','purchase_blocked'])check(c[key]===f[key],'overview parity '+key);check(!('transactions' in c)&&!('items' in c),'summary exposes no transactions');}
const outsider=all.data.items.find(c=>!expected.includes(c.id));check((await call('/api/financials?client_id='+outsider.id,sales)).status===400,'Sales cannot drill into unassigned Client');
const partial=all.data.items.find(c=>c.username==='uat.partial');const before=(await call('/api/financials?client_id='+partial.id,admin)).data;
const key='overview-concurrency-'+Date.now(),body={client_user_id:partial.id,entry_type:'PAYMENT',amount:1,occurred_at:'2026-10-18',request_key:key,note:'Synthetic concurrency UAT'};
const results=await Promise.all([call('/api/ledger',sales,body),call('/api/ledger',sales,body)]);
check(results.every(r=>r.status===201)&&results[0].data.id===results[1].data.id,'concurrent payment exactly one');
check((await call('/api/ledger',sales,{...body,amount:2})).status===400,'same key changed payload denied');
const after=(await call('/api/financials?client_id='+partial.id,admin)).data;check(after.balance_cents===before.balance_cents+100,'concurrent payment changes balance once');
const current=(await call('/api/financials?client_id='+partial.id,admin)).data;
const fee={client_id:partial.id,action:'additional_fee',quantity:1,unit_price:0.01,occurred_at:'2026-10-18',note:'Synthetic before-after test',request_key:'overview-before-after-'+Date.now()};
const command=await call('/api/financials',admin,fee);check(command.status===200,'command succeeded');check(command.data.before_summary.available_to_buy_cents===current.available_to_buy_cents,'atomic before summary');check(command.data.available_to_buy_cents===current.available_to_buy_cents-1,'actual after summary');
const replay=await call('/api/financials',admin,fee);check(replay.data.available_to_buy_cents===command.data.available_to_buy_cents,'fee replay no duplicate debit');check(replay.data.before_summary.available_to_buy_cents===replay.data.available_to_buy_cents,'replay before equals current no-op');
const ready=(await call('/api/orders/tracking-queue?view=READY',admin)).data,issues=(await call('/api/orders/tracking-queue?view=ISSUES',admin)).data;
const readyRows=ready.rows||[],issueRows=issues.rows||[];
check(readyRows.every(r=>r.purchase_status==='READY'),'ready only eligible');check(![...readyRows,...issueRows].some(r=>['LEDGER-UAT-2','LEDGER-UAT-3','LEDGER-UAT-4'].includes(r.client_order_id)),'Client drafts excluded from both queues');
const locks=issueRows.filter(r=>r.customer==='Mekong Accessories');check(locks.length>0&&locks.every(r=>r.purchase_error_type==='DATA'),'custom account lock reason classified DATA');
console.log('BALANCE OVERVIEW HTTP PASS ('+checks+' assertions)');
})().catch(e=>{console.error(e);process.exit(1)});
