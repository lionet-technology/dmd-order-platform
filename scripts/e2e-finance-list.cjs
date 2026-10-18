// Read-only HTTP checks against seed-internal-uat.cjs fixture.
const base=process.env.E2E_BASE_URL||'http://127.0.0.1:3119';let checks=0;
function check(v,m){checks++;if(!v)throw Error(m)}
async function call(path,cookie,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]}}
(async()=>{
 const login=await call('/api/auth/login',null,{username:'uat.finance',password:'Demo12345!'});check(login.status===200,'Finance login');const c=login.cookie;
 const first=await call('/api/costs?pageSize=50',c);check(first.status===200&&first.data.total>=300&&first.data.items.length===50,'List supports seeded scale and bounded page');
 const second=await call('/api/costs?pageSize=50&page=2',c);check(second.status===200&&second.data.total===first.data.total&&second.data.items.every(r=>!first.data.items.some(a=>a.id===r.id)),'Distinct second page, stable total');
 const lot=first.data.items.find(r=>r.lot_number&&!r.tracking);check(!!lot&&!!lot.order_id&&!!lot.system_order_code,'Direct Lot costs include Order/DMD/Lot context');
 const byCode=await call('/api/costs?q='+encodeURIComponent(lot.system_order_code),c);check(byCode.data.total>=1&&byCode.data.items.every(r=>r.system_order_code===lot.system_order_code),'Search DMD ID');
 const byOrder=await call('/api/costs?q='+encodeURIComponent(lot.order_id),c);check(byOrder.data.items.some(r=>r.order_id===lot.order_id),'Search client Order ID');
 const supplier=await call('/api/costs?supplier=DMD',c);check(supplier.data.total>0&&supplier.data.items.every(r=>r.supplier==='DMD'),'Supplier filter');
 const status=await call('/api/costs?status=PASS&supplier=DMD',c);check(status.data.total>0&&status.data.items.every(r=>r.supplier==='DMD'&&r.reconciliation_status==='PASS'),'Combined status/Supplier filter');
 const unmatched=await call('/api/costs?status=UNMATCHED',c);check(unmatched.data.items.every(r=>!r.matched),'Unmatched filter');
 const empty=await call('/api/costs?supplier=NONEXISTENT-UAT',c);check(empty.data.total===0&&empty.data.items.length===0&&empty.data.totalPages===1,'Empty results shape');
 const injection=await call('/api/costs?q='+encodeURIComponent("' OR 1=1 --"),c);check(injection.status===200&&injection.data.total===0,'Search stays parameterized');
 const lots=await call('/api/reconciliation?granularity=lot',c);check(lots.status===200&&lots.data.items.some(r=>r.service==='ePacket'&&r.sub_service==='Standard'&&r.supplier==='DMD'&&r.system_order_code),'Lot route and identifiers for filtering');
 for(const username of ['epacket.admin','epacket.sales','uat.client.4']){const auth=await call('/api/auth/login',null,{username,password:'Demo12345!'});check(auth.status===200,'Fixture login '+username);if(username==='epacket.admin')check((await call('/api/summary',auth.cookie)).data.unmatched===unmatched.data.total,'Summary counts unmatched costs by persisted Order link');check((await call('/api/costs?q=UAT',auth.cookie)).status===403,'Cost privacy '+username);check((await call('/api/reconciliation?granularity=lot',auth.cookie)).status===403,'Lot privacy '+username)}
 console.log('FINANCE LIST HTTP PASS ('+checks+' assertions)');
})().catch(e=>{console.error(e);process.exitCode=1});
