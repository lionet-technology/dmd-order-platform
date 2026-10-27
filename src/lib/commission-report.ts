import {db} from './db';
import './cases';
import {RefundService} from './refunds';
import type {AuthUser} from './auth';

type Category='NO_CLAIM'|'PENDING_CLAIM'|'CANCELLED'|'SHIPPING_INCIDENT'|'RECONCILIATION_ERROR'|'REVIEW';
type Order={id:number;sales_id:number|null;sales_name:string|null;purchase_month:string|null;workflow_status:string;sales_price:number;base_cost:number};
type Decision={id:number;claim_id:number;category:string;refund_cents:number;compensation_cents:number;created_at:string;month:string};
export type CommissionReportRow={sales_id:number|null;sales_name:string;category:Category;sales_revenue_cents:number;original_gp_base_cents:number;refund_cents:number;gp_base_less_refund_cents:number;order_ids:number[];claim_ids:number[]};
const category=(value:string):Category=>['PARAMETER_ADJUSTMENT','RECONCILIATION_ERROR'].includes(value)?'RECONCILIATION_ERROR':['LOST','DELAYED','SHIPPING_INCIDENT'].includes(value)?'SHIPPING_INCIDENT':'REVIEW';

/** Read-only payroll inputs. Never allocates Claim money to Orders or calculates commission. */
export function commissionMonthlyReport(actor:Pick<AuthUser,'role'>,month:string){
 if(!['ADMIN','FINANCE','BOD'].includes(actor.role))throw Error('Forbidden');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng phải có dạng YYYY-MM.');
 new RefundService(db);
 return db.transaction(()=>{
 const orders=db.prepare(`SELECT o.id,o.sales_user_id sales_id,COALESCE(o.sales,s.display_name) sales_name,
 substr(date(COALESCE(o.service_purchased_at,o.purchase_completed_at),'+7 hours'),1,7) purchase_month,
 o.workflow_status,o.sales_price,o.base_cost FROM orders o LEFT JOIN users s ON s.id=o.sales_user_id
 WHERE o.service_purchased_at IS NOT NULL OR o.purchase_completed_at IS NOT NULL`).all() as Order[];
 const byId=new Map(orders.map(o=>[o.id,o]));
 const links=db.prepare(`SELECT co.case_id,co.order_id,c.status FROM operation_case_orders co JOIN operation_cases c ON c.id=co.case_id WHERE c.kind='CLAIM' ORDER BY co.case_id,co.order_id`).all() as {case_id:number;order_id:number;status:string}[];
 const decisions=db.prepare(`SELECT id,claim_id,category,refund_cents,compensation_cents,created_at,substr(date(created_at,'+7 hours'),1,7) month FROM refund_events WHERE kind='CLAIM_DECISION' ORDER BY id`).all() as Decision[];
 const latest=new Map<number,Decision>();for(const d of decisions)latest.set(d.claim_id,d);
 const claimOrders=new Map<number,number[]>(),orderClaims=new Map<number,number[]>();
 for(const l of links){claimOrders.set(l.case_id,[...(claimOrders.get(l.case_id)??[]),l.order_id]);orderClaims.set(l.order_id,[...(orderClaims.get(l.order_id)??[]),l.case_id]);}
 const review:{claim_id:number;order_ids:number[];reason:string;refund_cents:number}[]=[];
 const attribution=new Map<number,{sales_id:number;category:Category;orders:Order[]}>();
 for(const [id,ids] of claimOrders){
  const sources=ids.map(i=>byId.get(i)),valid=sources.filter((o):o is Order=>!!o),d=latest.get(id);
  const owners=new Set(valid.map(o=>o.sales_id)),periods=new Set(valid.map(o=>o.purchase_month));
  const reason=valid.length!==ids.length?'Order chưa có kỳ mua':owners.size!==1||owners.has(null)?'Claim có nhiều Sales hoặc thiếu Sales':periods.size!==1||periods.has(null)?'Claim có nhiều kỳ mua hoặc thiếu kỳ':valid.some(o=>o.workflow_status==='CANCELLED')?'Claim liên quan Order huỷ; đối chiếu nguồn Refund':d&&category(d.category)==='REVIEW'?'Lý do Claim cần phân loại':null;
  if(reason){if(valid.some(o=>o.purchase_month===month)||decisions.some(e=>e.claim_id===id&&e.month===month))review.push({claim_id:id,order_ids:ids,reason,refund_cents:Number(d?.refund_cents??0)+Number(d?.compensation_cents??0)});continue;}
  attribution.set(id,{sales_id:valid[0].sales_id!,category:d?category(d.category):'PENDING_CLAIM',orders:valid});
 }
 const make=()=>new Map<string,CommissionReportRow>();
 const performance=make(),adjustments=make();
 const row=(map:ReturnType<typeof make>,sales:number|null,name:string|null,cat:Category)=>{
  const key=String(sales)+':'+cat;let r=map.get(key);
  if(!r){r={sales_id:sales,sales_name:name||'Chưa phân Sales',category:cat,sales_revenue_cents:0,original_gp_base_cents:0,refund_cents:0,gp_base_less_refund_cents:0,order_ids:[],claim_ids:[]};map.set(key,r);}return r;
 };
 const addOrder=(r:CommissionReportRow,o:Order)=>{if(r.order_ids.includes(o.id))return;r.order_ids.push(o.id);r.sales_revenue_cents+=Math.round(o.sales_price*100);r.original_gp_base_cents+=Math.round(o.sales_price*100)-Math.round(o.base_cost*100);};
 // Performance uses purchase cohort and original immutable commercial inputs.
 for(const o of orders.filter(o=>o.purchase_month===month)){
  const claims=orderClaims.get(o.id)??[],cats=new Set(claims.map(id=>attribution.get(id)?.category??'REVIEW'));
  const cat:Category=o.workflow_status==='CANCELLED'?'CANCELLED':!claims.length?'NO_CLAIM':cats.size===1?[...cats][0]:'REVIEW';
  const r=row(performance,o.sales_id,o.sales_name,cat);addOrder(r,o);r.claim_ids=[...new Set([...r.claim_ids,...claims])];
 }
 for(const [id,a] of attribution){
  const d=latest.get(id);if(!d||a.orders[0].purchase_month!==month)continue;
  const target=performance.get(String(a.sales_id)+':'+a.category);
  if(target&&a.orders.every(o=>target.order_ids.includes(o.id)))target.refund_cents+=d.refund_cents+d.compensation_cents;
  else review.push({claim_id:id,order_ids:a.orders.map(o=>o.id),reason:'Order có nhiều phân loại Claim; cần đối chiếu tổng',refund_cents:d.refund_cents+d.compensation_cents});
 }
 // Approved obligation revisions, including compensation, once per Claim event.
 // Actual payouts settle that obligation and are deliberately absent here.
 const previous=new Map<number,number>();
 for(const d of decisions){
  const total=d.refund_cents+d.compensation_cents,delta=total-(previous.get(d.claim_id)??0);previous.set(d.claim_id,total);
  if(d.month!==month)continue;
  const a=attribution.get(d.claim_id);if(!a)continue;
  // Category changes require an explicit review rather than reclassifying old adjustments.
  if(category(d.category)!==a.category){review.push({claim_id:d.claim_id,order_ids:a.orders.map(o=>o.id),reason:'Phân loại thay đổi giữa các lần duyệt; đối chiếu lịch sử',refund_cents:delta});continue;}
  const r=row(adjustments,a.sales_id,a.orders[0].sales_name,a.category);r.refund_cents+=delta;r.claim_ids=[...new Set([...r.claim_ids,d.claim_id])];for(const o of a.orders)addOrder(r,o);
 }
 // Cancellation credits have their own source; never count REFUND_ACTUAL again.
 const cancelled=db.prepare(`SELECT reference_id,ROUND(amount*100) cents,substr(date(created_at,'+7 hours'),1,7) month FROM ledger_entries WHERE entry_type='REFUND' AND direction='CREDIT' AND reference_type='ORDER_CANCELLATION'`).all() as {reference_id:string;cents:number;month:string}[];
 for(const e of cancelled){const o=byId.get(Number(e.reference_id));if(!o)continue;if(o.purchase_month===month){const p=performance.get(String(o.sales_id)+':CANCELLED');if(p)p.refund_cents+=e.cents;}if(e.month!==month)continue;const r=row(adjustments,o.sales_id,o.sales_name,'CANCELLED');addOrder(r,o);r.refund_cents+=e.cents;}
 const finish=(map:ReturnType<typeof make>)=>[...map.values()].map(r=>{const result={...r,gp_base_less_refund_cents:r.original_gp_base_cents-r.refund_cents};for(const n of [result.sales_revenue_cents,result.original_gp_base_cents,result.refund_cents,result.gp_base_less_refund_cents])if(!Number.isSafeInteger(n))throw Error('Report exceeds exact cents range');return result;});
 const legacy_claims=(db.prepare('SELECT DISTINCT case_id FROM claim_decisions').all() as {case_id:number}[]).map(c=>c.case_id).filter(id=>claimOrders.get(id)?.some(i=>byId.get(i)?.purchase_month===month));
 return {month,performance:finish(performance),refund_adjustments:finish(adjustments),attribution_review:review,legacy_claim_ids:legacy_claims,
 note:'Performance theo tháng mua; Refund điều chỉnh theo tháng ghi nhận duyệt/revision, không cộng payout lần hai. Hai bảng có thể cùng dẫn chiếu Order, không cộng Revenue/GP giữa hai bảng. Refund là tổng nghĩa vụ Claim gồm compensation, không chia Order/fee/tax. GP Base - Refund là số liệu tham khảo có thể âm, không phải hoa hồng. Cancelled không tính hoa hồng. Claim chưa có quyết định nằm riêng; Claim khác Sales/kỳ hoặc chưa rõ lý do cần đối chiếu. Dòng tiền thực chi xem báo cáo Refund Bank/Balance theo ngày thực hiện.'};
 }).deferred();
}
