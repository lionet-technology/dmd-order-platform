import "./order-cancellation";
import {deadline,slaState} from "./sla";
import {db} from "./db";
import type {AuthUser} from "./auth";
import {casesFor} from "./cases";
import {accountFinancials,localDay,shiftDay} from "./credit";
import {inboundFor} from "./inbound";
import {recoveriesFor} from "./claims";
type Row=Record<string,unknown>;
export function controlTower(user:AuthUser){
 const today=localDay(),cases=casesFor(user),open=cases.filter(c=>!['RESOLVED','CLOSED'].includes(String(c.status)));
 const clientIds=(db.prepare("SELECT id FROM users WHERE role='CLIENT' AND (?='ADMIN' OR (?='SALES' AND sales_user_id=?) OR (?='CLIENT' AND id=?))").all(user.role,user.role,user.id,user.role,user.id) as {id:number}[]).map(c=>c.id);
 const accounts=clientIds.map(id=>({client_id:id,...accountFinancials(id)}));
 const inbound=user.role==='CLIENT'?{parcels:[],adjustments:[]}:inboundFor(user);
 const recoveries=user.role==='ADMIN'?recoveriesFor(user) as Row[]:[];
 const failed=db.prepare("SELECT r.order_id,r.updated_at FROM purchase_reserves r JOIN orders o ON o.id=r.order_id WHERE r.status='FAILED' AND (?='ADMIN' OR o.client_user_id=? OR (?='SALES' AND o.client_user_id IN (SELECT id FROM users WHERE sales_user_id=?)))").all(user.role,user.id,user.role,user.id).map(row=>{const r=row as Row;const due=deadline('PURCHASE_FAILED',r.updated_at);return {...r,due_date:due,sla_status:slaState(due)};});
 const cancellation=user.role==='ADMIN'?db.prepare("SELECT order_id,created_at FROM cancellation_requests WHERE status='PENDING'").all():[];
 const queues={cancellation_approval:cancellation,purchase_failed:failed,holds:open.filter(c=>c.kind==='HOLD'),cases_due:open.filter(c=>['NEAR_DUE','OVERDUE'].includes(String(c.sla_status))),claims_overdue:open.filter(c=>c.kind==='CLAIM'&&c.first_response_sla_status==='OVERDUE'),claim_follow_up:open.filter(c=>c.kind==='CLAIM'&&(c.hold_requested||['OVERDUE','NEAR_DUE'].includes(String(c.sla_status)))),weight_adjustments:inbound.adjustments.filter(a=>a.status==='PENDING_APPROVAL'),unidentified:inbound.parcels.filter(p=>p.status==='UNIDENTIFIED'),accounts_overdue:accounts.filter(a=>a.reasons.includes('Công nợ quá hạn')).map(a=>({client_id:a.client_id})),supplier_waiting:recoveries.filter(r=>['OPEN','SUBMITTED','WAITING_SUPPLIER','PARTIALLY_RECOVERED'].includes(String(r.status)))};
 const money={balance_cents:accounts.reduce((s,a)=>s+a.balance_cents,0),reserved_cents:accounts.reduce((s,a)=>s+a.reserved_cents,0),receivable_cents:accounts.reduce((s,a)=>s+[...a.debts,...a.statements].reduce((n,r)=>n+r.outstanding_cents,0),0)};
 let adminMetrics:Row={};if(user.role==='ADMIN'){
 const paid=Number((db.prepare("SELECT COALESCE(SUM(refund_cents+compensation_cents),0) n FROM claim_decisions").get() as {n:number}).n),recovered=recoveries.reduce((s,r)=>s+Number(r.recovered_cents),0);
 const orders=db.prepare("SELECT o.*,COALESCE(o.purchase_completed_at,r.updated_at,o.service_purchased_at,o.created_at) purchased_at FROM orders o LEFT JOIN purchase_reserves r ON r.order_id=o.id AND r.status='CHARGED' WHERE o.client_user_id IS NOT NULL AND (o.purchase_completed_at IS NOT NULL OR o.workflow_status='PURCHASED' OR r.status='CHARGED') AND o.workflow_status!='CANCELLED'").all() as Row[];
 const first=new Map<number,string>();for(const o of orders){const day=String(o.purchased_at).slice(0,10),id=Number(o.client_user_id);if(!first.has(id)||day<first.get(id)!)first.set(id,day);}
 const windowStart=shiftDay(today,-29),eligible=[...first.entries()].filter(([,day])=>day<=shiftDay(today,-60));
 const recent=orders.filter(o=>String(o.purchased_at).slice(0,10)>=windowStart&&String(o.purchased_at).slice(0,10)<=today);
 const companyRevenue=recent.reduce((s,o)=>s+Number(o.sales_price||0),0),companyProfit=recent.reduce((s,o)=>s+Number(o.gross_profit_net||0),0),companyMargin=companyRevenue?companyProfit/companyRevenue:null;
 const cohorts=new Map<string,{month:string;revenue:number;qualified_revenue:number;matured_clients:number}>();
 for(const [client,day] of eligible){const month=day.slice(0,7),cohort=cohorts.get(month)||{month,revenue:0,qualified_revenue:0,matured_clients:0};const group=recent.filter(o=>Number(o.client_user_id)===client),r=group.reduce((s,o)=>s+Number(o.sales_price||0),0),gp=group.reduce((s,o)=>s+Number(o.gross_profit_net||0),0);cohort.revenue+=r;cohort.matured_clients++;if(r>0&&companyMargin!==null&&gp/r>=companyMargin)cohort.qualified_revenue+=r;cohorts.set(month,cohort);}
 const revenue=[...cohorts.values()].reduce((s,c)=>s+c.revenue,0),qualified=[...cohorts.values()].reduce((s,c)=>s+c.qualified_revenue,0);
 adminMetrics={client_claim_paid_cents:paid,supplier_recovered_cents:recovered,net_claim_loss_cents:paid-recovered,new_client_quality:{company_margin_percent:companyMargin===null?null:companyMargin*100,target_revenue_share:0.2,observation_days:60,rolling_days:30,revenue,qualified_revenue:qualified,revenue_share:revenue?qualified/revenue:null,cohorts:[...cohorts.values()].map(c=>({...c,revenue_share:c.revenue?c.qualified_revenue/c.revenue:null,target_met:c.revenue?c.qualified_revenue/c.revenue>=0.2:null}))}};
 }
 return {as_of:today,queues,counts:Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,v.length])),money,...adminMetrics};
}
