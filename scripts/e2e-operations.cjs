const base=process.env.E2E_BASE_URL||'http://localhost:3110';let checks=0;function check(v,m){checks++;if(!v)throw Error(m)}
async function call(url,cookie,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
(async()=>{
const login=async username=>{const r=await call('/api/auth/login',null,{username,password:'TestPass123!'});check(r.status===200,'Login '+username);return r.cookie;};
const admin=await login('e2e.admin'),sales=await login('e2e.sales'),client=await login('e2e.client');const users=(await call('/api/users',admin)).data,clientId=users.find(u=>u.username==='e2e.client').id;
await call('/api/users',admin,{username:'e2e.warehouse',display_name:'E2E Warehouse',password:'TestPass123!',role:'WAREHOUSE'});const warehouse=await login('e2e.warehouse');
let r=await call('/api/financials?client_id='+clientId,client);check(r.status===200&&r.data.statements.length>0,'Client statement view');
const before=r.data.balance_cents;
r=await call('/api/financials',client,{client_id:clientId,action:'configure',credit_limit:1000,credit_term_days:14});check(r.status===400,'Client cannot change credit');
r=await call('/api/ledger',sales,{client_user_id:clientId,entry_type:'REFUND',amount:5});check(r.status===400,'Sales cannot issue refund');
r=await call('/api/financials?client_id='+clientId,warehouse);check(r.status===400,'Warehouse cannot view client financials');
check((await call('/api/ledger',warehouse)).status===403,'Warehouse ledger read denied');
check((await call('/api/ledger',warehouse,{client_user_id:clientId,entry_type:'REFUND',amount:5})).status===403,'Warehouse ledger write denied');
const orders=(await call('/api/orders?pageSize=100',client)).data.items,order=orders.find(o=>o.workflow_status!=='CANCELLED');check(!!order,'Claim fixture order');
r=await call('/api/cases',client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[order.id],summary:'HTTP public claim',due_date:'2026-10-05'});check(r.status===200,'Client opens claim');const caseId=r.data.id;
check((await call('/api/financials?client_id='+clientId,client)).data.balance_cents===before,'Open claim never releases balance');
r=await call('/api/cases',client,{action:'comment',case_id:caseId,message:'Please investigate'});check(r.status===200,'Client public reply');
r=await call('/api/claims',sales,{action:'finalize',case_id:caseId,refund_amount:1,reason:'x'});check(r.status===400,'Sales claim payout denied');
r=await call('/api/cases',sales,{action:'create',kind:'HOLD',visibility:'INTERNAL',order_ids:[order.id],summary:'HTTP packaging hold'});check(r.status===200,'Sales creates internal hold');const holdId=r.data.id;
check(!(await call('/api/cases',client)).data.items.some(c=>c.id===holdId),'Internal hold details hidden');
r=await call('/api/cases',admin,{action:'update',case_id:holdId,status:'RESOLVED'});check(r.status===200,'Admin releases hold');
r=await call('/api/inbound',warehouse,{action:'scan',scan_key:'HTTP-UNIDENTIFIED-'+Date.now()});check(r.status===200&&r.data.status==='UNIDENTIFIED','Warehouse unmatched inventory');
check((await call('/api/inbound',client)).status===400,'Client internal warehouse denied');
check((await call('/api/claims',client)).status===403,'Client supplier recoveries denied');
r=await call('/api/control-tower',admin);check(r.status===200&&r.data.counts.unidentified>0&&r.data.counts.claims_overdue>0,'Tower actionable queues');
r=await call('/api/control-tower',client);check(r.status===200&&r.data.supplier_recovered_cents===undefined,'Client tower private fields hidden');
console.log('OPERATIONS HTTP PASS ('+checks+' assertions)');
})().catch(e=>{console.error(e);process.exit(1)});
