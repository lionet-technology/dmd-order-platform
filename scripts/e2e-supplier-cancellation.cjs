require('./service-v1-test-env.cjs');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),assert=require('node:assert/strict');
const {temp}=require('./service-v1-test-env.cjs'),root=path.resolve(__dirname,'..');
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts');
require('../src/lib/order-cancellation.ts');
const users={},tokens={};for(const role of ['ADMIN','SALES','CLIENT','FINANCE','BOD','WAREHOUSE']){users[role]=auth.createUser({username:'http.sc.'+role,display_name:role,role,password:'TestPass123!',...(role==='CLIENT'?{sales_user_id:users.SALES.id}:{})});tokens[role]=auth.createSession(users[role].id).token;}
db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','T11','DMD')").run();
const rid=db.prepare("SELECT id FROM service_route_configs WHERE service='ePacket' AND sub_service='T11' AND supplier='DMD'").get().id;
require('../src/lib/cancellation-config.ts').saveCancellationRules(rid,{ISSUED:{allowed:true,refund_percent:90}},"TEST HTTP policy",users.ADMIN.id);
let seq=0;
function fixture(){const id=Number(db.prepare("INSERT INTO orders(order_id,client_user_id,service,sub_service,supplier,workflow_status,total_due,sales_price,tracking,label) VALUES (?,?,'ePacket','T11','DMD','PURCHASING',100,100,?,'https://labels.test/original.pdf')").run('HTTP-SC-'+(++seq),users.CLIENT.id,'HTTP-SC-TRACK-'+seq).lastInsertRowid);db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,reference_type,reference_id) VALUES (?,'ORDER_CHARGE','DEBIT',100,'ORDER',?)").run(users.CLIENT.id,String(id));return id;}
const ids=Array.from({length:10},fixture),rollback=ids[9];
db.exec("CREATE TRIGGER reject_http_cancellation BEFORE INSERT ON order_events WHEN NEW.event_type='ORDER_CANCELLED' AND NEW.order_id="+rollback+" BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
let server,checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
(async()=>{try{
 const port=await new Promise(resolve=>{const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});}),base='http://127.0.0.1:'+port;
 const log=fs.openSync(path.join(temp,'http.log'),'a');
 server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production'},stdio:['ignore',log,log]});
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error(fs.readFileSync(path.join(temp,'http.log'),'utf8'));try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}check(ready,'isolated server');
 async function call(url,role,body){const r=await fetch(base+url,{method:body?'POST':'GET',headers:{...(role?{cookie:'dmd_session='+tokens[role]}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};}
 check((await call('/api/supplier-cancellations')).status===401,'anonymous queue denied');
 for(const role of ['SALES','CLIENT','WAREHOUSE']){
 check((await call('/api/supplier-cancellations',role)).status===403,role+' queue read denied');
 check((await call('/api/supplier-cancellations',role,{})).status===403,role+' queue mutation denied');
 check((await call('/api/orders/'+ids[0]+'/cancel',role,{refund_percent:100})).status===403,role+' support denied');
 }
 for(const role of ['FINANCE','BOD'])check((await call('/api/orders/'+ids[0]+'/cancel',role,{})).status===403,role+' cancellation denied');
 check((await call('/api/orders/'+ids[0]+'/cancel','CLIENT',{})).data.refund_amount===90,'Client default 90');
 check((await call('/api/orders/'+ids[1]+'/cancel','SALES',{})).data.refund_amount===90,'Sales default 90');
 check((await call('/api/orders/'+ids[2]+'/cancel','ADMIN',{refund_percent:100,reason:'Admin hỗ trợ'})).data.refund_amount===100,'Admin support 100');
 const races=await Promise.all(Array.from({length:6},()=>call('/api/orders/'+ids[3]+'/cancel','ADMIN',{})));
 check(races.every(r=>r.status===200)&&races.filter(r=>!r.data.already_cancelled).length===1,'concurrent cancel once');
 const rows=(await call('/api/supplier-cancellations?supplier=DMD','ADMIN')).data.items;
 check(rows.length===4&&rows.every(r=>r.status==='PENDING'),'default supplier queue');
 const row=rows.find(r=>r.order_id===ids[3]);check(row.tracking_label.legacy_label==='https://labels.test/original.pdf','label snapshot');
 const body={order_id:row.order_id,status:'RESOLVED',note:'Ticket Supplier đối chiếu xong; chưa ghi nhận khoản tiền',expected_event_id:row.history.at(-1).id,request_key:'http-sc-resolve'};
 const updates=await Promise.all(Array.from({length:5},()=>call('/api/supplier-cancellations','FINANCE',body)));
 check(updates.every(r=>r.status===200)&&new Set(updates.map(r=>r.data.id)).size===1,'concurrent followup retry once: '+JSON.stringify(updates));
 check((await call('/api/supplier-cancellations','BOD')).data.items.length===3,'BOD queue excludes closed');
 check((await call('/api/supplier-cancellations?status=RESOLVED','ADMIN')).data.items.length===1,'resolved filter');
 check((await call('/api/supplier-cancellations?supplier=OTHER','ADMIN')).data.items.length===0,'supplier filter');
 check((await call('/api/supplier-cancellations','ADMIN',{...body,request_key:'stale'})).status===409,'stale guard');
 check((await call('/api/orders/'+rollback+'/cancel','ADMIN',{})).status!==200,'failed cancellation rejected');
 check(!db.prepare('SELECT 1 FROM supplier_cancellations WHERE order_id=?').get(rollback),'HTTP rollback record');
 check(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE reference_type='ORDER_CANCELLATION' AND reference_id=?").get(String(ids[3])).n===1,'one refund under HTTP races');
 check(db.prepare('SELECT COUNT(*) n FROM supplier_cancellation_events WHERE order_id=?').get(ids[3]).n===2,'one followup plus pending');
 const customId=fixture(),missingId=fixture();
 const customRoute=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('UPS','Saver','TEST-SBay')").run().lastInsertRowid);
 require('../src/lib/cancellation-config.ts').saveCancellationRules(customRoute,{ISSUED:{allowed:true,refund_percent:72.5}},"TEST custom issued policy",users.ADMIN.id);
 db.prepare("UPDATE orders SET service='UPS',sub_service='Saver',supplier='TEST-SBay' WHERE id=?").run(customId);
 db.prepare("UPDATE orders SET supplier='NO-POLICY' WHERE id=?").run(missingId);
 const customResults=await Promise.all(Array.from({length:8},()=>call('/api/orders/'+customId+'/cancel','CLIENT',{})));
 check(customResults.every(r=>r.status===200),'non-90 policy concurrent cancel succeeds');
 check(db.prepare("SELECT amount FROM ledger_entries WHERE reference_type='ORDER_CANCELLATION' AND reference_id=?").get(String(customId)).amount===72.5,'exact service policy refund under race');
 check(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE reference_type='ORDER_CANCELLATION' AND reference_id=?").get(String(customId)).n===1,'custom policy refund once');
 check((await call('/api/orders/'+missingId+'/cancel','ADMIN',{refund_percent:100})).status===409,'missing policy cannot be overridden');
 check(!db.prepare("SELECT 1 FROM supplier_cancellations WHERE order_id=?").get(missingId),'missing policy no partial supplier queue');
 console.log('SUPPLIER CANCELLATION HTTP PASS ('+checks+' assertions)');
}finally{if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
