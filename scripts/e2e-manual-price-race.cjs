// Owns a newly created synthetic DB and a localhost server; never reads operator DB paths.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-manual-race-'));
process.env.DMD_DB_PATH=path.join(dir,'synthetic-test.db');process.env.NODE_ENV='test';
const {seed}=require('./seed-epacket.cjs');seed();
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{addLedgerEntry}=require('../src/lib/finance.ts');
const admin=db.prepare("SELECT * FROM users WHERE username='epacket.admin'").get(),sales=db.prepare("SELECT * FROM users WHERE username='epacket.sales'").get();
const client=createUser({username:'race.client',display_name:'Synthetic Race',password:'RaceTest123!',role:'CLIENT',sales_user_id:sales.id});
addLedgerEntry({client_user_id:client.id,entry_type:'PAYMENT',direction:'CREDIT',amount:100,created_by_user_id:admin.id,request_key:'race-opening'});
const route=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,client_self_purchase,max_cartons_per_order) VALUES ('UPS','Express','KILOSHIP',1,4)").run().lastInsertRowid);
db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'UPS','Express',1,0)").run(client.id);
const port=34229,base='http://127.0.0.1:'+port;
let child,checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;console.log('PASS '+m)};
async function call(url,cookie,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{cookie:cookie||'',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
const {groupClientCartonRows}=require('../src/lib/client-carton-groups.ts');
const rows=id=>groupClientCartonRows([{order_id:id,carton_count:2,weight:.1,length:20,width:15,height:10,item:'Shirt',material:'Cotton',recipient_name:'Synthetic Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',country:'US',phone:'123456'},{order_id:id,carton_count:'',weight:.2,length:20,width:15,height:10,item:'Bag',material:'Canvas'}]);
(async()=>{try{
 // Refuse an occupied port, including any unrelated local app.
 const net=require('node:net');await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve))});
 const log=fs.openSync(path.join(dir,'server.log'),'w');child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<120;i++){if(child.exitCode!==null)throw Error(fs.readFileSync(path.join(dir,'server.log'),'utf8'));try{await fetch(base+'/api/auth/me');ready=true;break}catch{}await new Promise(r=>setTimeout(r,500))}check(ready,'owned synthetic server ready');
 const a=await call('/api/auth/login','',{username:'epacket.admin',password:'Demo12345!'}),c=await call('/api/auth/login','',{username:'race.client',password:'RaceTest123!'});check(a.status===200&&c.status===200,'Admin and Client login');
 const ids=[];for(const code of ['RACE-A','RACE-B']){const saved=await call('/api/client-orders',c.cookie,{action:'save',route_id:route,rows:rows(code)});if(saved.status!==201)console.error(saved.data);check(saved.status===201,'save multi-Carton Draft '+code);ids.push(saved.data.orders[0].id)}
 const bought=await call('/api/client-orders',c.cookie,{action:'purchase',order_ids:ids});check(bought.status===200&&bought.data.succeeded===2,'submit both unpriced Orders');
 check(db.prepare('SELECT COUNT(*) n FROM purchase_reserves WHERE client_id=?').get(client.id).n===0,'no pre-price reserves');
 const payload=id=>({action:'save',supplier:'KILOSHIP',expected_lot_count:1,complete:true,manual_total_price:'75.00',trackings:[1,2].map(n=>({tracking:'SYNTH-RACE-'+id+'-'+n,label_url:'/templates/demo-usps-label.svg',lot_number:1}))});
 const results=await Promise.all(ids.map(id=>call('/api/orders/'+id+'/trackings',a.cookie,payload(id))));
 check(results.every(r=>r.status===200),'Already submitted Orders retain actual late-price obligations');
 const winner=ids[0],loser=ids[1];
 const charge=()=>db.prepare("SELECT COUNT(*) n,COALESCE(SUM(amount),0) total FROM ledger_entries WHERE client_user_id=? AND entry_type='ORDER_CHARGE'").get(client.id);
 check(charge().n===2&&charge().total===150,'One whole-Order charge per submitted Order');
 check(require('../src/lib/credit.ts').accountFinancials(client.id,{readOnly:true}).purchase_blocked,'Late over-budget charges block subsequent purchasing');
 const existing=db.prepare('SELECT id,tracking,label_url FROM order_trackings WHERE order_id=? ORDER BY id').all(winner),retry={...payload(winner),trackings:existing.map(t=>({...t,lot_number:1}))};
 const replay=await Promise.all(Array.from({length:8},()=>call('/api/orders/'+winner+'/trackings',a.cookie,retry)));check(replay.every(r=>r.status===200)&&charge().n===2,'eight concurrent retries never duplicate either charge');
 check((await call('/api/orders/'+loser+'/trackings',c.cookie,payload(loser))).status===403,'Client cannot price or issue Tracking');
 const missing={...payload(loser)};delete missing.manual_total_price;check((await call('/api/orders/'+loser+'/trackings',a.cookie,missing)).status===200,'Omitted price preserves confirmed snapshot');
 for(const price of ['0','-1','1.001','NaN'])check((await call('/api/orders/'+loser+'/trackings',a.cookie,{...payload(loser),manual_total_price:price})).status===400,'invalid price rejected '+price);
 check(db.prepare('PRAGMA foreign_key_check').all().length===0&&db.pragma('integrity_check',{simple:true})==='ok','synthetic DB integrity');
 console.log('MANUAL PRICE HTTP RACE PASS ('+checks+' assertions); evidence '+dir);
 }finally{if(child){child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve)})}db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
