import {db} from './db';
import type {AuthUser} from './auth';
type R={id:number;client_id:number|null;sales_id:number|null;sales_name:string|null;client_name:string|null;service:string|null;sub_service:string|null;supplier:string|null;sales_price:number;base_cost:number;finalized_gp:number|null;finalized:number};
type Metric={key:string;label:string;orders:number;revenue_cents:number;gp_base_cents:number;gp_net_finalized_cents:number;finalized_orders:number;pending_orders:number};
export function bodCommercialMonth(actor:Pick<AuthUser,'role'>,month:string){
 if(!['BOD','FINANCE'].includes(actor.role))throw Error('Forbidden');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng phải có dạng YYYY-MM.');
 const [y,m]=month.split('-').map(Number),from=month+'-01',until=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
 return db.transaction(()=>{
  const rows=db.prepare(`SELECT o.id,o.client_user_id client_id,COALESCE(c.sales_user_id,o.sales_user_id) sales_id,s.display_name sales_name,
  COALESCE(c.display_name,o.customer,'Không rõ Client') client_name,o.service,o.sub_service,o.supplier,o.sales_price,o.base_cost,o.finalized_gp,
  CASE WHEN o.margin_status='FINALIZED' AND o.actual_cost_coverage='COMPLETE' AND o.reconciliation_status='PASS' AND o.finalized_gp IS NOT NULL THEN 1 ELSE 0 END finalized
  FROM orders o LEFT JOIN users c ON c.id=o.client_user_id AND c.role='CLIENT'
  LEFT JOIN users s ON s.id=COALESCE(c.sales_user_id,o.sales_user_id)
  WHERE o.workflow_status!='CANCELLED' AND (o.service_purchased_at IS NOT NULL OR o.purchase_completed_at IS NOT NULL)
  AND date(COALESCE(o.service_purchased_at,o.purchase_completed_at),'+7 hours')>=?
  AND date(COALESCE(o.service_purchased_at,o.purchase_completed_at),'+7 hours')<? ORDER BY o.id`).all(from,until) as R[];
  const summarize=(group:(r:R)=>[string,string])=>{
   const groups=new Map<string,Metric>();
   for(const r of rows){
    const [key,label]=group(r);let t=groups.get(key);
    if(!t){t={key,label,orders:0,revenue_cents:0,gp_base_cents:0,gp_net_finalized_cents:0,finalized_orders:0,pending_orders:0};groups.set(key,t);}
    const revenue=Math.round(r.sales_price*100),base=Math.round(r.base_cost*100);
    t.orders++;t.revenue_cents+=revenue;t.gp_base_cents+=revenue-base;
    if(r.finalized){t.finalized_orders++;t.gp_net_finalized_cents+=Math.round(Number(r.finalized_gp)*100);}
    else t.pending_orders++;
   }
   return [...groups.values()].sort((a,b)=>b.revenue_cents-a.revenue_cents||a.label.localeCompare(b.label));
  };
  const total=summarize(()=>['ALL','Tổng tháng'])[0]??{key:'ALL',label:'Tổng tháng',orders:0,revenue_cents:0,gp_base_cents:0,gp_net_finalized_cents:0,finalized_orders:0,pending_orders:0};
  return {month,total,
   by_sales:summarize(r=>[String(r.sales_id??'NONE'),r.sales_name||'Chưa phân Sales']),
   by_client:summarize(r=>[String(r.client_id??'NONE'),r.client_name||'Chưa xác định']),
   by_service_supplier:summarize(r=>[[r.service,r.sub_service,r.supplier].join('|'),[r.service,r.sub_service,r.supplier].filter(Boolean).join(' · ')||'Chưa xác định']),
   note:'Doanh thu giá bán theo sales_price Order và tháng mua; GP Base = sales_price - base_cost (không tính phụ phí/thuế); GP Net chỉ tính Order COMPLETE/PASS/finalized. Không gồm Add-on, Refund/Adjustment; GP Net pending không được coi là zero. Đây là cohort theo tháng mua, chưa phải snapshot tài chính chốt kỳ.'};
 }).deferred();
}
