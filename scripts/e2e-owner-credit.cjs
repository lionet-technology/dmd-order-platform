// Requires the disposable fixture printed by verify-owner-credit.cjs; never seeds/resets a DB.
const base=process.env.E2E_BASE_URL;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Explicit localhost E2E_BASE_URL required');
let checks=0;const check=(v,m)=>{checks++;if(!v)throw Error(m)};
async function call(path,cookie,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
(async()=>{
 const cookies={};for(const role of ['admin','sales','finance','client']){const r=await call('/api/auth/login',null,{username:'owner.'+role,password:'TestPass123!'});check(r.status===200,'Login '+role);cookies[role]=r.cookie;}
 const users=(await call('/api/users',cookies.admin)).data,id=users.find(u=>u.username==='owner.client').id;
 const stamp=Date.now();
 const fee=await call('/api/financials',cookies.sales,{client_id:id,action:'additional_fee',unit_price:300,quantity:1,request_key:'owner-http-fee-'+stamp});check(fee.status===200,'Sales records operational charge');
 let f=(await call('/api/financials?client_id='+id,cookies.admin)).data;
 const transfer={client_id:id,action:'debt',amount:50,deadline:'2026-12-31',reason:'Synthetic concurrent transfer independent of Statement',request_key:'owner-http-transfer-'+stamp};
 for(const role of ['sales','finance','client'])check((await call('/api/financials',cookies[role],transfer)).status>=400,'Deny transfer '+role);
 const parallel=await Promise.all([call('/api/financials',cookies.admin,transfer),call('/api/financials',cookies.admin,transfer)]);
 check(parallel.every(r=>r.status===200),'Concurrent Admin transfers succeed');
 f=(await call('/api/financials?client_id='+id,cookies.admin)).data;
 check(f.net_balance_cents===fee.data.net_balance_cents+5000,'Concurrent same-key transfer releases room once');
 check((await call('/api/financials',cookies.admin,{...transfer,amount:51})).status===400,'Same-key changed transfer denied');
 const netBeforeRace=f.net_balance_cents;
 const raceAmount=Math.floor(-netBeforeRace*0.75)/100;
 const race=await Promise.all(['a','b'].map(key=>call('/api/financials',cookies.admin,{...transfer,amount:raceAmount,request_key:'owner-http-race-'+stamp+key})));
 check(race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===400).length===1,'Distinct commands cannot concurrently over-convert negative Balance');
 f=(await call('/api/financials?client_id='+id,cookies.admin)).data;
 check(f.net_balance_cents===netBeforeRace+Math.round(raceAmount*100),'Serialized conversion keeps exact remaining Balance');
 const payment={client_user_id:id,entry_type:'PAYMENT',amount:1,request_key:'owner-http-payment-'+stamp};
 const before=f.available_to_buy_cents;
 const paid=await Promise.all([call('/api/ledger',cookies.sales,payment),call('/api/ledger',cookies.sales,payment)]);
 check(paid.every(r=>r.status===201)&&paid[0].data.id===paid[1].data.id,'Concurrent Sales payment writes once');
 f=(await call('/api/financials?client_id='+id,cookies.admin)).data;
 check(f.available_to_buy_cents===before,'Debt payment does not increase purchasing room');
 for(const role of ['finance','client'])check((await call('/api/ledger',cookies[role],{...payment,request_key:role+stamp})).status===403,'Deny Payment writer '+role);
 check((await call('/api/financials',cookies.client)).data.transactions.every(t=>t.entry_type!=='SERVICE_COST'),'Client safe projection');
 console.log('OWNER CREDIT HTTP PASS ('+checks+' assertions)');
})().catch(e=>{console.error(e);process.exit(1)});
