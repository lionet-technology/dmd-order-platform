// The action receipt must use the same signed Balance as the account screen.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-financial-projection-'));
process.env.DMD_DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
require('./seed-epacket.cjs'); // TS/alias registration; no seed/reset call.
const {db}=require('../src/lib/db.ts'),{createUser,createSession}=require('../src/lib/auth.ts'),{NextRequest}=require('next/server'),api=require('../src/app/api/financials/route.ts');
let checks=0;const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++};
const admin=createUser({username:'projection.admin',display_name:'Admin',role:'ADMIN',password:'Synthetic123!'}),sales=createUser({username:'projection.sales',display_name:'Sales',role:'SALES',password:'Synthetic123!'}),client=createUser({username:'projection.client',display_name:'Client',role:'CLIENT',password:'Synthetic123!',sales_user_id:sales.id});
const cookie=user=>'dmd_session='+createSession(user.id).token;
async function post(user,body){const r=await api.POST(new NextRequest('http://localhost/api/financials',{method:'POST',headers:{cookie:cookie(user),'content-type':'application/json'},body:JSON.stringify({client_id:client.id,...body})}));return {status:r.status,data:await r.json()}}
async function get(){const r=await api.GET(new NextRequest('http://localhost/api/financials?client_id='+client.id,{headers:{cookie:cookie(admin)}}));eq(r.status,200,'GET');return r.json()}
(async()=>{try{
const fee={action:'additional_fee',quantity:1,unit_price:100,occurred_at:'2026-10-20',note:'Synthetic fee',request_key:'projection-fee'};
let r=await post(sales,fee);eq(r.status,200,'first fee');eq(r.data.before_summary.purchasing_balance_cents,0,'zero opening');eq(r.data.purchasing_balance_cents,-10000,'signed closing');
let before=await get();r=await post(sales,{...fee,unit_price:10,request_key:'projection-second'});eq(r.status,200,'second fee');eq(r.data.before_summary.purchasing_balance_cents,before.purchasing_balance_cents,'negative before equals GET, never clamps to zero');eq(r.data.purchasing_balance_cents,-11000,'negative closing exact');
const transfer={action:'debt',amount:50,deadline:'2099-12-31',reason:'Synthetic signed transfer',request_key:'projection-transfer'};
before=await get();r=await post(admin,transfer);eq(r.status,200,'Debt transfer');eq(r.data.before_summary.purchasing_balance_cents,before.net_balance_cents,'Debt receipt retains signed before');eq(r.data.purchasing_balance_cents,-6000,'Debt transfer excludes principal once');
r=await post(admin,transfer);eq(r.status,200,'exact replay');eq(r.data.before_summary.purchasing_balance_cents,-6000,'replay before is signed current Balance');eq(r.data.purchasing_balance_cents,-6000,'replay does not transfer twice');
r=await post(client,fee);eq(r.status,400,'Client write denied');eq((await get()).net_balance_cents,-6000,'denied request does not change Balance');
console.log('FINANCIAL SIGNED PROJECTION PASS ('+checks+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
