require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),path=require('node:path'),{Worker}=require('node:worker_threads');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),credit=require('../src/lib/credit.ts');
let n=0;const eq=(a,b,m)=>{n++;assert.deepEqual(a,b,m)},reject=(f,m)=>{n++;assert.throws(f,undefined,m)};
const admin=createUser({username:'reserve.admin',display_name:'Admin',password:'TestPass123!',role:'ADMIN'});
const sales=createUser({username:'reserve.sales',display_name:'Sales',password:'TestPass123!',role:'SALES'});
const client=createUser({username:'reserve.client',display_name:'Client',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
const other=createUser({username:'reserve.other',display_name:'Other',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount) VALUES (?,'PAYMENT','CREDIT',100)").run(client.id);
let seq=0;
const order=()=>Number(db.prepare("INSERT INTO orders(order_id,client_user_id,workflow_status,total_due) VALUES (?,?,'PENDING_PURCHASE',80)").run('RESERVE-'+(++seq),client.id).lastInsertRowid);
const reserved=id=>db.prepare('SELECT * FROM purchase_reserves WHERE order_id=?').get(id);
const audits=()=>db.prepare("SELECT COUNT(*) n FROM financial_audit WHERE event='PURCHASE_RESERVED'").get().n;
async function race(ids) {
 const workers=ids.map(id=>new Worker(path.join(__dirname,'reserve-race-worker.cjs'),{workerData:{file:process.env.DMD_DB_PATH,order:id,client:client.id,actor:admin.id,amount:80}}));
 try{
  await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.once('message',m=>m.ready?resolve():reject(Error('Not ready')));w.once('error',reject);w.once('exit',c=>c&&reject(Error('Worker exit '+c)));})));
  const results=workers.map(w=>new Promise((resolve,reject)=>{w.once('message',resolve);w.once('error',reject);}));
  workers.forEach(w=>w.postMessage('go'));
  return await Promise.all(results);
 }finally{await Promise.all(workers.map(w=>w.terminate()));}
}
(async()=>{try{
 const id=order();credit.reservePurchase(id,client.id,80,admin.id);const original=JSON.stringify(reserved(id));
 credit.reservePurchase(id,client.id,80,admin.id);
 eq(audits(),1,'same reserve retry does not append audit or require double room');
 reject(()=>credit.reservePurchase(id,client.id,101,admin.id),'increase beyond room fails');
 eq(JSON.stringify(reserved(id)),original,'failed resize preserves every original reserve field');
 credit.reservePurchase(id,client.id,90,admin.id);
 eq(reserved(id).amount_cents,9000,'replace reserves only the new total');
 eq(credit.accountFinancials(client.id,{readOnly:true}).available_to_buy_cents,1000,'own reserve excluded once');
 reject(()=>credit.reservePurchase(id,other.id,1,admin.id),'cannot move reserve to another Client');
 db.exec("CREATE TRIGGER reserve_audit_failure BEFORE INSERT ON financial_audit WHEN NEW.event='PURCHASE_RESERVED' BEGIN SELECT RAISE(ABORT,'TEST audit failure'); END");
 reject(()=>credit.reservePurchase(id,client.id,50,admin.id),'audit failure rejects');
 eq(reserved(id).amount_cents,9000,'audit failure restores old reserve');
 db.exec('DROP TRIGGER reserve_audit_failure');
 db.prepare("UPDATE purchase_reserves SET status='CANCELLED' WHERE order_id=?").run(id);
 reject(()=>credit.reservePurchase(id,client.id,80,admin.id),'cancelled reserve never resurrects');
 const a=order(),b=order(),before=audits(),different=await race([a,b]);
 eq(different.filter(r=>r.ok).length,1,'two independent SQLite writers cannot reserve 160 from 100');
 eq(different.filter(r=>!r.ok).every(r=>/Balance.*không đủ/.test(r.error)),true,'loser is funds rejection');
 eq(audits()-before,1,'concurrent repeats produce one winning audit');
 eq(credit.accountFinancials(client.id,{readOnly:true}).reserved_cents,8000,'one reserve after distinct Order race');
 db.prepare("UPDATE purchase_reserves SET status='CANCELLED' WHERE status='RESERVED'").run();
 const same=order(),sameBefore=audits(),retries=await race([same,same,same]);
 eq(retries.every(r=>r.ok),true,'same Order concurrent retries all return successfully');
 eq(audits()-sameBefore,1,'same Order 12 calls reserve and audit once');
 eq(reserved(same).amount_cents,8000,'same Order reserve amount correct');
 eq(db.pragma('integrity_check',{simple:true}),'ok','integrity');
 eq(db.pragma('foreign_key_check'),[],'foreign keys');
 console.log('ATOMIC RESERVE PASS ('+n+' checks; five independent SQLite writers)');
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
