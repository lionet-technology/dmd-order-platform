import {db} from './db';
import {subtractVnd,sumVnd,compareVnd,vnd} from './vnd-money';
type Row=Record<string,unknown>;
/** Manual inputs only: no commission rate, payout or inferred Claim allocation. */
export function vndCommissionInputs(orders:Row[]){
 const details=orders.map(o=>{
  const entries=db.prepare("SELECT kind,delta FROM vnd_ledger WHERE order_id=? AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION') ORDER BY id").all(o.id) as Row[];
  const charged=entries.some(e=>e.kind==='ORDER_CHARGE');
  const revenue=subtractVnd('0',sumVnd(entries.map(e=>String(e.delta))));
  const q=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(o.id) as Row|undefined;
  const quote=q?JSON.parse(String(q.snapshot_json)):null;
  const base=charged&&typeof quote?.base_vnd==='string'?vnd(quote.base_vnd):null;
  const signed=base===null?null:subtractVnd(revenue,base);
  const cancelled=o.status==='CANCELLED'||o.workflow_status==='CANCELLED';
  const attributed=Number.isInteger(o.sales_user_id)&&Number(o.sales_user_id)>0;
  const claim=db.prepare('SELECT c.category FROM vnd_claims c JOIN json_each(c.orders_json) j ON j.value=? WHERE c.client_id=? ORDER BY c.id LIMIT 1').get(o.id,o.client_user_id) as Row|undefined;
  const group=cancelled?'CANCELLATION':!charged?'UNCHARGED':!attributed?'ATTRIBUTION_REVIEW':signed===null?'MISSING_BASE':claim?'CLAIM_'+String(claim.category):'NON_CANCELLATION';
  return {order_id:Number(o.id),sales_user_id:attributed?Number(o.sales_user_id):null,client_id:Number(o.client_user_id),group,revenue,base_vnd:base,signed_gp_base:signed,
   gp_base_for_consideration:cancelled||!charged?'0':!attributed||signed===null?null:compareVnd(signed,'0')>0?signed:'0',
   cancellation_refund:sumVnd((db.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind='CANCELLATION_REFUND'").all(o.id) as Row[]).map(e=>String(e.delta)))};
 });
 const keys=[...new Set(details.map(o=>JSON.stringify([o.sales_user_id,o.group])))];
 const performance=keys.map(key=>{
  const rows=details.filter(o=>JSON.stringify([o.sales_user_id,o.group])===key),first=rows[0];
  return {sales_user_id:first.sales_user_id,group:first.group,orders:rows.length,revenue:sumVnd(rows.map(o=>o.revenue)),
   signed_gp_base:rows.some(o=>o.signed_gp_base===null)?null:sumVnd(rows.map(o=>o.signed_gp_base!)),
   gp_base_for_consideration:rows.some(o=>o.gp_base_for_consideration===null)?null:sumVnd(rows.map(o=>o.gp_base_for_consideration!)),
   cancellation_refund:sumVnd(rows.map(o=>o.cancellation_refund)),claim_refund:null,gp_base_minus_claim_refund:null};
 });
 return {status:'PARTIAL_CLIENT_POOL_NO_ALLOCATION',basis:'PURCHASE_MONTH_LIVE',performance,orders:details};
}
