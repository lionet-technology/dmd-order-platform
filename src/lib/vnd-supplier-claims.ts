import {db} from './db';
import type {AuthUser} from './auth';
import {vnd,compareVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay,vndDay} from './vnd-debt';
import {vndAccess} from './vnd-access';
import {addClaimProcessing,claimOrderIds,claimProcessing,claimWatchlist,setClaimWatchlist,supplierClaimOrders} from './vnd-claim-cases';
import {postRecoveryAllocation,selectRecoverySources} from './vnd-supplier-recovery-worklist';
type Row=Record<string,unknown>;
function required(v:unknown){const s=typeof v==='string'?v.trim():'';if(!s||s.length>2000)throw Error('Cần chứng từ/lý do hợp lệ.');return s;}
function amount(v:unknown,positive=false){if(typeof v!=='string')throw Error('Cần chuỗi VNĐ.');const n=vnd(v);if(compareVnd(n,'0')<(positive?1:0))throw Error('Số tiền không hợp lệ.');return n;}
export function supplierClaimState(claim:Row,throughDay?:string){
 const events=db.prepare("SELECT * FROM vnd_supplier_claim_events WHERE claim_id=? AND (? IS NULL OR substr(datetime(created_at,'+7 hours'),1,10)<=?) ORDER BY id").all(claim.id,throughDay??null,throughDay??null) as Row[];
 const decisions=events.filter(e=>['APPROVE','CORRECT'].includes(String(e.kind))),decision=decisions.at(-1);
 const active=events.filter(e=>['BANK','OFFSET'].includes(String(e.kind))&&!events.some(r=>r.kind==='REVERSE'&&r.settlement_id===e.id));
 const approved=decision?String(decision.approved):null,received=sumVnd(active.filter(e=>e.kind==='BANK').map(e=>String(e.amount))),offset=sumVnd(active.filter(e=>e.kind==='OFFSET').map(e=>String(e.amount))),settled=sumVnd([received,offset]),outstanding=approved===null?'0':subtractVnd(approved,settled);
 return {...claim,approved,decision_id:Number(decision?.id??0),received,offset,settled,outstanding,status:approved===null?'OPEN':outstanding==='0'?'CLOSED':settled==='0'?'APPROVED':'PARTIALLY_SETTLED',events};
}
export function supplierClaimView(supplier:string){
 const claims=(db.prepare('SELECT * FROM vnd_supplier_claims WHERE supplier=? ORDER BY id DESC').all(supplier) as Row[]).map(c=>{
  const state=supplierClaimState(c);
  return {...state,id:c.id,order_ids:supplierClaimOrders(c.lots_json),...claimProcessing('SUPPLIER',c.id,state.approved!==null),
   client_links:db.prepare('SELECT client_claim_id,reason,actor_id,created_at FROM vnd_claim_links WHERE supplier_claim_id=? ORDER BY client_claim_id').all(c.id)};
 });
 return {claims,watchlist:claimWatchlist('SUPPLIER',supplier,claims),receivable:sumVnd(claims.map(c=>c.outstanding))};
}
/** Runs within the Supplier action immediate transaction, after authorization and receipt lookup. */
export function applySupplierClaim(actor:AuthUser,supplier:string,input:Row,reason:string){
 const action=String(input.action);
 if(action==='claim_group_recovery'?actor.role!=='ADMIN':!['FINANCE','BOD'].includes(actor.role))
  throw Error('Admin gom Order; Finance/BOD xử lý quyết định Supplier Claim.');
 if(action==='claim_watchlist'){
  setClaimWatchlist('SUPPLIER',supplier,claimOrderIds(input.order_ids),input.active,reason,actor.id);
  return;
 }
 if(action==='claim_process'||action==='claim_link'){
  const claim=db.prepare('SELECT * FROM vnd_supplier_claims WHERE id=? AND supplier=?').get(Number(input.claim_id),supplier) as Row|undefined;
  if(!claim)throw Error('Không có Supplier Claim.');
  if(action==='claim_process'){
   if(supplierClaimState(claim).approved!==null)throw Error('Claim đã Complete.');
   addClaimProcessing('SUPPLIER',claim.id,reason,input.evidence,actor.id);
  }else{
   const client=db.prepare('SELECT id,client_id,orders_json FROM vnd_claims WHERE id=?').get(Number(input.client_claim_id)) as Row|undefined;
   if(!client)throw Error('Không có Client Claim.');
   vndAccess(actor,Number(client.client_id));
   const orderIds=JSON.parse(String(client.orders_json)) as number[];
   const shared=supplierClaimOrders(claim.lots_json).some(id=>orderIds.includes(id)&&db.prepare(
    'SELECT id FROM orders WHERE id=? AND client_user_id=? AND supplier=?'
   ).get(id,client.client_id,supplier));
   if(!shared)throw Error('Hai Claim cần có Order chung đúng phạm vi.');
   db.prepare('INSERT OR IGNORE INTO vnd_claim_links(client_claim_id,supplier_claim_id,reason,actor_id) VALUES (?,?,?,?)').run(client.id,claim.id,reason,actor.id);
  }
  return;
 }
 const reference=required(input.reference),evidence=required(input.evidence);
 // One reference identifies one real evidence transaction, including reversed/voided history.
 if(db.prepare('SELECT id FROM vnd_supplier_claims WHERE supplier=? AND lower(reference)=lower(?)').get(supplier,reference)||db.prepare('SELECT e.id FROM vnd_supplier_claim_events e JOIN vnd_supplier_claims c ON c.id=e.claim_id WHERE c.supplier=? AND lower(e.reference)=lower(?)').get(supplier,reference)||db.prepare('SELECT id FROM vnd_supplier_ledger WHERE supplier=? AND lower(reference)=lower(?)').get(supplier,reference))throw Error('Tham chiếu Supplier đã dùng.');
 if(action==='claim_group_recovery'){
  const sources=selectRecoverySources(supplier,input.sources);
  const lots=sources.map(source=>source.attempt.lot_id);
  const scope=sources.map(({attempt})=>({lot_id:attempt.lot_id,fulfillment_epoch:attempt.id,trackings:attempt.trackings}));
  const claimId=Number(db.prepare(`INSERT INTO vnd_supplier_claims(supplier,requested,lots_json,scope_json,reference,evidence,reason,actor_id)
   VALUES (?,?,?,?,?,?,?,?)`).run(supplier,amount(input.amount,true),JSON.stringify(lots),JSON.stringify(scope),reference,evidence,reason,actor.id).lastInsertRowid);
  const insert=db.prepare(`INSERT INTO vnd_supplier_recovery_sources(client_claim_id,order_id,decision_id,supplier_claim_id,lot_id,fulfillment_epoch,basis_json)
   VALUES (?,?,?,?,?,?,?)`);
  const link=db.prepare('INSERT OR IGNORE INTO vnd_claim_links(client_claim_id,supplier_claim_id,reason,actor_id) VALUES (?,?,?,?)');
  for(const {selection,basis} of sources){
   insert.run(selection.client_claim_id,selection.order_id,selection.decision_id,claimId,selection.lot_id,selection.epoch,JSON.stringify(basis));
   link.run(selection.client_claim_id,claimId,reason,actor.id);
  }
  return;
 }
 if(action==='claim_create'){
  let ids=input.lot_ids;
  if(input.order_ids!==undefined){
   if(ids!==undefined)throw Error('Chọn Order hoặc Lot.');
   const orders=claimOrderIds(input.order_ids);
   const lots=db.prepare('SELECT id FROM order_lots WHERE order_id=? ORDER BY id');
   ids=orders.flatMap(id=>{
    const rows=lots.all(id) as {id:number}[];
    if(!rows.length)throw Error('Order chưa có Lot Supplier.');
    return rows.map(row=>row.id);
   });
  }
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
  db.prepare('INSERT INTO vnd_supplier_claims(supplier,requested,lots_json,scope_json,reference,evidence,reason,actor_id) VALUES (?,?,?,?,?,?,?,?)').run(supplier,amount(input.amount,input.order_ids===undefined),JSON.stringify(ids),JSON.stringify(scope),reference,evidence,reason,actor.id);return;
 }
 const claim=db.prepare('SELECT * FROM vnd_supplier_claims WHERE id=? AND supplier=?').get(Number(input.claim_id),supplier) as Row|undefined;
 if(!claim)throw Error('Không có Supplier Claim.');
 const state=supplierClaimState(claim);
 if(input.expected_decision_id!==state.decision_id)throw Error('Quyết định đã thay đổi; tải lại.');
 let kind:string,n:string,approved:string|null=null,settlement:number|null=null,day:string|null=null,payable:string|null=null;
 if(['claim_complete','claim_approve','claim_correct'].includes(action)){
  const initial=action!=='claim_correct';
  if(initial?state.approved!==null:state.approved===null)throw Error('Trạng thái duyệt không hợp lệ.');
  n=amount(input.amount);if(compareVnd(n,String(claim.requested))>0||compareVnd(n,state.settled)<0)throw Error('Duyệt phải từ đã thu/offset đến số đề nghị.');
  if(n===state.approved)throw Error('Tổng duyệt không đổi.');
  approved=n;kind=initial?'APPROVE':'CORRECT';
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
 const event=db.prepare('INSERT INTO vnd_supplier_claim_events(claim_id,kind,amount,approved,settlement_id,reference,evidence,reason,executed_day,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(claim.id,kind,n,approved,settlement,reference,evidence,reason,day,actor.id);
 if(approved!==null)postRecoveryAllocation(Number(claim.id),Number(event.lastInsertRowid),approved);
 if(payable!==null)db.prepare('INSERT INTO vnd_supplier_ledger(supplier,kind,delta,reference,reason,actor_id) VALUES (?,?,?,?,?,?)').run(supplier,kind==='REVERSE'?'CLAIM_OFFSET_REVERSE':'CLAIM_OFFSET',payable,reference,reason,actor.id);
}
