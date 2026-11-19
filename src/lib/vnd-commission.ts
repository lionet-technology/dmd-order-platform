import {db} from './db';
import {subtractVnd,sumVnd,compareVnd,vnd,addVnd,multiplyVnd} from './vnd-money';
type Row=Record<string,unknown>;
type Allocation = {order_id:number;selling_vnd:string;surcharge_vnd:string;tax_vnd:string;compensation_vnd:string;total_vnd:string};
/** Reference formula approved in Owner continuation 17/11; never a payout or pool allocation. */
export function vndCommissionInputs(orders:Row[]){
 const details=orders.map(o=>{
  const entries=db.prepare("SELECT kind,delta FROM vnd_ledger WHERE order_id=? AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX') ORDER BY id").all(o.id) as Row[];
  const charged=entries.some(e=>e.kind==='ORDER_CHARGE');
  const revenue=subtractVnd('0',sumVnd(entries.filter(e=>e.kind==='ORDER_CHARGE'||e.kind==='ORDER_CORRECTION').map(e=>String(e.delta))));
  const q=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(o.id) as Row|undefined;
  const quote=q?JSON.parse(String(q.snapshot_json)):null;
  const base=charged&&typeof quote?.base_vnd==='string'?vnd(quote.base_vnd):null;
  const signed=base===null?null:subtractVnd(revenue,base);
  const cancelled=o.status==='CANCELLED'||o.workflow_status==='CANCELLED';
  const attributed=Number.isInteger(o.sales_user_id)&&Number(o.sales_user_id)>0;
  const claims=db.prepare('SELECT c.id,c.category,e.approved,e.context_json FROM vnd_claims c JOIN json_each(c.orders_json) j ON j.value=? LEFT JOIN vnd_refund_events e ON e.id=(SELECT d.id FROM vnd_refund_events d WHERE d.claim_id=c.id AND d.kind=\'DECISION\' ORDER BY d.id DESC LIMIT 1) WHERE c.client_id=? ORDER BY c.id').all(o.id,o.client_user_id) as Row[];
  const approvedClaims=claims.filter(c=>c.approved!==null&&compareVnd(String(c.approved),'0')>0);
  const allocation = approvedClaims.map(c => {
   const snapshot = c.context_json ? JSON.parse(String(c.context_json)) : null;
   return snapshot?.allocation_version === 1
    ? (snapshot.allocation as Allocation[]).find(entry => entry.order_id === o.id) : undefined;
  });
  const unallocated = allocation.some(entry => entry === undefined);
  const applied = allocation.filter((entry): entry is Allocation => entry !== undefined);
  const totalRefund = sumVnd(applied.map(entry => entry.total_vnd));
  const freightRefund = sumVnd(applied.flatMap(entry => [entry.selling_vnd, entry.compensation_vnd]));
  const salesAfterRefund = subtractVnd(revenue, freightRefund);
  const baseAfterRefund = base === null ? null : subtractVnd(salesAfterRefund, base);
  const commissionAfterRefund = cancelled || !charged ? '0' :
   unallocated || !attributed || baseAfterRefund === null ? null :
   compareVnd(baseAfterRefund, '0') > 0 && compareVnd(salesAfterRefund, '0') > 0
    ? addVnd(multiplyVnd(salesAfterRefund, '0.001'), multiplyVnd(baseAfterRefund, '0.12')) : '0';
  const categories=[...new Set(approvedClaims.map(c=>String(c.category)))];
  const claim=categories.length===1?categories[0]:categories.length>1?'MULTIPLE_CATEGORIES':null;
  const formula=cancelled||!charged?'0':!attributed||signed===null?null:compareVnd(signed,'0')>0?addVnd(multiplyVnd(revenue,'0.001'),multiplyVnd(signed,'0.12')):'0';
  const group=cancelled?'CANCELLATION':!charged?'UNCHARGED':!attributed?'ATTRIBUTION_REVIEW':signed===null?'MISSING_BASE':claim?'CLAIM_'+claim:'NON_CANCELLATION';
  return {commission_reference:formula,live_after_refund:{
   allocated_refund_vnd:totalRefund, incomplete:unallocated,
   net_revenue_vnd:unallocated?null:subtractVnd(subtractVnd('0',sumVnd(entries.map(e=>String(e.delta)))),totalRefund),
   freight_sales_vnd:unallocated?null:salesAfterRefund,
   gp_base_vnd:unallocated?null:baseAfterRefund, commission_vnd:commissionAfterRefund,
  },claim_ids:claims.map(c=>c.id),approved_claim_ids:approvedClaims.map(c=>c.id),legacy_claim_ids:approvedClaims.filter((_,i)=>allocation[i]===undefined).map(c=>c.id),refund_review_required:unallocated,order_id:Number(o.id),sales_user_id:attributed?Number(o.sales_user_id):null,client_id:Number(o.client_user_id),group,revenue,base_vnd:base,signed_gp_base:signed,
   gp_base_for_consideration:cancelled||!charged?'0':!attributed||signed===null?null:compareVnd(signed,'0')>0?signed:'0',
   cancellation_refund:sumVnd((db.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind='CANCELLATION_REFUND'").all(o.id) as Row[]).map(e=>String(e.delta)))};
 });
 const keys=[...new Set(details.map(o=>JSON.stringify([o.sales_user_id,o.group])))];
 const unallocated = new Map<number, { claim_id: number; order_ids: number[]; approved_vnd: string }>();
 const performance=keys.map(key=>{
  const rows=details.filter(o=>JSON.stringify([o.sales_user_id,o.group])===key),first=rows[0];
  const claimIds=[...new Set(rows.flatMap(o=>o.legacy_claim_ids))];
  const allocatedRefund=sumVnd(rows.map(o=>o.live_after_refund.allocated_refund_vnd));
  let claimRefund:string|null=allocatedRefund;
  for(const id of claimIds){
   const c=db.prepare('SELECT orders_json FROM vnd_claims WHERE id=?').get(id) as Row;
   const ids=JSON.parse(String(c.orders_json)) as number[];
   const decision=db.prepare("SELECT approved FROM vnd_refund_events WHERE claim_id=? AND kind='DECISION' ORDER BY id DESC LIMIT 1").get(id) as Row;
   const approved = String(decision.approved);
   if (ids.some(orderId => !rows.some(order => order.order_id === orderId))) {
    unallocated.set(Number(id), { claim_id: Number(id), order_ids: ids, approved_vnd: approved });
    claimRefund = null;
   } else if (claimRefund !== null) {
    claimRefund = addVnd(claimRefund, approved);
   }
  }
  const signedTotal=rows.some(o=>o.signed_gp_base===null)?null:sumVnd(rows.map(o=>o.signed_gp_base!));
  return {sales_user_id:first.sales_user_id,group:first.group,orders:rows.length,revenue:sumVnd(rows.map(o=>o.revenue)),
   signed_gp_base:rows.some(o=>o.signed_gp_base===null)?null:sumVnd(rows.map(o=>o.signed_gp_base!)),
   gp_base_for_consideration:rows.some(o=>o.gp_base_for_consideration===null)?null:sumVnd(rows.map(o=>o.gp_base_for_consideration!)),
   commission_reference:rows.some(o=>o.commission_reference===null)?null:sumVnd(rows.map(o=>o.commission_reference!)),refund_review_required:rows.some(o=>o.refund_review_required),cancellation_refund:sumVnd(rows.map(o=>o.cancellation_refund)),claim_refund:claimRefund,gp_base_minus_claim_refund:claimRefund===null||signedTotal===null?null:subtractVnd(signedTotal,claimRefund),claim_refund_status:claimRefund===null?'UNALLOCATED_CROSS_COHORT_OR_GROUP':claimIds.length?'WHOLE_CLAIM_SAME_COHORT_GROUP':compareVnd(allocatedRefund,'0')>0?'ALLOCATED_BY_ORDER':'NO_APPROVED_CLAIMS'};
 });
 return {status:'PARTIAL_CLIENT_POOL_NO_ALLOCATION',basis:'PURCHASE_MONTH_LIVE',formula:'sales>base ? 0.001*sales+0.12*max(sales-base,0) : 0; cancelled=0',formula_version:'OWNER_CONTINUATION_2026_11_17_REFERENCE_ONLY',performance,unallocated_claims:[...unallocated.values()].sort((a,b)=>a.claim_id-b.claim_id),orders:details};
}
