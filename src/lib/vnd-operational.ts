import {db} from './db';
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
function issued(id:number){const o=order(id);return Boolean(String(o.tracking||'').trim()||String(o.label||'').trim()||db.prepare('SELECT id FROM order_trackings WHERE order_id=? LIMIT 1').get(id));}
function nonnegative(value:unknown){if(typeof value!=='string')throw Error('Số tiền VNĐ phải là chuỗi thập phân.');const x=vnd(value);if(compareVnd(x,'0')<0)throw Error('Số tiền không được âm.');return x;}
function route(o:Row){return db.prepare("SELECT * FROM service_route_configs WHERE service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE").get(String(o.service),String(o.sub_service||''),String(o.supplier)) as Row|undefined;}
class VndEligibilityError extends Error {}
/** Eligibility never uses a monetary failure to bypass an account/service/data hold. */
function eligible(o:Row){
 const c=user(Number(o.client_user_id)),r=route(o);
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
 const balance=sumVnd((db.prepare('SELECT delta FROM vnd_ledger WHERE client_id=? ORDER BY id').all(clientId) as {delta:string}[]).map(x=>x.delta));
 const reserved=sumVnd((db.prepare("SELECT reserve FROM vnd_purchase_requests WHERE client_id=? AND status NOT IN ('CHARGED','CANCELLED')").all(clientId) as {reserve:string}[]).map(x=>x.reserve));
 return {currency:'VND',balance,reserved,credit_limit:String(account.credit_limit),available:subtractVnd(addVnd(balance,String(account.credit_limit)),reserved)};
}
function append(clientId:number,orderId:number|null,kind:string,delta:string,reason:string,actorId:number,key:string){
 db.prepare('INSERT INTO vnd_ledger(client_id,order_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,?,?,?,?,?)').run(clientId,orderId,kind,vnd(delta),reason,actorId,key);
}
function process(r:Row,actorId:number){
 if(['CHARGED','CANCELLED'].includes(String(r.status)))return;
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
 const r=vndRequest(orderId);if(!r)return false;
 if(r.status==='CHARGED')return true;
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
 return {...vndBalance(clientId),requests:(db.prepare('SELECT * FROM vnd_purchase_requests WHERE client_id=? ORDER BY id').all(clientId) as Row[]).map(r=>({...r,cartons:db.prepare('SELECT id,carton_number FROM order_cartons WHERE order_id=? ORDER BY carton_number').all(r.order_id)})),
 ledger:db.prepare('SELECT * FROM vnd_ledger WHERE client_id=? ORDER BY id DESC LIMIT 200').all(clientId),
 history:db.prepare('SELECT * FROM vnd_history WHERE client_id=? ORDER BY id DESC LIMIT 200').all(clientId)};
 }).deferred();
}
export function vndAction(actor:AuthUser,input:Row){
 return db.transaction(()=>{
 const clientId=Number(input.client_id),action=String(input.action),key=String(input.request_key||''),reason=String(input.reason||'').trim();
 vndAccess(actor,clientId);
 if(!key||key.length>200)throw Error('Cần request_key.');
 const payload=JSON.stringify(Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b))));
 const prior=db.prepare('SELECT * FROM vnd_commands WHERE request_key=?').get(key) as Row|undefined;
 if(prior){if(prior.actor_id!==actor.id||prior.payload!==payload)throw Error('request_key đã dùng với dữ liệu khác.');return JSON.parse(String(prior.result_json));}
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
  if(action==='post'||action==='credit_limit'){
   if(!finance||!reason)throw Error('Cần quyền Finance và lý do.');
   if(action==='credit_limit')db.prepare('UPDATE vnd_accounts SET credit_limit=? WHERE client_id=?').run(nonnegative(input.amount),clientId);
   else {const kind=String(input.kind);if(!['PAYMENT','ADJUSTMENT'].includes(kind))throw Error('Loại posting không hợp lệ.');const delta=vnd(String(input.delta));if(kind==='PAYMENT'&&compareVnd(delta,'0')<=0)throw Error('Payment phải dương.');append(clientId,null,kind,delta,reason,actor.id,key);}
  }else{
   const id=Number(input.order_id),o=order(id);if(Number(o.client_user_id)!==clientId)throw Error('Order không thuộc Client.');
   const before=vndRequest(id);
   let r=before;
   if(action==='request'){
    if(!['ADMIN','SALES','CLIENT'].includes(actor.role))throw Error('Không có quyền Purchase.');
    if(String(o.service).toLowerCase()!=='chuyên tuyến')throw Error('VNĐ vận hành hiện hỗ trợ Chuyên tuyến Manual Quote.');
    if(!r){
     eligible(o);if(issued(id)||o.purchase_completed_at||o.pricing_snapshot_json)throw Error('Order đã phát hành / mua.');
     if(actor.role==='CLIENT'&&!route(o)?.client_self_purchase)throw Error('Route chưa cho Client tự mua.');
     db.prepare("INSERT INTO vnd_purchase_requests(order_id,client_id,status,confirmed_at,request_actor_id) VALUES (?,?,'AWAITING_QUOTE',?,?)").run(id,clientId,new Date().toISOString(),actor.id);
     db.prepare("UPDATE orders SET service_purchased_at=COALESCE(service_purchased_at,?),workflow_status='PENDING_PURCHASE' WHERE id=?").run(new Date().toISOString(),id);
    }
   }else{
    if(!r||r.status==='CANCELLED')throw Error('Chưa Purchase hoặc đã huỷ.');
    if(action==='offer'){
     if(!['ADMIN','SALES'].includes(actor.role)||!reason)throw Error('Offer cần Admin/Sales và lý do.');
     if(r.status==='CHARGED'||issued(id))throw Error('Đã Tracking/Label; dùng Financial Correction sau charge.');
     const amount=nonnegative(input.amount);if(compareVnd(amount,'0')<=0)throw Error('Offer phải lớn hơn 0; không tạo giá 0 thay báo giá thiếu.');
     if(Number(input.expected_revision)!==r.revision)throw Error('Revision đã thay đổi.');
     if(r.offer!==amount)db.prepare("UPDATE vnd_purchase_requests SET offer=?,revision=revision+1,status='PRICE_CONFIRMATION_REQUIRED' WHERE order_id=?").run(amount,id);
    }else if(action==='consent'||action==='override'){
     if(action==='consent'&&(actor.role!=='CLIENT'||actor.id!==clientId))throw Error('Client xác nhận giá; Admin/Sales dùng override có lý do.');
     if(action==='override'&&(!['ADMIN','SALES'].includes(actor.role)||!reason))throw Error('Override cần Admin/Sales và lý do.');
     if(r.status==='CHARGED'||r.offer===null||Number(input.expected_revision)!==r.revision)throw Error('Giá đã thay đổi hoặc đã charge.');
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
