import {db} from './db';
import type {AuthUser} from './auth';
import {vndAccess,vndBalance,resumeVndPurchases} from './vnd-operational';
import {vnd,compareVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay,vndDay} from './vnd-debt';
import {addClaimProcessing,claimOrderIds,claimProcessing,claimWatchlist,setClaimWatchlist} from './vnd-claim-cases';
type Row=Record<string,unknown>;
export function vndRefundBalance(clientId:number){
 return sumVnd((db.prepare('SELECT delta FROM vnd_refund_events WHERE client_id=? ORDER BY id').all(clientId) as {delta:string}[]).map(r=>r.delta));
}
function amount(value:unknown,positive=false){
 if(typeof value!=='string')throw Error('Nhập số tiền VNĐ dạng thập phân.');
 const n=vnd(value);if(compareVnd(n,'0')<(positive?1:0))throw Error('Số tiền không hợp lệ.');return n;
}
function text(value:unknown,max=2000){const s=typeof value==='string'?value.trim():'';if(!s||s.length>max)throw Error('Cần nội dung/chứng từ hợp lệ.');return s;}
function context(ids:number[],clientId:number,requireCharged=false){
 return ids.map(id=>{
  const o=db.prepare('SELECT id,client_user_id,sales_user_id,workflow_status FROM orders WHERE id=?').get(id) as Row|undefined;
  const r=db.prepare('SELECT status FROM vnd_purchase_requests WHERE order_id=?').get(id) as Row|undefined;
  if(!o||o.client_user_id!==clientId||!r||requireCharged&&r.status!=='CHARGED')throw Error('Claim cần Order VNĐ đã charge, chưa huỷ, thuộc Client.');
  const entries=db.prepare("SELECT kind,delta FROM vnd_ledger WHERE order_id=? AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX') ORDER BY id").all(id) as Row[];
  return {order_id:id,sales_user_id:o.sales_user_id,total_current_revenue:subtractVnd('0',sumVnd(entries.map(e=>String(e.delta)))),declared_goods:db.prepare('SELECT i.description,i.unit_manufacturing_value,i.currency,c.quantity FROM carton_items c JOIN order_items i ON i.id=c.order_item_id WHERE i.order_id=? ORDER BY c.id').all(id)};
 });
}
export function vndRefundView(clientId:number,actor:AuthUser){
 vndAccess(actor,clientId);
 const privateBank=['ADMIN','FINANCE','BOD'].includes(actor.role);
 const events=db.prepare('SELECT * FROM vnd_refund_events WHERE client_id=? ORDER BY id DESC').all(clientId) as Row[];
 const decisions=new Map<unknown,Row>();
 for(const event of events) if(event.kind==='DECISION'&&!decisions.has(event.claim_id)) decisions.set(event.claim_id,event);
 const claims=(db.prepare('SELECT * FROM vnd_claims WHERE client_id=? ORDER BY id DESC').all(clientId) as Row[]).map(c=>{
  const order_ids=JSON.parse(String(c.orders_json)) as number[];
  const decision=decisions.get(c.id);
  return {...c,id:c.id,order_ids,decision_basis:context(order_ids,clientId),...claimProcessing('CLIENT',c.id,Boolean(decision))};
 });
 return {currency:'VND',refund_balance:vndRefundBalance(clientId),claims,watchlist:claimWatchlist('CLIENT',clientId,claims),events:events.map(r=>{const publicRow={...r};if(!privateBank)delete publicRow.bank_json;return publicRow;})};
}
/** Called only inside the serialized vndAction transaction/receipt. No automatic compensation formula. */
export function applyVndRefund(actor:AuthUser,clientId:number,input:Row,key:string,reason:string){
 const action=String(input.action);
 if(!reason)throw Error('Cần lý do.');
 if(action==='claim_create'){
  if(!['ADMIN','SALES','CLIENT'].includes(actor.role))throw Error('Không có quyền tạo Claim.');
  if(!['SHIPPING_ISSUE','FORCE_MAJEURE','RECONCILIATION_ERROR'].includes(String(input.category)))throw Error('Nhóm Claim không hợp lệ.');
  const ids=claimOrderIds(input.order_ids);context(ids,clientId,true);
  db.prepare('INSERT INTO vnd_claims(client_id,category,orders_json,evidence,note,actor_id) VALUES (?,?,?,?,?,?)').run(clientId,input.category,JSON.stringify(ids),text(input.evidence),text(typeof input.note==='string'&&input.note.trim()?input.note:reason),actor.id);
  return;
 }
 if(action==='claim_watchlist'||action==='claim_process'){
  if(!['ADMIN','SALES','CLIENT'].includes(actor.role))throw Error('Không có quyền cập nhật Client Claim.');
  if(action==='claim_watchlist'){
   setClaimWatchlist('CLIENT',clientId,claimOrderIds(input.order_ids),input.active,reason,actor.id);
  }else{
   const id=Number(input.claim_id);
   if(!db.prepare('SELECT id FROM vnd_claims WHERE id=? AND client_id=?').get(id,clientId))throw Error('Claim không tồn tại.');
   if(db.prepare("SELECT id FROM vnd_refund_events WHERE claim_id=? AND kind='DECISION'").get(id))throw Error('Claim đã Complete.');
   addClaimProcessing('CLIENT',id,reason,input.evidence,actor.id);
  }
  return;
 }
 let claim:Row|undefined,approved:string|null=null,revision:number|null=null,category:string|null=null,ctx:string|null=null,bank:string|null=null,day:string|null=null,delta:string,kind:string;
 if(action==='claim_complete'||action==='claim_decide'){
  if(actor.role!=='ADMIN')throw Error('Chỉ Admin duyệt Claim.');
  claim=db.prepare('SELECT * FROM vnd_claims WHERE id=? AND client_id=?').get(Number(input.claim_id),clientId) as Row|undefined;
  if(!claim)throw Error('Claim không tồn tại.');
  const last=db.prepare("SELECT * FROM vnd_refund_events WHERE claim_id=? AND kind='DECISION' ORDER BY id DESC LIMIT 1").get(claim.id) as Row|undefined;
  if(action==='claim_complete'&&last)throw Error('Claim đã Complete; dùng sửa quyết định.');
  if(input.expected_revision!==Number(last?.revision??0))throw Error('Revision Claim đã thay đổi.');
  approved=amount(input.amount);revision=Number(last?.revision??0)+1;category=String(claim.category);
  // Preserve original goods/currency and current charged revenue at every decision; never invent FX or a cap.
  ctx=JSON.stringify({orders:context(JSON.parse(String(claim.orders_json)),clientId),evidence:claim.evidence,decision_evidence:text(input.evidence)});
  delta=subtractVnd(approved,String(last?.approved??'0'));kind='DECISION';
 }else{
  const recovery=['refund_recover','refund_recover_bank'].includes(action);
  if(recovery?!['ADMIN','FINANCE'].includes(actor.role):actor.role!=='FINANCE')throw Error('Không có quyền thực chi/thu hồi Refund.');
  if(!['refund_balance','refund_bank','refund_recover','refund_recover_bank'].includes(action))throw Error('Thao tác Refund không hợp lệ.');
  const n=amount(input.amount,true),pool=vndRefundBalance(clientId),limit=recovery?subtractVnd('0',pool):pool;
  if(compareVnd(n,limit)>0)throw Error('Số tiền vượt pool Refund được phép.');
  const wallet=action==='refund_balance'||action==='refund_recover';
  if(wallet&&recovery&&compareVnd(n,subtractVnd(vndBalance(clientId).balance,vndBalance(clientId).reserved))>0)throw Error('Balance thực sau reserve không đủ; không dùng Credit hoặc tạo Debt.');
  if(!wallet){
   day=validVndDay(input.executed_day);if(day>vndDay())throw Error('Chỉ ghi tiền đã thực hiện.');
   bank=JSON.stringify({reference:text(input.reference,500),source:text(input.source_account,500),destination:text(input.destination_account,500),proof:text(input.evidence)});
  }
  kind=action.slice(7).toUpperCase();delta=recovery?n:subtractVnd('0',n);
  if(wallet)db.prepare('INSERT INTO vnd_ledger(client_id,kind,delta,reason,actor_id,request_key) VALUES (?,?,?,?,?,?)').run(clientId,recovery?'CLAIM_RECOVERY':'CLAIM_REFUND',recovery?subtractVnd('0',n):n,reason,actor.id,key);
 }
 db.prepare('INSERT INTO vnd_refund_events(client_id,claim_id,kind,delta,approved,revision,category,context_json,bank_json,executed_day,reason,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(clientId,claim?.id??null,kind,delta,approved,revision,category,ctx,bank,day,reason,actor.id);
 const eventId=Number((db.prepare('SELECT last_insert_rowid() id').get() as {id:number}).id);
 const client=db.prepare('SELECT sales_user_id FROM users WHERE id=?').get(clientId) as {sales_user_id:number|null};
 for(const id of new Set([clientId,client.sales_user_id].filter((n):n is number=>typeof n==='number'&&n>0)))db.prepare('INSERT INTO vnd_claim_notifications(recipient_id,client_id,event_id) VALUES (?,?,?)').run(id,clientId,eventId);
 resumeVndPurchases(clientId,actor.id);
}

export function vndClaimNotifications(actor:AuthUser,clientId:number){
 vndAccess(actor,clientId);
 // Public financial facts only. No bank proof, decision context, cost, supplier or free-text reasons.
 return db.prepare(`SELECT n.id,e.claim_id,e.kind,e.delta,e.approved,e.revision,e.created_at,
 EXISTS(SELECT 1 FROM vnd_claim_reads r WHERE r.notification_id=n.id AND r.recipient_id=?) is_read
 FROM vnd_claim_notifications n JOIN vnd_refund_events e ON e.id=n.event_id
 WHERE n.recipient_id=? AND n.client_id=? ORDER BY n.id DESC LIMIT 100`).all(actor.id,actor.id,clientId);
}
export function acknowledgeVndClaim(actor:AuthUser,clientId:number,id:number){
 return db.transaction(()=>{
 vndAccess(actor,clientId);
 if(!Number.isSafeInteger(id)||!db.prepare('SELECT id FROM vnd_claim_notifications WHERE id=? AND recipient_id=? AND client_id=?').get(id,actor.id,clientId))throw Error('Không có quyền thông báo.');
 db.prepare('INSERT OR IGNORE INTO vnd_claim_reads(notification_id,recipient_id) VALUES (?,?)').run(id,actor.id);
 return {id};
 }).immediate();
}
