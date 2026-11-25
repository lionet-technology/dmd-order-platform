import {db} from './db';
import {addVnd, compareVnd, subtractVnd, sumVnd} from './vnd-money';

export function vndSupplierExposure(orderId:number,proposedDelta?:string){
 const accrued=db.prepare(`SELECT e.delta FROM vnd_supplier_ledger e JOIN vnd_supplier_costs c ON c.id=e.cost_id
  JOIN order_lots l ON l.id=c.lot_id WHERE e.kind='ACTUAL' AND l.order_id=?`).all(orderId) as {delta:string}[];
 const obligation=accrued.length||proposedDelta!==undefined
  ?addVnd(sumVnd(accrued.map(entry=>entry.delta)),proposedDelta??'0'):null;
 const revenue=obligation===null?null:recognizedOrderRevenue(orderId);
 return {revenue,obligation,loss:revenue!==null&&obligation!==null&&compareVnd(revenue,obligation)<0};
}

export function recognizedOrderRevenue(orderId:number){
 const entries=db.prepare(`SELECT kind,delta FROM vnd_ledger WHERE order_id=? AND
  kind IN ('ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX','CANCELLATION_REFUND')`).all(orderId) as {kind:string;delta:string}[];
 const claims=db.prepare(`SELECT e.context_json FROM vnd_claims c JOIN json_each(c.orders_json) j ON j.value=?
  JOIN vnd_refund_events e ON e.id=(SELECT id FROM vnd_refund_events WHERE claim_id=c.id AND kind='DECISION' ORDER BY id DESC LIMIT 1)
  WHERE c.client_id=(SELECT client_user_id FROM orders WHERE id=?) AND e.approved<>'0'`).all(orderId,orderId) as {context_json:string|null}[];
 const allocations=claims.map(claim=>{
  const snapshot=claim.context_json?JSON.parse(claim.context_json):null;
  return snapshot?.allocation_version===1?snapshot.allocation.find((a:{order_id:number})=>a.order_id===orderId)?.total_vnd:undefined;
 });
 return entries.some(entry=>entry.kind==='ORDER_CHARGE')&&allocations.every(value=>typeof value==='string')
  ?subtractVnd('0',sumVnd([...entries.map(entry=>entry.delta),...allocations])):null;
}
