import {db} from './db';
import type {AuthUser} from './auth';
import {vnd,compareVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay,vndDay} from './vnd-debt';
type Row=Record<string,unknown>;
function required(v:unknown){const s=typeof v==='string'?v.trim():'';if(!s||s.length>2000)throw Error('Cần chứng từ/lý do hợp lệ.');return s;}
function amount(v:unknown,positive=false){if(typeof v!=='string')throw Error('Cần chuỗi VNĐ.');const n=vnd(v);if(compareVnd(n,'0')<(positive?1:0))throw Error('Số tiền không hợp lệ.');return n;}
export function supplierClaimState(claim:Row){
 const events=db.prepare('SELECT * FROM vnd_supplier_claim_events WHERE claim_id=? ORDER BY id').all(claim.id) as Row[];
 const decisions=events.filter(e=>['APPROVE','CORRECT'].includes(String(e.kind))),decision=decisions.at(-1);
 const active=events.filter(e=>['BANK','OFFSET'].includes(String(e.kind))&&!events.some(r=>r.kind==='REVERSE'&&r.settlement_id===e.id));
 const approved=decision?String(decision.approved):null,received=sumVnd(active.filter(e=>e.kind==='BANK').map(e=>String(e.amount))),offset=sumVnd(active.filter(e=>e.kind==='OFFSET').map(e=>String(e.amount))),settled=sumVnd([received,offset]),outstanding=approved===null?'0':subtractVnd(approved,settled);
 return {...claim,approved,decision_id:Number(decision?.id??0),received,offset,settled,outstanding,status:approved===null?'OPEN':outstanding==='0'?'CLOSED':settled==='0'?'APPROVED':'PARTIALLY_SETTLED',events};
}
export function supplierClaimView(supplier:string){
 const claims=(db.prepare('SELECT * FROM vnd_supplier_claims WHERE supplier=? ORDER BY id DESC').all(supplier) as Row[]).map(supplierClaimState);
 return {claims,receivable:sumVnd(claims.map(c=>c.outstanding))};
}
/** Runs within the Supplier action immediate transaction, after authorization and receipt lookup. */
export function applySupplierClaim(actor:AuthUser,supplier:string,input:Row,reason:string){
 if(!['FINANCE','BOD'].includes(actor.role))throw Error('Supplier Claim cần Finance/BOD.');
 const action=String(input.action),reference=required(input.reference),evidence=required(input.evidence);
 // One reference identifies one real evidence transaction, including reversed/voided history.
 if(db.prepare('SELECT id FROM vnd_supplier_claims WHERE supplier=? AND lower(reference)=lower(?)').get(supplier,reference)||db.prepare('SELECT e.id FROM vnd_supplier_claim_events e JOIN vnd_supplier_claims c ON c.id=e.claim_id WHERE c.supplier=? AND lower(e.reference)=lower(?)').get(supplier,reference)||db.prepare('SELECT id FROM vnd_supplier_ledger WHERE supplier=? AND lower(reference)=lower(?)').get(supplier,reference))throw Error('Tham chiếu Supplier đã dùng.');
 if(action==='claim_create'){
  const ids=input.lot_ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(x=>!Number.isSafeInteger(x)||x<=0)||new Set(ids).size!==ids.length)throw Error('Cần danh sách Lot duy nhất.');
  const scope:Row[]=[];
  for(const id of ids){
   const lot=db.prepare("SELECT l.id FROM order_lots l JOIN orders o ON o.id=l.order_id JOIN vnd_purchase_requests r ON r.order_id=o.id WHERE l.id=? AND o.supplier=? AND r.status IN ('CHARGED','CANCELLED')").get(id,supplier);
   if(!lot)throw Error('Lot không thuộc Supplier VNĐ đã charge.');
   const trackings=db.prepare("SELECT id,tracking FROM order_trackings WHERE order_id=(SELECT order_id FROM order_lots WHERE id=?) AND lot_number=(SELECT lot_number FROM order_lots WHERE id=?) AND status='ACTIVE'").all(id,id) as Row[];
   if(!trackings.length)throw Error('Claim mới cần Tracking ACTIVE của Lot; lịch sử thay/hủy cần REVIEW.');
   scope.push({lot_id:id,trackings});
   const existing=db.prepare('SELECT lots_json FROM vnd_supplier_claims WHERE supplier=?').all(supplier) as Row[];
   if(existing.some(c=>(JSON.parse(String(c.lots_json)) as number[]).includes(id)))throw Error('Lot đã có Supplier Claim; dùng correction/reversal.');
  }
  db.prepare('INSERT INTO vnd_supplier_claims(supplier,requested,lots_json,scope_json,reference,evidence,reason,actor_id) VALUES (?,?,?,?,?,?,?,?)').run(supplier,amount(input.amount,true),JSON.stringify(ids),JSON.stringify(scope),reference,evidence,reason,actor.id);return;
 }
 const claim=db.prepare('SELECT * FROM vnd_supplier_claims WHERE id=? AND supplier=?').get(Number(input.claim_id),supplier) as Row|undefined;
 if(!claim)throw Error('Không có Supplier Claim.');
 const state=supplierClaimState(claim);
 if(input.expected_decision_id!==state.decision_id)throw Error('Quyết định đã thay đổi; tải lại.');
 let kind:string,n:string,approved:string|null=null,settlement:number|null=null,day:string|null=null,payable:string|null=null;
 if(action==='claim_approve'||action==='claim_correct'){
  if(action==='claim_approve'?state.approved!==null:state.approved===null)throw Error('Trạng thái duyệt không hợp lệ.');
  n=amount(input.amount);if(compareVnd(n,String(claim.requested))>0||compareVnd(n,state.settled)<0)throw Error('Duyệt phải từ đã thu/offset đến số đề nghị.');
  if(n===state.approved)throw Error('Tổng duyệt không đổi.');
  approved=n;kind=action==='claim_approve'?'APPROVE':'CORRECT';
 }else if(action==='claim_settle'){
  if(state.approved===null)throw Error('Chưa duyệt Claim.');
  n=amount(input.amount,true);if(compareVnd(n,state.outstanding)>0)throw Error('Vượt phải thu Supplier.');
  kind=String(input.settlement);if(!['BANK','OFFSET'].includes(kind))throw Error('Chọn Bank hoặc Offset.');
  if(kind==='BANK'){day=validVndDay(input.executed_day);if(day>vndDay())throw Error('Chỉ ghi tiền đã nhận.');}
  else payable=subtractVnd('0',n);
 }else if(action==='claim_reverse'){
  const original=state.events.find(e=>e.id===Number(input.settlement_id)&&['BANK','OFFSET'].includes(String(e.kind)));
  if(!original||state.events.some(e=>e.kind==='REVERSE'&&e.settlement_id===original.id))throw Error('Settlement không hợp lệ hoặc đã đảo.');
  kind='REVERSE';n=String(original.amount);settlement=Number(original.id);if(original.kind==='OFFSET')payable=n;
 }else throw Error('Supplier Claim action không hợp lệ.');
 db.prepare('INSERT INTO vnd_supplier_claim_events(claim_id,kind,amount,approved,settlement_id,reference,evidence,reason,executed_day,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(claim.id,kind,n,approved,settlement,reference,evidence,reason,day,actor.id);
 if(payable!==null)db.prepare('INSERT INTO vnd_supplier_ledger(supplier,kind,delta,reference,reason,actor_id) VALUES (?,?,?,?,?,?)').run(supplier,kind==='REVERSE'?'CLAIM_OFFSET_REVERSE':'CLAIM_OFFSET',payable,reference,reason,actor.id);
}
