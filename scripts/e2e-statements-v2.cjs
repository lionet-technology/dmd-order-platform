// Uses only the new disposable fixture produced by seed-refund-uat.cjs.
const base=process.env.E2E_BASE_URL;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Explicit localhost E2E_BASE_URL required');
let checks=0;const check=(v,m)=>{checks++;if(!v)throw Error(m)};
async function call(path,cookie,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),privacy:r.headers.get('cache-control'),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
(async()=>{
 const cookies={};for(const role of ['admin','sales','finance','client','bod']){const r=await call('/api/auth/login',null,{username:'uat.'+role,password:'UatRefund123!'});check(r.status===200,'Login '+role);cookies[role]=r.cookie;}
 const clientResponse=await call('/api/statements-v2?clients=1',cookies.finance);check(clientResponse.status===200,'Client list '+JSON.stringify(clientResponse.data));const clients=clientResponse.data.items,id=clients.find(c=>c.display_name==='UAT client').id;
 const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10),stamp=Date.now();
 const fee=await call('/api/financials',cookies.sales,{client_id:id,action:'additional_fee',unit_price:100,quantity:1,request_key:'v2-fee-'+stamp});check(fee.status===200,'Sales fee');
 check((await call('/api/financials',cookies.admin,{client_id:id,action:'debt',amount:50,deadline:'2026-12-31',reason:'Synthetic HTTP',request_key:'v2-debt-'+stamp})).status===200,'Admin Debt conversion');
 const posted=await call('/api/ledger',cookies.sales,{client_user_id:id,entry_type:'PAYMENT',amount:60,occurred_at:'2026-10-01',request_key:'v2-payment-'+stamp});check(posted.status===201,'Immediate backdated Sales Payment');
 check((await call('/api/financials',cookies.admin,{client_id:id,action:'allocate',ledger_id:posted.data.id,allocations:[],reason:'Bypass Debt',request_key:'v2-override-'+stamp})).status===400,'Admin cannot manually bypass Debt-first');
 for(const [action,amount] of [['to_balance',300],['to_bank',200]])check((await call('/api/refunds',cookies.finance,{action,client_id:id,amount_cents:amount,reason:'HTTP synthetic',reference:action+stamp,request_key:action+stamp,from_account:'DMD test',to_account:'Client test',paid_date:day,proof:'synthetic'})).status===200,'Refund '+action);
 const path='/api/statements-v2?'+new URLSearchParams({client_id:id,start:day,end:day});
 const preview=await call(path,cookies.finance);check(preview.status===200,'Connected preview');check(preview.privacy==='private, no-store','Private no-store');
 check(preview.data.closing.balance_cents===-3700&&preview.data.closing.debt_cents===0&&preview.data.closing.refund_cents===700,'Exact three-account closing');
 check(preview.data.bank_outflow_cents===200,'Bank payout separate from wallet');
 const allocationIndex=preview.data.movements.findIndex(e=>e.source==='credit_allocations'),refundIndex=preview.data.movements.findIndex(e=>e.source==='refund_events'&&e.detail.kind==='TO_BALANCE');check(allocationIndex>=0&&allocationIndex<refundIndex,'Payment allocation posted before subsequent Refund, not deferred to preview');
 check((await call(path,null)).status===401,'Authentication required');
 for(const role of ['sales','client','bod'])check((await call('/api/statements-v2',cookies[role],{client_id:id,start:day,end:day})).status===403,'Denied finalize '+role);
 const results=await Promise.all(Array.from({length:10},()=>call('/api/statements-v2',cookies.finance,{client_id:id,start:day,end:day})));
 check(results.every(r=>r.status===200),'Concurrent HTTP finalization succeeds');
 check(new Set(results.map(r=>JSON.stringify(r.data))).size===1,'Concurrent replay returns identical snapshot');
 const history=await call('/api/statements-v2?client_id='+id,cookies.client);check(history.data.items.length===1&&history.data.items[0].status==='FINALIZED','One issued snapshot; no Paid/Unpaid');
 const nextDay=new Date(new Date(day+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);
 check(history.data.next_period_start===nextDay,'Client sees exact next unissued period');
 for(const role of ['admin','sales','finance','bod']){const view=await call('/api/statements-v2?client_id='+id,cookies[role]);check(view.status===200&&view.data.next_period_start===nextDay&&view.data.items[0].closing.balance_cents===-3700,'History and next period role '+role);}
 check(Number.isSafeInteger(history.data.items[0].reference.credit_limit_cents)&&Number.isSafeInteger(history.data.items[0].reference.reserve_cents),'Captured credit and reserve references use exact cents');
 check((await call('/api/statements-v2',cookies.finance,{client_id:id,start:nextDay,end:nextDay})).status===400,'Next future period cannot finalize');
 const balanceBefore=(await call('/api/financials?client_id='+id,cookies.admin)).data.net_balance_cents;check(balanceBefore===-3700,'Finalization does not charge again');
 const projection=(await call('/api/financials?client_id='+id,cookies.admin)).data;check(projection.statements.every(s=>!('status' in s)&&!('paid_cents' in s)),'No Paid/Unpaid operational Statement workflow');
 check((await call('/api/financials',cookies.sales,{client_id:id,action:'additional_fee',unit_price:1,quantity:1,occurred_at:'2026-10-01',request_key:'v2-late-'+stamp})).status===200,'Late fee after issue');
 const historyAfter=(await call('/api/statements-v2?client_id='+id,cookies.client)).data;
 check(JSON.stringify(historyAfter.items[0])===JSON.stringify(history.data.items[0]),'Late fee preserves issued bytes including metadata');
 const bod=await call('/api/bod-finance-report?'+new URLSearchParams({start:day,end:day}),cookies.bod);
 check(bod.status===200&&bod.data.statement_periods[0].available,'BOD parity connected');
 check(bod.data.statement_periods[0].finalized.closing.balance_cents===-3700,'BOD issued closing matches Statement');
 check(bod.data.accounts.find(a=>a.client_id===id).balance_cents===-3800,'BOD current exposure includes pending next-period posting');
 check(bod.data.refunds.bank_outflow_cents===200,'True recorded Bank refund outflow');
 console.log('STATEMENT V2 HTTP PASS ('+checks+' assertions)');
})().catch(e=>{console.error(e);process.exit(1)});
