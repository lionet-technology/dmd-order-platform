require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),{db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),finance=require('../src/lib/finance.ts'),ops=require('../src/lib/vnd-operational.ts'),{vndBusinessReport}=require('../src/lib/vnd-reporting.ts'),{vndDay}=require('../src/lib/vnd-debt.ts');
let checks=0,n=0;const eq=(a,b)=>{checks++;assert.deepEqual(a,b)},key=()=> 'commission-'+(++n);
try{
 require('./seed-epacket.cjs').seed();
 const admin=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get(),sales=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'SALES'}),client=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id});
 ops.vndAction(admin,{action:'activate',client_id:client.id,credit_limit:'0',reason:'TEST',request_key:key()});
 db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','Standard',1,0)").run(client.id);
 // Explicit synthetic purchase/ledger snapshots, never an operator DB.
 function make(revenue,base,status='CHARGED',owner=sales.id){
  const o=finance.upsertOrder({client_user_id:client.id,order_id:key(),service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:1,length:1,width:1,height:1,item:'TEST',material:'Cotton'});
  db.prepare('UPDATE orders SET sales_user_id=?,service_purchased_at=CURRENT_TIMESTAMP WHERE id=?').run(owner,o.id);
  db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,offer,confirmed_at,request_actor_id) VALUES (?,?,?,?,CURRENT_TIMESTAMP,?)").run(o.id,client.id,status,revenue,admin.id);
  if(status!=='AWAITING_QUOTE')db.prepare("INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,'ORDER_CHARGE',?,'TEST',?,?)").run(client.id,o.id,'-'+revenue,admin.id,key());
  if(base!==null)db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json) VALUES (?,?)").run(o.id,JSON.stringify({base_vnd:base,net_vnd:'1'}));
  return o;
 }
 const positive=make('100.123456','40.000001'),negative=make('10','30'),cancelled=make('100','1','CANCELLED'),missing=make('20',null),unpaid=make('50','2','AWAITING_QUOTE');
 db.prepare("INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,'ORDER_SURCHARGE','-999','TEST',?,?)").run(client.id,positive.id,admin.id,key());
 db.prepare("INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,'CANCELLATION_REFUND','90','TEST',?,?)").run(client.id,cancelled.id,admin.id,key());
 // Changing today's owner must not change historical attribution.
 db.prepare('UPDATE users SET sales_user_id=NULL WHERE id=?').run(client.id);
 const before={ledger:db.prepare('SELECT * FROM vnd_ledger').all(),statements:db.prepare('SELECT * FROM vnd_statements').all(),requests:db.prepare('SELECT * FROM vnd_purchase_requests').all()};
 const report=vndBusinessReport(vndDay().slice(0,7)),rows=report.commission.orders,by=id=>rows.find(r=>r.order_id===id);
 eq(by(positive.id).revenue,'100.123456');eq(by(positive.id).signed_gp_base,'60.123455');eq(by(negative.id).signed_gp_base,'-20');eq(by(negative.id).gp_base_for_consideration,'0');
 const total=report.commission.performance.find(r=>r.group==='NON_CANCELLATION');
 eq(total.signed_gp_base,'40.123455');eq(total.gp_base_for_consideration,'60.123455');eq(total.sales_user_id,sales.id);eq(total.claim_refund,null);eq(total.gp_base_minus_claim_refund,null);
 eq(by(cancelled.id).gp_base_for_consideration,'0');eq(by(cancelled.id).cancellation_refund,'90');eq(by(missing.id).signed_gp_base,null);eq(by(missing.id).gp_base_for_consideration,null);eq(by(unpaid.id).revenue,'0');eq(by(unpaid.id).gp_base_for_consideration,'0');const unknown=require('../src/lib/vnd-commission.ts').vndCommissionInputs([{id:positive.id,client_user_id:client.id,sales_user_id:null,status:'CHARGED'}]).orders[0];eq(unknown.group,'ATTRIBUTION_REVIEW');eq(unknown.gp_base_for_consideration,null);
 eq(vndBusinessReport('2000-01').commission.orders,[]);eq(vndBusinessReport(vndDay().slice(0,7)),report);
 eq({ledger:db.prepare('SELECT * FROM vnd_ledger').all(),statements:db.prepare('SELECT * FROM vnd_statements').all(),requests:db.prepare('SELECT * FROM vnd_purchase_requests').all()},before);
 eq(db.pragma('integrity_check',{simple:true}),'ok');
 console.log('VND COMMISSION PASS ('+checks+' assertions)');
}finally{db.close();}
