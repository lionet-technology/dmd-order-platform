require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),{db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),finance=require('../src/lib/finance.ts'),ops=require('../src/lib/vnd-operational.ts'),report=require('../src/lib/vnd-reporting.ts'),{vndDay}=require('../src/lib/vnd-debt.ts');
let checks=0,n=0;const eq=(a,b)=>{checks++;assert.deepEqual(a,b)},bad=(f,re)=>{checks++;assert.throws(f,re)},key=()=> 'charge-import-'+(++n);
try{
 require('./seed-epacket.cjs').seed();
 const admin=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get(),make=role=>auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role}),fin=make('FINANCE'),sales=make('SALES'),otherSales=make('SALES'),client=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
 ops.vndAction(admin,{action:'activate',client_id:client.id,credit_limit:'0',reason:'TEST',request_key:key()});
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','Standard',1,0)").run(client.id);
 const o=finance.upsertOrder({client_user_id:client.id,order_id:key(),service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:1,length:1,width:1,height:1,item:'TEST',material:'Cotton'});
 db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,offer,confirmed_at,request_actor_id) VALUES (?,?,'CHARGED','100',CURRENT_TIMESTAMP,?)").run(o.id,client.id,admin.id);
 db.prepare('UPDATE orders SET service_purchased_at=CURRENT_TIMESTAMP WHERE id=?').run(o.id);
 db.prepare('INSERT INTO vnd_auto_quotes(order_id,snapshot_json) VALUES (?,?)').run(o.id,JSON.stringify({net_vnd:'30',base_vnd:'40'}));
 const call=(items,actor=admin,request_key=key())=>ops.vndAction(actor,{action:'import_charges',client_id:client.id,reason:'TEST batch',request_key,items});
 const doc=(kind,amount='1.123456',reference=key())=>({order_code:o.order_id,kind,amount,reference,reason:'TEST documentary fee'});
 const items=[doc('surcharge'),doc('tax','2.000001')],receipt=key();call(items,sales,receipt);call(items,sales,receipt);
 eq(ops.vndBalance(client.id).balance,'-3.123457');eq(db.prepare('SELECT count(*) n FROM vnd_charge_sources').get().n,2);
 call(items);eq(ops.vndBalance(client.id).balance,'-3.123457');
 bad(()=>call([{...items[0],amount:'9'}]),/nội dung/);bad(()=>call([doc('tax')],fin),/Admin/);bad(()=>call([doc('tax')],client),/Admin/);bad(()=>call([doc('tax')],otherSales),/quyền/);
 bad(()=>call([doc('tax','0')]),/dương/);bad(()=>call([doc('tax','-1')]),/âm/);
 bad(()=>call([items[0],items[0]]),/Trùng/);
 const before=JSON.stringify(ops.vndView(client.id,admin));bad(()=>call([doc('surcharge'),{...doc('tax'),order_code:'MISSING'}]),/match/);eq(JSON.stringify(ops.vndView(client.id,admin)),before);
 const r=report.vndBusinessReport(vndDay().slice(0,7));eq(r.performance[0].revenue,'1.123456');eq(r.commission.orders[0].revenue,'0'); // Existing commission inputs deliberately retain shipping/correction scope.
 eq(db.prepare('SELECT count(*) n FROM credit_debts WHERE client_id=?').get(client.id).n,0);eq(ops.vndRequest(o.id).status,'CHARGED');
 eq(ops.vndCancellationAmounts(o.id,100).collected,'3.123457');
 eq(ops.vndCancellationAmounts(o.id,100).refund,'3.123457');
 db.exec("CREATE TRIGGER TEST_charge_rollback BEFORE INSERT ON vnd_history WHEN NEW.event='IMPORT_CHARGE' BEGIN SELECT RAISE(ABORT,'TEST rollback'); END;");
 bad(()=>call([doc('tax')]),/rollback/);eq(JSON.stringify(ops.vndView(client.id,admin)),before);db.exec('DROP TRIGGER TEST_charge_rollback');
 bad(()=>db.prepare('DELETE FROM vnd_charge_sources').run(),/Immutable/);
 db.prepare("UPDATE vnd_purchase_requests SET status='CANCELLED' WHERE order_id=?").run(o.id);bad(()=>call([doc('tax')]),/chưa huỷ/);
 eq(db.pragma('integrity_check',{simple:true}),'ok');
 console.log('VND CHARGE IMPORT PASS ('+checks+' assertions)');
}finally{db.close();}
