const {temp}=require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const path=require('node:path');
const Database=require('better-sqlite3');
const ExcelJS=require('exceljs');
const {db}=require('../src/lib/db.ts');
const auth=require('../src/lib/auth.ts');
const {upsertOrder}=require('../src/lib/finance.ts');
const {vndAction}=require('../src/lib/vnd-operational.ts');
const {runVndMonthlyCommission:close,readVndMonthlyCommission:read}=require('../src/lib/vnd-commission-statements.ts');
const {vndMonthlyCommissionExcel}=require('../src/lib/vnd-commission-export.ts');
const {vndBusinessReport}=require('../src/lib/vnd-reporting.ts');
const now=timestamp=>new Date(timestamp);
require('./seed-epacket.cjs').seed();
const admin=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get();
const account=(username,role,sales_user_id)=>auth.createUser({username,display_name:username,password:'TestPass123!',role,sales_user_id});
const sales=account('month-sales','SALES'),other=account('month-other','SALES');
const client=account('month-client','CLIENT',sales.id),otherClient=account('month-other-client','CLIENT',other.id);
let seq=0;
const key=()=>`month-test-${++seq}`;
function order(client,at){
 vndAction(admin,{action:'activate',client_id:client.id,credit_limit:'0',reason:'TEST',request_key:key()});
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','Standard',1,0)").run(client.id);
 const order=upsertOrder({client_user_id:client.id,order_id:key(),service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:1,length:1,width:1,height:1,item:'TEST',material:'Cotton'});
 db.prepare('UPDATE orders SET service_purchased_at=? WHERE id=?').run(at,order.id);
 db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,offer,confirmed_at,request_actor_id) VALUES (?,?,'CHARGED','100',?,?)").run(order.id,client.id,at,admin.id);
 db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json) VALUES (?,'{\"base_vnd\":\"40\"}')").run(order.id);
 return order.id;
}
function ledger(client,id,kind,amount,at){
 db.prepare("INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key,created_at) VALUES (?,?,?,?,'TEST',?,?,?)").run(client.id,id,kind,amount,admin.id,key(),at);
}
function claim(id,category){
 return Number(db.prepare("INSERT INTO vnd_claims(client_id,category,orders_json,evidence,note,actor_id) VALUES (?,?,?,'TEST','TEST',?)").run(client.id,category,JSON.stringify([id]),admin.id).lastInsertRowid);
}
function event(id,kind,total,at,context=null,category='RECONCILIATION_ERROR',revision=1){
 db.prepare("INSERT INTO vnd_refund_events(client_id,claim_id,kind,delta,approved,revision,category,context_json,reason,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,'TEST',?,?)")
  .run(client.id,id,kind,total,kind==='DECISION'?total:null,revision,category,context&&JSON.stringify(context),admin.id,at);
}
function allocation(order_id,amount){
 return {orders:[{order_id,sales_user_id:sales.id}],allocation_version:1,allocation:[{order_id,total_vnd:amount,selling_vnd:amount,surcharge_vnd:'0',tax_vnd:'0',compensation_vnd:'0'}]};
}

(async()=>{
 const id=order(client,'2026-01-31 16:59:59'),otherId=order(otherClient,'2026-01-31 17:00:00');
 ledger(client,id,'ORDER_CHARGE','-100','2026-01-31 16:59:59');
 ledger(otherClient,otherId,'ORDER_CHARGE','-100','2026-01-31 17:00:00');
 const legacy=claim(id,'SHIPPING_ISSUE');
 event(legacy,'DECISION','10','2026-01-31 16:59:59',{orders:[{order_id:id,sales_user_id:sales.id}]},'SHIPPING_ISSUE');
 const refund=claim(id,'RECONCILIATION_ERROR');
 event(refund,'DECISION','50','2026-01-31 17:00:00',allocation(id,'50'));
 event(null,'BALANCE','-20','2026-02-01 01:00:00');
 event(null,'BANK','-30','2026-02-02 01:00:00');
 ledger(client,null,'CLAIM_REFUND','20','2026-02-01 01:00:00');
 ledger(client,id,'ORDER_CORRECTION','30','2026-03-02 01:00:00');
 close(now('2026-01-31T16:59:59Z'));
 assert.equal(db.prepare('SELECT COUNT(*) n FROM vnd_commission_statements').get().n,0);
 assert.equal(read('2026-02',undefined,now('2026-01-31T17:00:00Z')).status,'PENDING_CLOSE');
 db.exec("CREATE TRIGGER test_failure BEFORE INSERT ON vnd_commission_statements BEGIN SELECT RAISE(ABORT,'TEST rollback'); END");
 assert.throws(()=>close(now('2026-01-31T17:00:00Z')),/TEST rollback/);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM vnd_commission_statements').get().n,0);
 db.exec('DROP TRIGGER test_failure');
 close(now('2026-01-31T17:00:00Z'));
 const jan=read('2026-01',undefined,now('2026-01-31T17:00:00Z'));
 assert.equal(jan.status,'CLOSED');
 assert.deepEqual(jan.lines.map(row=>[row.order_id,row.posting_vnd]),[[id,'7.3']]);
 assert.equal(jan.lines[0].evidence.active_claims[0].allocation,null);
 assert.equal(jan.sales[0].total_vnd,'7.3');
 const open=read('2026-02',sales.id,now('2026-02-25T00:00:00Z'));
 assert.equal(open.status,'OPEN');
 assert.equal(open.sales[0].total_vnd,'-6.05');
 assert.throws(()=>db.exec("UPDATE vnd_commission_statements SET snapshot_json='{}'"),/immutable/);
 assert.throws(()=>db.exec('DELETE FROM vnd_commission_statements'),/immutable/);
 assert.throws(()=>db.exec("INSERT OR REPLACE INTO vnd_commission_statements VALUES ('2026-01','now','{}')"),/immutable/);

 const worker=`const filename=process.env.DMD_DB_PATH;require('./scripts/service-v1-test-env.cjs');process.env.DMD_DB_PATH=filename;require('./src/lib/vnd-commission-statements.ts').runVndMonthlyCommission(new Date('2026-04-01T00:00:00Z'));`;
 await Promise.all([1,2].map(()=>promisify(execFile)(process.execPath,['-e',worker],{env:process.env})));
 close(now('2026-04-01T00:01:00Z'));
 assert.deepEqual(db.prepare('SELECT month FROM vnd_commission_statements ORDER BY month').pluck().all(),['2026-01','2026-02','2026-03']);
 assert.deepEqual(read('2026-01'),jan);
 const feb=read('2026-02',sales.id);
 assert.deepEqual(feb.lines.map(row=>[row.order_id,row.origin_month,row.order_commission_vnd,row.posting_vnd]),[[id,'2026-01','1.25','-6.05']]);
 assert.equal(feb.lines[0].evidence.base_vnd,null);
 assert.equal(feb.lines[0].evidence.decisions.length,1);
 assert.equal(feb.lines[0].evidence.decisions[0].category,'RECONCILIATION_ERROR');
 assert.equal(feb.sales[0].adjustment_vnd,'-6.05');
 assert.equal(feb.sales[0].total_vnd,'-6.05');
 assert.equal(read('2026-02',other.id).sales[0].total_vnd,'7.3');
 assert.deepEqual(read('2026-02',999999).lines,[]);
 const march=read('2026-03',sales.id);
 assert.equal(march.lines[0].order_commission_vnd,'0');
 assert.equal(march.lines[0].posting_vnd,'-1.25');
 assert.equal(vndBusinessReport('2026-02').commission.orders.find(row=>row.order_id===otherId).live_after_refund.commission_vnd,'7.3');

 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(Buffer.from(await vndMonthlyCommissionExcel(feb)));
 assert.equal(workbook.getWorksheet('Theo Sales').getCell('G2').value,feb.sales[0].total_vnd);
 assert.equal(workbook.getWorksheet('Theo Order').rowCount,2);
 assert.equal(workbook.getWorksheet('Theo Order').getCell('D2').value,id);
 assert.equal(workbook.getWorksheet('Nguồn đối chiếu').getCell('H2').value,'RECONCILIATION_ERROR');
 const backup=path.join(temp,'commission-backup.db');
 await db.backup(backup);
 const restored=new Database(backup);
 try{
  assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');
  assert.deepEqual(restored.pragma('foreign_key_check'),[]);
  for(const table of ['vnd_commission_statements','vnd_refund_events','vnd_ledger'])
   assert.deepEqual(restored.prepare('SELECT * FROM '+table+' ORDER BY rowid').all(),db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all());
  assert.throws(()=>restored.exec('DELETE FROM vnd_commission_statements'),/immutable/);
 }finally{restored.close();}
 console.log('PASS monthly commission boundary, rollback, concurrent catch-up, historical snapshot, late Refund/correction, Sales scope, exact Excel, and TEST backup/restore');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
