require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),{db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),finance=require('../src/lib/finance.ts'),ops=require('../src/lib/vnd-operational.ts'),config=require('../src/lib/service-v1-config.ts'),prices=require('../src/lib/service-v1-pricing.ts'),fx=require('../src/lib/service-v1-fx.ts'),quote=require('../src/lib/service-v1-order-quote.ts'),tracking=require('../src/lib/order-operations.ts'),money=require('../src/lib/vnd-money.ts');
let n=0,checks=0;const key=()=> 'auto-source-test-'+(++n),eq=(a,b)=>{checks++;assert.deepEqual(a,b)},bad=(f,re)=>{checks++;assert.throws(f,re)};
(async()=>{try{
 require('./seed-epacket.cjs').seed();
 const owner=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get(),sales=auth.createUser({username:'auto-sales',display_name:'TEST',password:'TestPass123!',role:'SALES'}),client=auth.createUser({username:'auto-client',display_name:'TEST',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id}),outside=auth.createUser({username:'auto-outside',display_name:'TEST',password:'TestPass123!',role:'SALES'});
 eq(prices.serviceV1DecimalNumber(1e-8),'0.00000001');eq(prices.serviceV1DecimalNumber(1e21),'1000000000000000000000');
 const call=(action,b={},actor=owner)=>ops.vndAction(actor,{action,client_id:client.id,request_key:key(),reason:'TEST source',...b});
 call('activate',{credit_limit:'0'});
 db.prepare("INSERT OR IGNORE INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'ePacket','Standard',1,5)").run(client.id);
 const route=db.prepare("SELECT id FROM service_route_configs WHERE service='ePacket' AND sub_service='Standard' AND supplier='DMD'").get();
 db.prepare('UPDATE service_route_configs SET client_self_purchase=1 WHERE id=?').run(route.id);
 const cfg=config.saveServiceV1Config({route_id:route.id,expected_revision:0,config:{currency:'VND',adapter:'EPACKET',markets:['US']},request_key:key()},owner.id);
 const rate=fx.saveServiceV1Fx({usd_vnd:26000,request_key:key()},owner.id);
 fx.confirmServiceV1Fx({version_id:rate.id,expected_previous_id:null,confirmed:true,request_key:key()},owner.id);
 const net=quote.importFinalServiceNet(route.id,owner.id,key());
 const event=(id,action,previous=null)=>prices.serviceV1PriceEvent({document_id:id,action,expected_published_id:previous,request_key:key()},owner.id);
 const make=()=>finance.upsertOrder({client_user_id:client.id,order_id:key(),service:'ePacket',sub_service:'Standard',supplier:'DMD',country:'US',carton_count:1,weight:.05,length:1,width:1,height:1,item:'Shirt',material:'Cotton',recipient_name:'Test',address1:'100 Main',city:'New York',state:'NY',zip:'10001',phone:'123456'});
 const a=make();bad(()=>call('request',{order_id:a.id},client),/Published/);
 event(net.id,'REVIEW');event(net.id,'PUBLISH');
 const proposal=prices.createServiceV1Proposal({route_id:route.id,config_id:cfg.id,net_id:net.id,net_markup:.06,base_markup:.16,request_key:key()},owner.id);
 event(proposal.id,'REVIEW');event(proposal.id,'PUBLISH');
 const expected=money.multiplyVnd(money.multiplyVnd(money.multiplyVnd('141130.6','1.06'),'1.16'),'0.95');
 eq(quote.automaticVndOrderQuote(a.id).total_vnd,expected);
 call('request',{order_id:a.id},client);eq(ops.vndRequest(a.id).status,'PRICE_CONFIRMATION_REQUIRED');
 call('consent',{order_id:a.id,expected_revision:ops.vndRequest(a.id).revision},client);eq(ops.vndRequest(a.id).status,'AWAITING_FUNDS');
 const b=make();call('request',{order_id:b.id},client);call('consent',{order_id:b.id,expected_revision:ops.vndRequest(b.id).revision},client);
 call('post',{kind:'PAYMENT',delta:expected});eq(ops.vndRequest(a.id).status,'RESERVED');eq(ops.vndRequest(b.id).status,'AWAITING_FUNDS');
 const oldQuote=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(a.id).snapshot_json;
 const next=fx.saveServiceV1Fx({usd_vnd:27000,request_key:key()},owner.id);fx.confirmServiceV1Fx({version_id:next.id,expected_previous_id:rate.id,confirmed:true,request_key:key()},owner.id);
 call('post',{kind:'ADJUSTMENT',delta:'0'});eq(ops.vndRequest(a.id).status,'PRICE_CONFIRMATION_REQUIRED');eq(ops.vndRequest(a.id).reserve,expected);
 bad(()=>call('consent',{order_id:a.id,expected_revision:1},client),/thay đổi/);
 call('consent',{order_id:a.id,expected_revision:ops.vndRequest(a.id).revision},client);eq(ops.vndRequest(a.id).status,'AWAITING_FUNDS');
 call('post',{kind:'PAYMENT',delta:'100000'});
 // Client b must reconfirm current FX as well; no silent acceptance.
 eq(ops.vndRequest(b.id).status,'PRICE_CONFIRMATION_REQUIRED');
 const carton=db.prepare('SELECT id FROM order_cartons WHERE order_id=?').get(a.id);
 tracking.addOrderTracking({orderId:a.id,cartonId:carton.id,tracking:'AUTO-TEST-A',labelUrl:'https://labels.test/a.pdf',actorId:owner.id});
 eq(ops.vndRequest(a.id).status,'CHARGED');
 const snapshot=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(a.id).snapshot_json;
 assert.notEqual(snapshot,oldQuote);
 call('post',{kind:'ADJUSTMENT',delta:'0'});eq(db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(a.id).snapshot_json,snapshot);
 eq(db.prepare("SELECT count(*) n FROM vnd_ledger WHERE order_id=? AND kind='ORDER_CHARGE'").get(a.id).n,1);
 // Manual offer stays effective when globals change; still needs normal consent and funds.
 call('offer',{order_id:b.id,amount:'12345.678901',expected_revision:ops.vndRequest(b.id).revision});
 call('consent',{order_id:b.id,expected_revision:ops.vndRequest(b.id).revision},client);
 call('post',{kind:'ADJUSTMENT',delta:'0'});eq(ops.vndRequest(b.id).offer,'12345.678901');
 bad(()=>call('offer',{order_id:b.id,amount:'1',expected_revision:ops.vndRequest(b.id).revision},outside),/quyền/);
 bad(()=>db.prepare('DELETE FROM vnd_auto_quote_history').run(),/Immutable/);
 // Authenticated quote endpoint exposes no Net/Base/source or cross-client data.
 const {NextRequest}=require('next/server'),api=require('../src/app/api/service-v1/source/route.ts');
 const req=(actor,body)=>new NextRequest('http://local/api/service-v1/source',{method:'POST',headers:{cookie:'dmd_session='+auth.createSession(actor.id).token,'content-type':'application/json'},body:JSON.stringify(body)});
 eq((await api.POST(req(outside,{action:'quote',order_id:b.id}))).status,400);
 const response=await api.POST(req(client,{action:'quote',order_id:b.id}));eq(response.status,200);const publicBody=await response.json();
 eq(Object.keys(publicBody).some(k=>/net|base|supplier|account|source|lots/.test(k)),false);
 eq((await api.POST(req(client,{action:'import',route_id:route.id,request_key:key()}))).status,400);
 // EU and Yun have independent source markets and published VND selling rows.
 for(const [service,sub,kind,adapter,expectedNet] of [['ePacket','EU','EPACKET_EU','EPACKET','303850'],['Yun Express','Express','YUN','YUNEXPRESS','163000']]){
  for(const [type,value,parent] of [['SERVICE',service,''],['SUB_SERVICE',sub,service],['SUPPLIER','SGBay',''],['COUNTRY','AT','']])db.prepare('INSERT OR IGNORE INTO enum_values(enum_type,value,parent_value,active) VALUES (?,?,?,1)').run(type,value,parent);
  const routeId=Number(db.prepare('INSERT INTO service_route_configs(service,sub_service,supplier,active,client_self_purchase,max_cartons_per_order) VALUES (?,?,?,1,1,1)').run(service,sub,'SGBay').lastInsertRowid);
  db.prepare('INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,?,?,1,0)').run(client.id,service,sub);
  const cfg=config.saveServiceV1Config({route_id:routeId,expected_revision:0,config:{currency:'VND',adapter,markets:['AT']},request_key:key()},owner.id);
  const imported=quote.importFinalServiceNet(routeId,owner.id,key());event(imported.id,'REVIEW');event(imported.id,'PUBLISH');
  const published=prices.createServiceV1Proposal({route_id:routeId,config_id:cfg.id,net_id:imported.id,net_markup:.06,base_markup:.16,request_key:key()},owner.id);event(published.id,'REVIEW');event(published.id,'PUBLISH');
  const order=finance.upsertOrder({client_user_id:client.id,order_id:key(),service,sub_service:sub,supplier:'SGBay',country:'AT',carton_count:1,weight:.05,length:1,width:1,height:1,item:'Shirt',material:'Cotton',recipient_name:'Test',address1:'100 Main',city:'Vienna',state:'Vienna',zip:'10001',phone:'123456'});
  eq(quote.automaticVndOrderQuote(order.id).net_vnd,expectedNet);
  call('request',{order_id:order.id},client);call('consent',{order_id:order.id,expected_revision:ops.vndRequest(order.id).revision},client);
  call('post',{kind:'PAYMENT',delta:'1000000'});
  eq(ops.vndRequest(order.id).status,'RESERVED');
  const declared=db.prepare('SELECT id FROM order_cartons WHERE order_id=?').get(order.id);
  tracking.addOrderTracking({orderId:order.id,cartonId:declared.id,tracking:'AUTO-'+kind,labelUrl:'https://labels.test/'+kind+'.pdf',actorId:owner.id});
  eq(ops.vndRequest(order.id).status,'CHARGED');
 }
 // A missing automatic publication on resumption retains funds and does not undo an actual payment.
 const previous=ops.vndRequest(b.id).reserve;
 db.prepare('UPDATE service_route_configs SET active=0 WHERE id=?').run(route.id);
 // Inactive eligibility prevents issuance regardless of an existing accepted reserve.
 bad(()=>tracking.addOrderTracking({orderId:b.id,tracking:'BLOCKED',labelUrl:'https://labels.test/no.pdf',actorId:owner.id}),/phép|active|Hold/);
 eq(ops.vndRequest(b.id).reserve,previous);
 db.prepare('UPDATE service_route_configs SET active=1 WHERE id=?').run(route.id);
 const before=JSON.stringify(ops.vndView(client.id,owner));
 db.exec("CREATE TRIGGER auto_test_rollback BEFORE INSERT ON vnd_commands WHEN NEW.request_key='AUTO-ROLLBACK' BEGIN SELECT RAISE(ABORT,'TEST auto rollback'); END;");
 bad(()=>ops.vndAction(owner,{action:'post',client_id:client.id,request_key:'AUTO-ROLLBACK',reason:'TEST',kind:'PAYMENT',delta:'100'}),/rollback/);
 eq(JSON.stringify(ops.vndView(client.id,owner)),before);
 // A filename alone is not provenance: fake rows bearing the final path are rejected.
 const fakeNet=prices.createServiceV1Net({route_id:route.id,config_id:cfg.id,source_excel:'docs/data/service-v1/net-cost-final-2.xlsx',source_currency:'USD',rows:[{key:'EPACKET_US:STANDARD:0.05',net_usd:1}],request_key:key()},owner.id);
 event(fakeNet.id,'REVIEW',net.id);event(fakeNet.id,'PUBLISH',net.id);
 const fakeProposal=prices.createServiceV1Proposal({route_id:route.id,config_id:cfg.id,net_id:fakeNet.id,net_markup:.06,base_markup:.16,request_key:key()},owner.id);
 event(fakeProposal.id,'REVIEW',proposal.id);event(fakeProposal.id,'PUBLISH',proposal.id);
 bad(()=>quote.automaticVndOrderQuote(b.id),/Nội dung Net/);
 config.saveServiceV1Config({route_id:route.id,expected_revision:cfg.revision,config:{currency:'VND',adapter:'EPACKET',markets:['US','CA']},request_key:key()},owner.id);
 const held=ops.vndRequest(b.id).reserve,balanceBefore=ops.vndBalance(client.id).balance;
 call('post',{kind:'PAYMENT',delta:'1.000001'});
 eq(ops.vndBalance(client.id).balance,money.addVnd(balanceBefore,'1.000001'));
 eq(ops.vndRequest(b.id).reserve,held);
 eq(ops.vndRequest(b.id).status,'PRICE_CONFIRMATION_REQUIRED');
 assert.match(db.prepare('SELECT pricing_error FROM vnd_auto_quotes WHERE order_id=?').get(b.id).pricing_error,/Published/);
 eq(db.pragma('integrity_check',{simple:true}),'ok');
 console.log('VND AUTO PASS ('+checks+' assertions; final source ePacket Purchase/consent/FIFO/FX/charge/snapshot/privacy)');
}finally{db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
