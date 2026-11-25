require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),{db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),finance=require('../src/lib/finance.ts'),ops=require('../src/lib/vnd-operational.ts'),sup=require('../src/lib/vnd-supplier.ts'),{vndExceptions}=require('../src/lib/vnd-exceptions.ts');
let n=0,checks=0;const key=()=> 'exceptions-'+(++n),eq=(a,b)=>{checks++;assert.deepEqual(a,b)},bad=(f,re)=>{checks++;assert.throws(f,re)};
try{
 require('./seed-epacket.cjs').seed();
 const admin=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get(),make=role=>auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role}),fin=make('FINANCE'),bod=make('BOD'),sales=make('SALES'),other=make('SALES'),warehouse=make('WAREHOUSE'),client=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
 ops.vndAction(admin,{action:'activate',client_id:client.id,credit_limit:'0',reason:'TEST',request_key:key()});
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','Standard',1,0)").run(client.id);
 const o=finance.upsertOrder({client_user_id:client.id,order_id:key(),service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:1,length:1,width:1,height:1,item:'TEST',material:'Cotton'});
 db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,offer,confirmed_at,request_actor_id) VALUES (?,?,'AWAITING_FUNDS','10',CURRENT_TIMESTAMP,?)").run(o.id,client.id,admin.id);
 db.prepare('INSERT INTO vnd_auto_quotes(order_id,snapshot_json) VALUES (?,?)').run(o.id,JSON.stringify({net_vnd:'900',base_vnd:'20'}));
 sup.vndSupplierAction(admin,{action:'import',supplier:'DMD',reason:'TEST',request_key:key(),items:[{tracking:'TEST MISSING',amount:'100',reference:'TEST',reason:'TEST'}]});
 const before=JSON.stringify({ledger:db.prepare('SELECT * FROM vnd_ledger').all(),commands:db.prepare('SELECT * FROM vnd_commands').all()});
 eq(vndExceptions(admin).counts.supplier_import,1);eq(vndExceptions(fin).counts.supplier_import,1);eq(vndExceptions(bod).counts.supplier_import,1);eq(vndExceptions(sales).counts.supplier_import,0);
 eq(vndExceptions(sales).counts.purchasing,1);eq(vndExceptions(client).counts.purchasing,1);eq(vndExceptions(other).counts.purchasing,0);eq(vndExceptions(sales).counts.pricing_flags,1);eq(vndExceptions(client).counts.pricing_flags,0);
 const json=JSON.stringify(vndExceptions(sales));eq(json.includes('900'),false);eq(json.includes('DMD'),false);eq(json.includes('net_vnd'),false);eq(json.includes('base_vnd'),false);
 bad(()=>vndExceptions(warehouse),/quyền/);bad(()=>vndExceptions({...sales,role:'BOD'}),/quyền/);
 eq(JSON.stringify({ledger:db.prepare('SELECT * FROM vnd_ledger').all(),commands:db.prepare('SELECT * FROM vnd_commands').all()}),before);

 db.prepare("UPDATE vnd_purchase_requests SET status='CHARGED' WHERE order_id=?").run(o.id);
 const ledger=db.prepare("INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,?,?,'TEST',?,?)");
 ledger.run(client.id,o.id,'ORDER_CHARGE','-100',admin.id,key());
 ledger.run(client.id,o.id,'ORDER_TAX','-10',admin.id,key());
 ledger.run(client.id,o.id,'CANCELLATION_REFUND','30',admin.id,key());
 const lot=db.prepare('SELECT id FROM order_lots WHERE order_id=?').get(o.id);
 const post=(vendor,epoch,amount,delta)=>{
  const reference=key();
  const cost=db.prepare("INSERT INTO vnd_supplier_costs(lot_id,supplier,amount,reference,reason,actor_id,fulfillment_epoch) VALUES (?,?,?,?,'TEST',?,?)").run(lot.id,vendor,amount,reference,fin.id,epoch);
  db.prepare("INSERT INTO vnd_supplier_ledger(supplier,kind,delta,cost_id,reference,reason,actor_id) VALUES (?,'ACTUAL',?,?,?,'TEST',?)").run(vendor,delta,cost.lastInsertRowid,reference,fin.id);
 };
 post('DMD',0,'40','40');post('DMD',0,'35','-5');post('OTHER',7,'50','50');
 const loss=vndExceptions(fin).queues.supplier_order_losses;
 eq(loss.map(row=>[row.order_id,row.revenue,row.obligation]),[[o.id,'80','85']]);
 eq(vndExceptions(admin).counts.supplier_order_losses,1);
 eq(vndExceptions(bod).counts.supplier_order_losses,1);
 eq(vndExceptions(sales).queues.supplier_order_losses,[]);
 eq(vndExceptions(client).queues.supplier_order_losses,[]);
 eq(db.pragma('integrity_check',{simple:true}),'ok');console.log('VND EXCEPTIONS PASS ('+checks+' assertions)');
}finally{db.close();}
