import {db} from './db';
import {applyVndRefund,vndRefundView} from './vnd-refunds';
import {vndEpacketDestination} from './vnd-routing';
import {vndDebt,vndDebtProjection,accrueVndDebt,settleVndPayment,vndDebtAction} from './vnd-debt';
import {finalizeVndStatement,vndCreditOverdue} from './vnd-statements';
import {duplicateVndOrder} from './vnd-duplicate';
import {editVndShipping} from './vnd-shipping-edit';
import {automaticVndOrderQuote,automaticSourceKind} from './service-v1-order-quote';
import {routeState} from './route-lifecycle';
import {vnd,addVnd,subtractVnd,sumVnd,compareVnd,cancellationRefundVnd} from './vnd-money';
import type {AuthUser} from './auth';
type Row=Record<string,unknown>;
export function isVndClient(clientId:number){return Boolean(db.prepare('SELECT 1 FROM vnd_accounts WHERE client_id=?').get(clientId));}
export function vndRequest(orderId:number){return db.prepare('SELECT * FROM vnd_purchase_requests WHERE order_id=?').get(orderId) as Row|undefined;}
function user(id:number){return db.prepare('SELECT * FROM users WHERE id=?').get(id) as Row|undefined;}
export function vndAccess(actor:Pick<AuthUser,'id'|'role'>,clientId:number){
 const actual=user(actor.id),client=user(clientId);
 if(!actual?.active||actual.role!==actor.role||client?.role!=='CLIENT'||!(['ADMIN','BOD','FINANCE'].includes(actor.role)||actor.role==='CLIENT'&&actor.id===clientId||actor.role==='SALES'&&client.sales_user_id===actor.id))throw Error('Không có quyền với tài khoản VNĐ.');
}
function history(clientId:number,orderId:number|null,event:string,data:unknown,actorId:number){db.prepare('INSERT INTO vnd_history(client_id,order_id,event,data_json,actor_id) VALUES (?,?,?,?,?)').run(clientId,orderId,event,JSON.stringify(data),actorId);}
function order(id:number){const o=db.prepare('SELECT * FROM orders WHERE id=?').get(id) as Row|undefined;if(!o)throw Error('Order không tồn tại.');return o;}
export function issued(id:number){const o=order(id);return Boolean(String(o.tracking||'').trim()||String(o.label||'').trim()||db.prepare('SELECT id FROM order_trackings WHERE order_id=? LIMIT 1').get(id));}
function nonnegative(value:unknown){if(typeof value!=='string')throw Error('Số tiền VNĐ phải là chuỗi thập phân.');const x=vnd(value);if(compareVnd(x,'0')<0)throw Error('Số tiền không được âm.');return x;}
function route(o:Row){return db.prepare("SELECT * FROM service_route_configs WHERE service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE").get(String(o.service),String(o.sub_service||''),String(o.supplier)) as Row|undefined;}
class VndEligibilityError extends Error {}
/** Eligibility never uses a monetary failure to bypass an account/service/data hold. */
function eligible(o:Row){
 const c=user(Number(o.client_user_id)),r=route(o);
 if(vndDebtProjection(Number(o.client_user_id)).overdue||vndCreditOverdue(Number(o.client_user_id),vndBalance(Number(o.client_user_id)).balance))throw new VndEligibilityError('Debt hoặc Balance theo Credit Term đã quá hạn.');
 if(!c?.active||c.purchase_locked)throw new VndEligibilityError('Client ngừng hoạt động hoặc bị khóa mua.');
 if(!r?.active||r.warehouse_hold||routeState(Number(r.id))!=='ACTIVE'||o.workflow_status==='HOLD'||['CANCELLED','CLOSED','DELIVERED'].includes(String(o.workflow_status)))throw new VndEligibilityError('Order / route không cho phép mua.');
 if(db.prepare("SELECT id FROM warehouse_order_holds WHERE order_id=? AND released_at IS NULL").get(o.id))throw new VndEligibilityError('Order đang Hold.');
 if(db.prepare("SELECT c.id FROM operation_cases c JOIN operation_case_orders o ON o.case_id=c.id WHERE o.order_id=? AND c.kind='HOLD' AND c.status NOT IN ('RESOLVED','CLOSED')").get(o.id))throw new VndEligibilityError('Order có Case Hold.');
 const s=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND service=? COLLATE NOCASE AND (sub_service=? COLLATE NOCASE OR sub_service='') ORDER BY length(sub_service) DESC LIMIT 1").get(c.id,o.service,String(o.sub_service||'')) as Row|undefined;
 if(!s?.is_enabled)throw new VndEligibilityError('Client chưa được cấp dịch vụ.');
 for(const key of ['order_id','recipient_name','address1','city','state','zip','phone','item','material','country'])if(!String(o[key]||'').trim())throw new VndEligibilityError('Thiếu thông tin bắt buộc: '+key);
 const cartons=db.prepare('SELECT * FROM order_cartons WHERE order_id=?').all(o.id) as Row[];
 if(!cartons.length||cartons.length!==Number(o.carton_count)||Number(o.weight)<=0||Number(o.volume)<=0)throw new VndEligibilityError('Dữ liệu kiện / cân / thể tích chưa hợp lệ.');
 if(Number(r.max_cartons_per_order)>0&&cartons.length>Number(r.max_cartons_per_order))throw new VndEligibilityError('Vượt số kiện dịch vụ.');
}
export function vndBalance(clientId:number){
 if(!isVndClient(clientId))throw Error('Client chưa có tài khoản VNĐ.');
 const account=db.prepare('SELECT * FROM vnd_accounts WHERE client_id=?').get(clientId) as Row;
 const ledger_balance=sumVnd((db.prepare('SELECT delta FROM vnd_ledger WHERE client_id=? ORDER BY id').all(clientId) as {delta:string}[]).map(x=>x.delta));
 const balance=addVnd(ledger_balance,String(vndDebt(clientId).principal));
 const reserved=sumVnd((db.prepare("SELECT reserve FROM vnd_purchase_requests WHERE client_id=? AND status NOT IN ('CHARGED','CANCELLED')").all(clientId) as {reserve:string}[]).map(x=>x.reserve));
 return {currency:'VND',balance,ledger_balance,debt:vndDebtProjection(clientId),reserved,credit_limit:String(account.credit_limit),available:subtractVnd(addVnd(balance,String(account.credit_limit)),reserved)};
}
function append(clientId:number,orderId:number|null,kind:string,delta:string,reason:string,actorId:number,key:string){
 db.prepare('INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,?,?,?,?,?)').run(clientId,orderId,kind,vnd(delta),reason,actorId,key);
}
export function refreshAutomatic(r:Row){
 const o=order(Number(r.order_id));
 if(!automaticSourceKind(String(o.service),String(o.sub_service))||['CHARGED','CANCELLED'].includes(String(r.status))||issued(Number(o.id)))return r;
 try{
  const quote=automaticVndOrderQuote(Number(o.id));
  const old=db.prepare('SELECT * FROM vnd_auto_quotes WHERE order_id=?').get(o.id) as Row|undefined;
  const snapshot=JSON.stringify(quote);
  if(snapshot!==old?.snapshot_json)db.prepare('INSERT INTO vnd_auto_quote_history(order_id,snapshot_json) VALUES (?,?)').run(o.id,snapshot);
  db.prepare('INSERT INTO vnd_auto_quotes(order_id,snapshot_json) VALUES (?,?) ON CONFLICT(order_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,pricing_error=NULL').run(o.id,snapshot);
  if(!old?.manual_offer&&r.offer!==quote.total_vnd)db.prepare("UPDATE vnd_purchase_requests SET offer=?,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED' WHERE order_id=?").run(quote.total_vnd,o.id);
 }catch(e){
  if(e&&typeof e==='object'&&'code' in e)throw e;
  const reason=e instanceof Error?e.message:'Lỗi giá';
  db.prepare("INSERT INTO vnd_auto_quotes(order_id,snapshot_json,pricing_error) VALUES (?,'{}',?) ON CONFLICT(order_id) DO UPDATE SET pricing_error=excluded.pricing_error").run(o.id,reason);
  db.prepare("UPDATE vnd_purchase_requests SET status='PRICE_CONFIRMATION_REQUIRED' WHERE order_id=?").run(o.id);
 }
 return vndRequest(Number(o.id))!;
}
function process(r:Row,actorId:number){
 if(['CHARGED','CANCELLED'].includes(String(r.status)))return;
 r=refreshAutomatic(r);
 if((db.prepare('SELECT pricing_error FROM vnd_auto_quotes WHERE order_id=?').get(r.order_id) as Row|undefined)?.pricing_error)return;
 if(r.status==='RESERVED'&&r.reserve===r.offer&&r.accepted_revision===r.revision)return;
 if(r.offer===null){db.prepare("UPDATE vnd_purchase_requests SET status='AWAITING_QUOTE' WHERE id=?").run(r.id);return;}
 if(r.accepted_revision!==r.revision){db.prepare("UPDATE vnd_purchase_requests SET status='PRICE_CONFIRMATION_REQUIRED' WHERE id=?").run(r.id);return;}
 try{eligible(order(Number(r.order_id)));}catch(e){if(!(e instanceof VndEligibilityError))throw e;history(Number(r.client_id),Number(r.order_id),'PURCHASE_INELIGIBLE',{reason:e instanceof Error?e.message:'Eligibility'},actorId);return;}
 const room=addVnd(vndBalance(Number(r.client_id)).available,String(r.reserve));
 const status=compareVnd(room,String(r.offer))<0?'AWAITING_FUNDS':'RESERVED';
 const reserve=status==='RESERVED'?String(r.offer):String(r.reserve);
 db.prepare('UPDATE vnd_purchase_requests SET status=?,reserve=? WHERE id=?').run(status,reserve,r.id);
 if(status!==r.status||reserve!==r.reserve)history(Number(r.client_id),Number(r.order_id),status,{previous_reserve:r.reserve,reserve,revision:r.revision},actorId);
}
export function resumeVndPurchases(clientId:number,actorId:number){
 // Immediate outer transaction serializes independent writers; request id is the stable FIFO tie-break.
 for(const r of db.prepare("SELECT * FROM vnd_purchase_requests WHERE client_id=? AND status NOT IN ('CHARGED','CANCELLED') ORDER BY id").all(clientId) as Row[])process(r,actorId);
}
export function assertVndIssuance(orderId:number){
 let r=vndRequest(orderId);if(!r)return false;
 if(r.status==='CHARGED')return true;
 r=refreshAutomatic(r);
 if((db.prepare('SELECT pricing_error FROM vnd_auto_quotes WHERE order_id=?').get(orderId) as Row|undefined)?.pricing_error)throw Error('Giá tự động chưa hợp lệ; Admin cần xử lý.');
 eligible(order(orderId));
 if(r.status!=='RESERVED'||r.accepted_revision!==r.revision)throw Error('Chờ giá / xác nhận giá / sức mua; chưa được cấp Tracking/Label.');
 return true;
}
export function completeVndReserve(orderId:number,actorId:number){
 const r=vndRequest(orderId);if(!r)return false;
 if(r.status==='CHARGED')return true;
 assertVndIssuance(orderId);
 const cartons=db.prepare('SELECT id FROM order_cartons WHERE order_id=?').all(orderId) as {id:number}[];
 if(!cartons.every(c=>db.prepare("SELECT id FROM order_trackings WHERE order_id=? AND carton_id=? AND status='ACTIVE' AND trim(COALESCE(label_url,''))<>''").get(orderId,c.id)))return true;
 append(Number(r.client_id),orderId,'ORDER_CHARGE',subtractVnd('0',String(r.offer)),'Đủ Tracking và Label toàn Order',actorId||Number(r.request_actor_id),'vnd-charge:'+orderId);
 db.prepare("UPDATE vnd_purchase_requests SET status='CHARGED',reserve='0',charged_offer=offer WHERE order_id=?").run(orderId);
 db.prepare("UPDATE orders SET workflow_status='PURCHASED',purchase_completed_at=CURRENT_TIMESTAMP WHERE id=?").run(orderId);
 history(Number(r.client_id),orderId,'CHARGED',{amount:r.offer},actorId||Number(r.request_actor_id));
 resumeVndPurchases(Number(r.client_id),actorId||Number(r.request_actor_id));return true;
}
export function vndCancellationAmounts(orderId:number,percent:number){
 const entries=db.prepare('SELECT kind,delta FROM vnd_ledger WHERE order_id=? ORDER BY id').all(orderId) as {kind:string;delta:string}[];
 const collected=subtractVnd('0',sumVnd(entries.filter(e=>['ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX'].includes(e.kind)).map(e=>e.delta)));
 const previous=sumVnd(entries.filter(e=>e.kind==='CANCELLATION_REFUND').map(e=>e.delta));
 return {collected,previous,refund:cancellationRefundVnd(collected,previous,String(percent)),support:cancellationRefundVnd(collected,previous,'100')};
}
export function cancelVndMoney(orderId:number,percent:number,reason:string,actorId:number){
 const r=vndRequest(orderId);if(!r)return null;
 const entries=db.prepare('SELECT kind,delta FROM vnd_ledger WHERE order_id=? ORDER BY id').all(orderId) as {kind:string;delta:string}[];
 const collected=subtractVnd('0',sumVnd(entries.filter(e=>['ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX'].includes(e.kind)).map(e=>e.delta)));
 const previous=sumVnd(entries.filter(e=>e.kind==='CANCELLATION_REFUND').map(e=>e.delta));
 const refund=cancellationRefundVnd(collected,previous,String(percent));
 if(compareVnd(refund,'0')>0)append(Number(r.client_id),orderId,'CANCELLATION_REFUND',refund,reason,actorId,'vnd-cancel:'+orderId);
 db.prepare("UPDATE vnd_purchase_requests SET status='CANCELLED',reserve='0' WHERE order_id=?").run(orderId);
 history(Number(r.client_id),orderId,'CANCELLED',{refund,percent,collected,previous},actorId);
 return {refund,collected,retained:subtractVnd(subtractVnd(collected,previous),refund)};
}
export function vndView(clientId:number,actor:AuthUser){
 return db.transaction(()=>{
 vndAccess(actor,clientId);
 return {...vndBalance(clientId),refunds:vndRefundView(clientId,actor),replacements:db.prepare('SELECT source_order_id,replacement_order_id FROM vnd_replacements r JOIN orders o ON o.id=r.source_order_id WHERE o.client_user_id=?').all(clientId),requests:(db.prepare('SELECT * FROM vnd_purchase_requests WHERE client_id=? ORDER BY id').all(clientId) as Row[]).map(r=>({...r,pricing_error:(db.prepare('SELECT pricing_error FROM vnd_auto_quotes WHERE order_id=?').get(r.order_id) as Row|undefined)?.pricing_error??null,cartons:db.prepare('SELECT id,carton_number FROM order_cartons WHERE order_id=? ORDER BY carton_number').all(r.order_id)})),
 ledger:db.prepare('SELECT * FROM vnd_ledger WHERE client_id=? ORDER BY id DESC LIMIT 200').all(clientId),
 history:(db.prepare('SELECT * FROM vnd_history WHERE client_id=? ORDER BY id DESC LIMIT 200').all(clientId) as Row[]).map(h=>['CLIENT','SALES'].includes(actor.role)?{id:h.id,client_id:h.client_id,order_id:h.order_id,event:h.event,actor_id:h.actor_id,created_at:h.created_at}:h)};
 }).deferred();
}
export function vndAction(actor:AuthUser,input:Row){
 return db.transaction(()=>{
 const clientId=Number(input.client_id),action=String(input.action),key=String(input.request_key||''),reason=String(input.reason||'').trim();
 vndAccess(actor,clientId);
 if(!key||key.length>200)throw Error('Cần request_key.');
 const payload=JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
 const prior=db.prepare('SELECT * FROM vnd_commands WHERE request_key=?').get(key) as Row|undefined;
 if(prior){if(prior.actor_id!==actor.id||prior.payload!==payload)throw Error('request_key đã dùng với dữ liệu khác.');const result=JSON.parse(String(prior.result_json));if(['CLIENT','SALES'].includes(actor.role)){result.history=result.history.map((h:Row)=>({id:h.id,client_id:h.client_id,order_id:h.order_id,event:h.event,actor_id:h.actor_id,created_at:h.created_at}));if(result.refunds)result.refunds.events=result.refunds.events.map((e:Row)=>{const safe={...e};delete safe.bank_json;return safe;});}return result;}
 const admin=['ADMIN','BOD'].includes(actor.role),finance=admin||actor.role==='FINANCE';
 if(action==='activate'){
  if(!admin)throw Error('Chỉ Admin/BOD mở tài khoản VNĐ.');
  if(isVndClient(clientId))throw Error('Đã có tài khoản VNĐ.');
  if(db.prepare('SELECT id FROM ledger_entries WHERE client_user_id=? LIMIT 1').get(clientId)||db.prepare('SELECT order_id FROM purchase_reserves WHERE client_id=? LIMIT 1').get(clientId)||db.prepare('SELECT id FROM credit_debts WHERE client_id=? LIMIT 1').get(clientId)||db.prepare('SELECT id FROM orders WHERE client_user_id=? LIMIT 1').get(clientId))throw Error('Chỉ mở VNĐ cho Client mới chưa có Order / dữ liệu tài chính.');
  for(const table of ['credit_statements','statement_v2_events','statement_v2_snapshots','debt_aging_openings']){
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)&&db.prepare(`SELECT 1 FROM ${table} WHERE client_id=? LIMIT 1`).get(clientId))throw Error('Client còn lịch sử tài chính; cần cutover được đối chiếu riêng.');
  }
  if(Number(user(clientId)?.credit_limit_cents||0)!==0)throw Error('Credit cũ chưa đối chiếu.');
  db.prepare('INSERT INTO vnd_accounts(client_id,credit_limit,actor_id) VALUES (?,?,?)').run(clientId,nonnegative(input.credit_limit??'0'),actor.id);
 }else{
  if(!isVndClient(clientId))throw Error('Client chưa có tài khoản VNĐ.');
  accrueVndDebt(clientId,actor.id);
  if(action.startsWith('claim_')||action.startsWith('refund_')){
   applyVndRefund(actor,clientId,input,key,reason);
  }else if(action==='statement'){
   if(!finance||!reason)throw Error('Chốt Statement cần Finance/Admin/BOD và lý do.');
   finalizeVndStatement(clientId,input,actor.id);
  }else if(['debt','debt_rate','extend_debt'].includes(action)){
   if(!admin||!reason)throw Error('Debt cần Admin/BOD và lý do.');
   vndDebtAction(clientId,action,input,vndBalance(clientId).balance,actor.id,reason);
  }else if(action==='addon'||action==='addon_edit'){
   if(!['ADMIN','BOD','SALES'].includes(actor.role)||!reason)throw Error('Add-on cần quyền Sales/Admin/BOD và lý do.');
   const prior=action==='addon_edit'?db.prepare('SELECT * FROM vnd_addons WHERE id=? AND client_id=?').get(Number(input.addon_id),clientId) as Row|undefined:undefined;
   if(action==='addon_edit'&&(!prior||Number(input.expected_revision)!==prior.revision))throw Error('Add-on/revision đã thay đổi.');
   const name=String(input.name??prior?.name??'').trim(),revenue=nonnegative(input.revenue??prior?.revenue),cost=input.cost===null?null:input.cost===undefined?(prior?.cost??null):nonnegative(input.cost),supplier=String(input.supplier??prior?.supplier??'').trim(),note=String(input.note??prior?.note??'').trim();
   if(!name||name.length>200||supplier.length>500||note.length>2000)throw Error('Tên Add-on bắt buộc; nội dung quá dài.');
   let addonId:number;
   if(prior){
    addonId=Number(prior.id);
    db.prepare('UPDATE vnd_addons SET name=?,revenue=?,cost=?,supplier=?,note=?,revision=revision+1 WHERE id=?').run(name,revenue,cost,supplier,note,addonId);
   }else addonId=Number(db.prepare('INSERT INTO vnd_addons(client_id,name,revenue,cost,supplier,note,actor_id) VALUES (?,?,?,?,?,?,?)').run(clientId,name,revenue,cost,supplier,note,actor.id).lastInsertRowid);
   const delta=subtractVnd(String(prior?.revenue??'0'),revenue);
   if(delta!=='0')append(clientId,null,prior?'ADDON_CORRECTION':'ADDON_REVENUE',delta,reason+' [Add-on '+addonId+']',actor.id,key);
   db.prepare('INSERT INTO vnd_addon_history(addon_id,data_json,actor_id) VALUES (?,?,?)').run(addonId,JSON.stringify({before:prior??null,after:{name,revenue,cost,supplier,note},reason}),actor.id);
  }else if(action==='import_charges'){
   if(!['ADMIN','SALES'].includes(actor.role)||!reason)throw Error('Import phí/thuế cần Admin/Sales và lý do.');
   if(!Array.isArray(input.items)||!input.items.length||input.items.length>200)throw Error('Import 1–200 dòng.');
   const seen=new Set<string>();
   for(const raw of input.items as Row[]){
    const kind=String(raw.kind),reference=String(raw.reference??'').trim(),note=String(raw.reason??'').trim();
    if(!['surcharge','tax'].includes(kind)||!reference||reference.length>200||!note||note.length>2000)throw Error('Cần loại surcharge/tax, tham chiếu dòng duy nhất và lý do.');
    if(seen.has(reference))throw Error('Trùng tham chiếu trong file.');seen.add(reference);
    const amount=nonnegative(raw.amount);if(compareVnd(amount,'0')<=0)throw Error('Phí/thuế phải dương.');
    let id=Number(raw.order_id);
    if(raw.order_code!==undefined){
     if(raw.order_id!==undefined)throw Error('Chọn Order ID hoặc DB ID.');
     const matches=db.prepare('SELECT id FROM orders WHERE client_user_id=? AND order_id=?').all(clientId,String(raw.order_code).trim()) as Row[];
     if(matches.length!==1)throw Error('Order ID không match duy nhất trong Client.');id=Number(matches[0].id);
    }
    const o=order(id);if(Number(o.client_user_id)!==clientId)throw Error('Order không thuộc Client.');
    const r=vndRequest(id);if(r?.status!=='CHARGED')throw Error('Phí/thuế chỉ nhập cho Order VNĐ đã charge và chưa huỷ.');
    const priorSource=db.prepare('SELECT * FROM vnd_charge_sources WHERE client_id=? AND reference=?').get(clientId,reference) as Row|undefined;
    if(priorSource){
     if(priorSource.order_id!==id||priorSource.kind!==kind||priorSource.amount!==amount||priorSource.reason!==note)throw Error('Tham chiếu đã dùng với nội dung khác.');
     continue;
    }
    const sourceId=Number(db.prepare('INSERT INTO vnd_charge_sources(client_id,order_id,kind,amount,reference,reason,actor_id) VALUES (?,?,?,?,?,?,?)').run(clientId,id,kind,amount,reference,note,actor.id).lastInsertRowid);
    append(clientId,id,kind==='tax'?'ORDER_TAX':'ORDER_SURCHARGE',subtractVnd('0',amount),note+' ['+reference+']',actor.id,'vnd-import-charge:'+sourceId);
    history(clientId,id,'IMPORT_CHARGE',{source_id:sourceId,kind,amount,reference,reason:note,batch_reason:reason},actor.id);
   }
  }else if(action==='duplicate'){
   if(actor.role!=='ADMIN'||!reason)throw Error('Cancel & Duplicate cần Admin và lý do.');
   const o=order(Number(input.order_id));if(Number(o.client_user_id)!==clientId)throw Error('Order không thuộc Client.');
   const replacementId=duplicateVndOrder(o,actor,key,reason,input.refund_percent);
   refreshAutomatic(vndRequest(replacementId)!);
   history(clientId,Number(o.id),'CANCEL_DUPLICATE',{replacement_order_id:replacementId},actor.id);
  }else if(action==='edit'){
   if(actor.role!=='ADMIN'||!reason)throw Error('Edit Order cần Admin và lý do.');
   const o=order(Number(input.order_id));if(Number(o.client_user_id)!==clientId)throw Error('Order không thuộc Client.');
   const result=editVndShipping(o,input);
   history(clientId,Number(o.id),'SHIPPING_EDIT',result,actor.id);
   const request=vndRequest(Number(o.id));if(request)refreshAutomatic(request);
  }else if(action==='post'||action==='credit_limit'){
   if(!finance||!reason)throw Error('Cần quyền Finance và lý do.');
   if(action==='credit_limit')db.prepare('UPDATE vnd_accounts SET credit_limit=? WHERE client_id=?').run(nonnegative(input.amount),clientId);
   else {const kind=String(input.kind);if(!['PAYMENT','ADJUSTMENT'].includes(kind))throw Error('Loại posting không hợp lệ.');const delta=vnd(String(input.delta));if(kind==='PAYMENT'&&compareVnd(delta,'0')<=0)throw Error('Payment phải dương.');append(clientId,null,kind,delta,reason,actor.id,key);if(kind==='PAYMENT')settleVndPayment(clientId,delta,actor.id,reason);}
  }else{
   const id=Number(input.order_id),o=order(id);if(Number(o.client_user_id)!==clientId)throw Error('Order không thuộc Client.');
   const before=vndRequest(id);
   let r=before?refreshAutomatic(before):undefined;
   if(action==='request'){
    if(!['ADMIN','SALES','CLIENT'].includes(actor.role))throw Error('Không có quyền Purchase.');
    if(String(o.service).toLowerCase()!=='chuyên tuyến'&&!automaticSourceKind(String(o.service),String(o.sub_service)))throw Error('Dịch vụ chưa nối VNĐ.');
    if(!r){
     const selected=vndEpacketDestination(clientId,String(o.service),String(o.sub_service),String(o.supplier),String(o.country));
     if(selected.sub_service!==o.sub_service||selected.supplier!==o.supplier){
      if(issued(id)||o.purchase_completed_at||o.pricing_snapshot_json)throw Error('Không định tuyến lại Order đã phát hành.');
      db.prepare('UPDATE orders SET sub_service=?,supplier=? WHERE id=?').run(selected.sub_service,selected.supplier,id);
      o.sub_service=selected.sub_service;o.supplier=selected.supplier;
     }
     if(automaticSourceKind(String(o.service),String(o.sub_service)))automaticVndOrderQuote(id);
     eligible(o);if(issued(id)||o.purchase_completed_at||o.pricing_snapshot_json)throw Error('Order đã phát hành / mua.');
     if(actor.role==='CLIENT'&&!route(o)?.client_self_purchase)throw Error('Route chưa cho Client tự mua.');
     db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,confirmed_at,request_actor_id) VALUES (?,?,'AWAITING_QUOTE',?,?)").run(id,clientId,new Date().toISOString(),actor.id);
     db.prepare("UPDATE orders SET service_purchased_at=COALESCE(service_purchased_at,?),workflow_status='PENDING_PURCHASE' WHERE id=?").run(new Date().toISOString(),id);
    }
    r=refreshAutomatic(vndRequest(id)!);
   }else{
    if(!r||r.status==='CANCELLED')throw Error('Chưa Purchase hoặc đã huỷ.');
    if(action==='offer'){
     if(!['ADMIN','SALES'].includes(actor.role)||!reason)throw Error('Offer cần Admin/Sales và lý do.');
     if(r.status==='CHARGED'||issued(id))throw Error('Đã Tracking/Label; dùng Financial Correction sau charge.');
     if(automaticSourceKind(String(o.service),String(o.sub_service)))db.prepare('UPDATE vnd_auto_quotes SET manual_offer=1 WHERE order_id=?').run(id);
     const amount=nonnegative(input.amount);if(compareVnd(amount,'0')<=0)throw Error('Offer phải lớn hơn 0; không tạo giá 0 thay báo giá thiếu.');
     if(Number(input.expected_revision)!==r.revision)throw Error('Revision đã thay đổi.');
     if(r.offer!==amount)db.prepare("UPDATE vnd_purchase_requests SET offer=?,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED' WHERE order_id=?").run(amount,id);
    }else if(action==='consent'||action==='override'){
     if(action==='consent'&&(actor.role!=='CLIENT'||actor.id!==clientId))throw Error('Client xác nhận giá; Admin/Sales dùng override có lý do.');
     if(action==='override'&&(!['ADMIN','SALES'].includes(actor.role)||!reason))throw Error('Override cần Admin/Sales và lý do.');
     if(r.status==='CHARGED'||r.offer===null||Number(input.expected_revision)!==r.revision)throw Error('Giá đã thay đổi hoặc đã charge.');
     if((db.prepare('SELECT pricing_error FROM vnd_auto_quotes WHERE order_id=?').get(id) as Row|undefined)?.pricing_error)throw Error('Giá tự động chưa hợp lệ.');
     eligible(o);
     db.prepare('UPDATE vnd_purchase_requests SET accepted_revision=revision WHERE order_id=?').run(id);
    }else if(action==='correction'||action==='surcharge'||action==='tax'){
     if(!['ADMIN','SALES'].includes(actor.role)||!reason||r.status!=='CHARGED')throw Error('Financial Posting cần đơn đã charge, Admin/Sales và lý do.');
     if(action==='correction'){
      if(Number(input.expected_revision)!==r.revision)throw Error('Revision đã thay đổi.');
      const amount=nonnegative(input.amount),delta=subtractVnd(String(r.offer),amount);
      append(clientId,id,'ORDER_CORRECTION',delta,reason,actor.id,key);
      db.prepare('UPDATE vnd_purchase_requests SET offer=?,revision=revision+1 WHERE order_id=?').run(amount,id);
     }else append(clientId,id,action==='tax'?'ORDER_TAX':'ORDER_SURCHARGE',subtractVnd('0',nonnegative(input.amount)),reason,actor.id,key);
    }else throw Error('Action không hỗ trợ.');
   }
   r=vndRequest(id);
   history(clientId,id,action,{...input,before,after:r},actor.id);
  }
  resumeVndPurchases(clientId,actor.id);
 }
 history(clientId,null,action,{...input},actor.id);
 const result=vndView(clientId,actor);
 db.prepare('INSERT INTO vnd_commands(request_key,actor_id,payload,result_json) VALUES (?,?,?,?)').run(key,actor.id,payload,JSON.stringify(result));
 return result;
 }).immediate();
}
