import {db} from './db';
import {shippingChargeCents} from './credit';
db.exec(`CREATE TABLE IF NOT EXISTS claim_refund_allocations(case_id INTEGER NOT NULL REFERENCES operation_cases(id),order_id INTEGER NOT NULL REFERENCES orders(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),PRIMARY KEY(case_id,order_id))`);
export function orderChargedCents(orderId:number){
 const extra=Number((db.prepare("SELECT COALESCE(SUM(ROUND(amount*100)),0) n FROM ledger_entries WHERE direction='DEBIT' AND entry_type='ADDITIONAL_FEE' AND ((reference_type='LOT_RECONCILIATION' AND reference_id IN (SELECT CAST(id AS TEXT) FROM order_lots WHERE order_id=?)) OR (reference_type='ORDER' AND reference_id=?))").get(orderId,String(orderId)) as {n:number}).n);
 return shippingChargeCents([orderId])+extra;
}
export function orderRefundedCents(orderId:number){
 // Legacy claims without allocations remain conservative; never invent historical splits.
 return Number((db.prepare(`SELECT COALESCE(SUM(CASE WHEN e.reference_type='CLAIM' AND EXISTS(SELECT 1 FROM claim_refund_allocations a WHERE CAST(a.case_id AS TEXT)=e.reference_id) THEN COALESCE((SELECT a.amount_cents FROM claim_refund_allocations a WHERE CAST(a.case_id AS TEXT)=e.reference_id AND a.order_id=?),0) ELSE ROUND(e.amount*100) END),0) n FROM ledger_entries e WHERE e.direction='CREDIT' AND e.entry_type='REFUND' AND ((e.reference_type='ORDER_CANCELLATION' AND e.reference_id=?) OR (e.reference_type='CLAIM' AND EXISTS(SELECT 1 FROM operation_case_orders co WHERE CAST(co.case_id AS TEXT)=e.reference_id AND co.order_id=?)))`).get(orderId,String(orderId),orderId) as {n:number}).n);
}
