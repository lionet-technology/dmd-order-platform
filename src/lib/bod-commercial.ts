import {db} from './db';
import './cases';
import './reconciliation';
import './order-refunds';
import {RefundService} from './refunds';
import type {AuthUser} from './auth';
export function bodCommercialOverview(actor:Pick<AuthUser,'role'>,month:string,months=6){
 if(![6,12].includes(months))throw Error('Chọn 6 hoặc 12 tháng.');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng phải có dạng YYYY-MM.');
 return db.transaction(()=>{
 const current=bodCommercialMonth(actor,month),[year,m]=month.split('-').map(Number);
 const series=Array.from({length:months+1},(_,i)=>{
 const d=new Date(Date.UTC(year,m-1-months+i,1)),key=d.toISOString().slice(0,7);
 return {month:key,...bodCommercialMonth(actor,key).total};
 });
 const previous=series.at(-2)!;
 const mom=(key:'revenue_cents'|'gp_base_cents'|'gp_net_finalized_cents')=>({delta_cents:current.total[key]-previous[key],percent:previous[key]===0?null:(current.total[key]-previous[key])/Math.abs(previous[key])*100});
 return {...current,months,previous_month:previous.month,trend:series.slice(1),mom:{revenue:mom('revenue_cents'),gp_base:mom('gp_base_cents'),gp_net:mom('gp_net_finalized_cents')}};
 }).deferred();
}
type R={id:number;client_id:number|null;sales_id:number|null;sales_name:string|null;client_name:string|null;service:string|null;sub_service:string|null;supplier:string|null;sales_price:number;base_cost:number;finalized_gp:number|null;finalized:number;estimated_gp:number|null;refunded:number};
export type Metric={key:string;label:string;orders:number;revenue_cents:number;gp_base_cents:number;gp_net_finalized_cents:number;finalized_orders:number;pending_orders:number;pending_estimated_gp_cents:number;pending_estimate_missing_orders:number;commission_gp_base_cents:number;refunded_orders:number};
export function bodCommercialMonth(actor:Pick<AuthUser,'role'>,month:string){
 if(!['BOD','FINANCE'].includes(actor.role))throw Error('Forbidden');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng phải có dạng YYYY-MM.');
 const [y,m]=month.split('-').map(Number),from=month+'-01',until=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
 return db.transaction(()=>{
  new RefundService(db);
  const rows=db.prepare(`SELECT o.id,o.client_user_id client_id,o.sales_user_id sales_id,COALESCE(o.sales,s.display_name) sales_name,
  COALESCE(c.display_name,o.customer,'Không rõ Client') client_name,o.service,o.sub_service,o.supplier,o.sales_price,o.base_cost,o.finalized_gp,o.estimated_gp,
  CASE WHEN EXISTS(SELECT 1 FROM operation_case_orders co JOIN refund_events e ON e.claim_id=co.case_id
    WHERE co.order_id=o.id AND e.kind='CLAIM_DECISION' AND e.obligation_cents>0
    AND e.id=(SELECT MAX(x.id) FROM refund_events x WHERE x.claim_id=e.claim_id AND x.kind='CLAIM_DECISION'))
    OR EXISTS(SELECT 1 FROM ledger_entries e WHERE e.entry_type='REFUND' AND e.direction='CREDIT'
    AND ((e.reference_type='ORDER_CANCELLATION' AND e.reference_id=CAST(o.id AS TEXT))
    OR (e.reference_type='CLAIM' AND EXISTS(SELECT 1 FROM operation_case_orders co WHERE co.order_id=o.id AND CAST(co.case_id AS TEXT)=e.reference_id)
    AND (NOT EXISTS(SELECT 1 FROM claim_refund_allocations a WHERE CAST(a.case_id AS TEXT)=e.reference_id) OR EXISTS(SELECT 1 FROM claim_refund_allocations a WHERE CAST(a.case_id AS TEXT)=e.reference_id AND a.order_id=o.id AND a.amount_cents>0))))) THEN 1 ELSE 0 END refunded,
  CASE WHEN o.margin_status='FINALIZED' AND o.actual_cost_coverage='COMPLETE' AND o.reconciliation_status='PASS' AND o.finalized_gp IS NOT NULL THEN 1 ELSE 0 END finalized
  FROM orders o LEFT JOIN users c ON c.id=o.client_user_id AND c.role='CLIENT'
  LEFT JOIN users s ON s.id=o.sales_user_id
  WHERE o.workflow_status!='CANCELLED' AND (o.service_purchased_at IS NOT NULL OR o.purchase_completed_at IS NOT NULL)
  AND date(COALESCE(o.service_purchased_at,o.purchase_completed_at),'+7 hours')>=?
  AND date(COALESCE(o.service_purchased_at,o.purchase_completed_at),'+7 hours')<? ORDER BY o.id`).all(from,until) as R[];
  const summarize=(group:(r:R)=>[string,string])=>{
   const groups=new Map<string,Metric>();
   for(const r of rows){
    const [key,label]=group(r);let t=groups.get(key);
    if(!t){t={key,label,orders:0,revenue_cents:0,gp_base_cents:0,gp_net_finalized_cents:0,finalized_orders:0,pending_orders:0,pending_estimated_gp_cents:0,pending_estimate_missing_orders:0,commission_gp_base_cents:0,refunded_orders:0};groups.set(key,t);}
    const revenue=Math.round(r.sales_price*100),base=Math.round(r.base_cost*100);
    t.orders++;t.revenue_cents+=revenue;t.gp_base_cents+=revenue-base;
    if(r.refunded)t.refunded_orders++;else t.commission_gp_base_cents+=revenue-base;
    if(r.finalized){t.finalized_orders++;t.gp_net_finalized_cents+=Math.round(Number(r.finalized_gp)*100);}
    else {t.pending_orders++;if(r.estimated_gp===null)t.pending_estimate_missing_orders++;else t.pending_estimated_gp_cents+=Math.round(r.estimated_gp*100);}
   }
   return [...groups.values()].sort((a,b)=>b.revenue_cents-a.revenue_cents||a.label.localeCompare(b.label));
  };
  const total=summarize(()=>['ALL','Tổng tháng'])[0]??{key:'ALL',label:'Tổng tháng',orders:0,revenue_cents:0,gp_base_cents:0,gp_net_finalized_cents:0,finalized_orders:0,pending_orders:0,pending_estimated_gp_cents:0,pending_estimate_missing_orders:0,commission_gp_base_cents:0,refunded_orders:0};
  return {month,total,
   by_sales:summarize(r=>[String(r.sales_id??'NONE'),r.sales_name||'Chưa phân Sales']),
   by_client:summarize(r=>[String(r.client_id??'NONE'),r.client_name||'Chưa xác định']),
   by_service_supplier:summarize(r=>[[r.service,r.sub_service,r.supplier].join('|'),[r.service,r.sub_service,r.supplier].filter(Boolean).join(' · ')||'Chưa xác định']),
   note:'Doanh thu giá bán theo sales_price Order và tháng mua; GP Base = sales_price - base_cost (không tính phụ phí/thuế); GP Net chỉ tính Order COMPLETE/PASS/finalized. Hoa hồng dùng GP Base đủ điều kiện: Order có nghĩa vụ Refund hiện hành hoặc Refund legacy bị loại một lần, không trừ lại khi chi Bank/Balance. Không gồm Add-on/Adjustment; GP Net pending không được coi là zero. Đây là cohort theo tháng mua, chưa phải snapshot tài chính chốt kỳ.'};
 }).deferred();
}
