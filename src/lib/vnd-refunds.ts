import {db} from './db';
import type {AuthUser} from './auth';
import {vndAccess,vndBalance,resumeVndPurchases} from './vnd-operational';
import {vnd,compareVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay,vndDay} from './vnd-debt';
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
 return {currency:'VND',refund_balance:vndRefundBalance(clientId),claims:(db.prepare('SELECT * FROM vnd_claims WHERE client_id=? ORDER BY id DESC').all(clientId) as Row[]).map(c=>({...c,decision_basis:context(JSON.parse(String(c.orders_json)),clientId)})),events:(db.prepare('SELECT * FROM vnd_refund_events WHERE client_id=? ORDER BY id DESC').all(clientId) as Row[]).map(r=>{const publicRow={...r};if(!privateBank)delete publicRow.bank_json;return publicRow;})};
}
/** Called only inside the serialized vndAction transaction/receipt. No automatic compensation formula. */
export function applyVndRefund(actor:AuthUser,clientId:number,input:Row,key:string,reason:string){
 const action=String(input.action);
 if(!reason)throw Error('Cần lý do.');
 if(action==='claim_create'){
  if(!['ADMIN','SALES','CLIENT'].includes(actor.role))throw Error('Không có quyền tạo Claim.');
  if(!['SHIPPING_ISSUE','FORCE_MAJEURE','RECONCILIATION_ERROR'].includes(String(input.category)))throw Error('Nhóm Claim không hợp lệ.');
  if(!Array.isArray(input.order_ids)||!input.order_ids.length||input.order_ids.length>200||input.order_ids.some(x=>!Number.isSafeInteger(x)||x<=0)||new Set(input.order_ids).size!==input.order_ids.length)throw Error('Danh sách Order không hợp lệ.');
  const ids=input.order_ids as number[];context(ids,clientId,true);
  db.prepare('INSERT INTO vnd_claims(client_id,category,orders_json,evidence,note,actor_id) VALUES (?,?,?,?,?,?)').run(clientId,input.category,JSON.stringify(ids),text(input.evidence),String(input.note??'').slice(0,2000),actor.id);
  return;
 }
 let claim:Row|undefined,approved:string|null=null,revision:number|null=null,category:string|null=null,ctx:string|null=null,bank:string|null=null,day:string|null=null,delta:string,kind:string;
 if(action==='claim_decide'){
  if(actor.role!=='ADMIN')throw Error('Chỉ Admin duyệt Claim.');
  claim=db.prepare('SELECT * FROM vnd_claims WHERE id=? AND client_id=?').get(Number(input.claim_id),clientId) as Row|undefined;
  if(!claim)throw Error('Claim không tồn tại.');
  const last=db.prepare("SELECT * FROM vnd_refund_events WHERE claim_id=? AND kind='DECISION' ORDER BY id DESC LIMIT 1").get(claim.id) as Row|undefined;
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
 resumeVndPurchases(clientId,actor.id);
}
