// Real HTTP handlers over one owned synthetic DB: legacy and bulk consent parity.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-consent-'));
process.env.DMD_DB_PATH=path.join(dir,'test.db');process.env.NODE_ENV='test';
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){return resolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),pricing=require('../src/lib/route-pricing.ts'),finance=require('../src/lib/finance.ts'),{NextRequest}=require('next/server');
const legacy=require('../src/app/api/purchase-jobs/route.ts'),bulk=require('../src/app/api/client-orders/route.ts');
let server,base;
let checks=0;const eq=(a,b,m)=>{checks++;assert.deepEqual(a,b,m)};
(async()=>{try{
 require('./seed-epacket.cjs').seed();
 if(process.env.DMD_CONSENT_HTTP==='1'){
  const port=await new Promise((resolve,reject)=>{const s=require('node:net').createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
  base='http://127.0.0.1:'+port;
  server=require('node:child_process').spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:'ignore'});
  let ready=false;for(let i=0;i<80;i++){if(server.exitCode!==null)throw Error('Owned HTTP server exited');try{await fetch(base+'/api/auth/me');ready=true;break}catch{}await new Promise(r=>setTimeout(r,250))}if(!ready)throw Error('Owned HTTP server timeout');
 }

 const client=db.prepare("SELECT * FROM users WHERE role='CLIENT' ORDER BY id").get(),admin=db.prepare("SELECT * FROM users WHERE role='ADMIN'").get(),route=db.prepare("SELECT * FROM service_route_configs WHERE service='ePacket' AND sub_service='Standard' AND supplier='DMD'").get();
 const cookie='dmd_session='+auth.createSession(client.id).token;
 const make=n=>finance.upsertOrder({client_user_id:client.id,order_id:'CONSENT-'+n,service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:.1,length:10,width:5,height:3,item:'Shirt',material:'Cotton',recipient_name:'Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',phone:'123456'});
 const post=async(api,body)=>{const options={method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)};const r=base?await fetch(base+(api===legacy?'/api/purchase-jobs':'/api/client-orders'),options):await api.POST(new NextRequest('http://local/api/test',options));eq(r.status,200,'Normal purchase item response');return r.json()};
 const key=id=>pricing.safePricing(pricing.refreshDraft(id),'CLIENT').quote_key;
 const money=id=>db.prepare('SELECT * FROM purchase_reserves WHERE order_id=?').all(id);
 for(const api of [legacy,bulk]){
  const o=make(++checks),body=quote=>api===legacy?{action:'purchase',order_id:o.id,expected_quote_key:quote}:{action:'purchase',order_ids:[o.id],expected_quotes:quote===undefined?{}:{[o.id]:quote}};
  let r=await post(api,body());eq([r.failed,r.results[0].error_type],[1,'DATA'],'Missing confirmation is ordinary DATA failure');eq(money(o.id),[],'Missing confirmation never reserves');
  const old=key(o.id),version=pricing.createPriceVersion(route.id,[{weight:10,net:3,base_rate:12+checks}],admin.id);
  pricing.activatePricing(route.id,{price_version_id:version.id,retail_markup:20},admin.id);
  r=await post(api,body(old));eq(r.failed,1,'Price version changed between Preview and Purchase');eq(money(o.id),[],'Stale price reserves nothing');
  const fresh=key(o.id);db.prepare('UPDATE service_route_configs SET active=0 WHERE id=?').run(route.id);
  r=await post(api,body(fresh));eq(r.failed,1,'Route deactivated after Preview');eq(money(o.id),[],'Inactive route reserves nothing');db.prepare('UPDATE service_route_configs SET active=1 WHERE id=?').run(route.id);
  r=await post(api,body(key(o.id)));eq(r.succeeded,1,'Preview and explicit reconfirm succeeds');const frozen=money(o.id);
  r=await post(api,body());eq(r.succeeded,1,'Accepted retry without confirmation remains idempotent');eq(money(o.id),frozen,'Retry preserves original reservation');
  require('../src/lib/order-operations.ts').addOrderTracking({orderId:o.id,tracking:'CONSENT-TRACK-'+o.id,labelUrl:'https://labels.test/synthetic.pdf',actorId:admin.id});
  const truth=()=>({order:db.prepare('SELECT * FROM orders WHERE id=?').get(o.id),ledger:db.prepare("SELECT * FROM ledger_entries WHERE reference_type='ORDER' AND reference_id=? ORDER BY id").all(String(o.id)),owner:db.prepare('SELECT * FROM order_sales_snapshots WHERE order_id=?').get(o.id),structure:require('../src/lib/order-shipments.ts').getOrderShipmentStructure(o.id,false)});
  const posted=truth();
  for(const patch of [{client_user_id:admin.id},{supplier:'OTHER'},{service:'UPS',sub_service:''},{tracking:'REPLACE-SILENTLY'},{sales:'Changed Sales'}]){assert.throws(()=>finance.upsertOrder({id:o.id,...patch}),/khóa/);checks++;eq(truth(),posted,'Posted identity edit preserves Order, Ledger, Sales and Lots');}
  assert.throws(()=>require('../src/lib/order-shipments.ts').saveOrderShipmentStructure(o.id,{lot_count:2,cartons:[]}),/khóa|Tracking|tracking|đặt mua/);checks++;eq(truth(),posted,'Lot changes after posting preserve financial truth');

 }
 const o=make('DIRECT');assert.throws(()=>pricing.purchaseService(o.id,client),/Báo giá/);checks++;
 // Current policy is service/adapter based: no AUTO adapter for UPS/Yun/custom.
 for(const service of ['UPS','Chuyên tuyến','YunExpress','ePacket']){
  const sub='NO-AUTO-'+service;db.prepare('INSERT INTO service_route_configs(service,sub_service,supplier,client_self_purchase) VALUES (?,?,?,1)').run(service,sub,'DMD');
  db.prepare('INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled) VALUES (?,?,?,1)').run(client.id,service,sub);
  const id=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,service,sub_service,supplier,workflow_status,carton_count) VALUES (?,?,?,?,?,'SALES_DRAFT',1)").run('POLICY-'+service,client.id,service,sub,'DMD').lastInsertRowid);require('../src/lib/order-shipments.ts').ensureOrderShipmentStructure(id);
  if(['UPS','Chuyên tuyến'].includes(service)){pricing.purchaseService(id,client);eq(money(id),[],'Approved manual request creates no zero reserve '+service);}
  else {assert.throws(()=>pricing.purchaseService(id,client),/bảng giá/);checks++;eq(money(id),[],'Missing AUTO config cannot fall back to manual '+service);assert.throws(()=>require('../src/lib/manual-route-price.ts').setManualOrderPrice(id,20,admin.id),/thủ công/);checks++;}
 }
 eq(db.pragma('integrity_check',{simple:true}),'ok','Integrity');console.log('PURCHASE CONSENT '+(base?'HTTP':'HANDLER')+' PASS ('+checks+' assertions)');
}finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r))}db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
