import {db} from './db';
import {approvedFulfillment,lotFulfillments} from './vnd-fulfillment';
import {vndCommissionInputs} from './vnd-commission';
import {addVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay} from './vnd-debt';
import {recognizedOrderRevenue} from './vnd-supplier-exposure';
import {approvedRecoveryForOrder,supplierRecoveryMovements} from './vnd-supplier-recovery-worklist';
type Row=Record<string,unknown>;
/** Performance uses Order purchase time; cash uses immutable posting time. */
export function vndBusinessReport(month:string){
 return db.transaction(()=>readReport(month)).deferred();
}
function readReport(month:string){
 if(!/^[0-9]{4}-[0-9]{2}$/.test(month))throw Error('Chọn tháng YYYY-MM.');
 validVndDay(month+'-01');
 const orders=db.prepare("SELECT o.*,r.status,r.offer FROM orders o JOIN vnd_purchase_requests r ON r.order_id=o.id WHERE substr(datetime(o.service_purchased_at,'+7 hours'),1,7)=?").all(month) as Row[];
 const groups=new Map<string,{service:string;sub_service:string;client_id:number;sales_user_id:unknown;orders:number;revenue:string;freight_revenue:string;surcharge_revenue:string;estimated_net:string;estimated_base:string;cancelled:number;actual_cost_status:string;missing_estimate:boolean;refunds:string;supplier:string}>();
 for(const o of orders){
  const key=[o.service,o.sub_service,o.client_user_id,o.sales_user_id,o.supplier].join(':');
  const group=groups.get(key)??{service:String(o.service),sub_service:String(o.sub_service),client_id:Number(o.client_user_id),sales_user_id:o.sales_user_id,orders:0,revenue:'0',freight_revenue:'0',surcharge_revenue:'0',estimated_net:'0',estimated_base:'0',cancelled:0,actual_cost_status:'NOT_RECONCILED',missing_estimate:false,refunds:'0',supplier:String(o.supplier)};
  group.orders++;if(o.status==='CANCELLED')group.cancelled++;
  const entries=db.prepare("SELECT * FROM vnd_ledger WHERE order_id=? AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION','ORDER_SURCHARGE','ORDER_TAX')").all(o.id) as Row[];
  group.revenue=addVnd(group.revenue,subtractVnd('0',sumVnd(entries.map(e=>String(e.delta)))));
  group.freight_revenue=addVnd(group.freight_revenue,subtractVnd('0',sumVnd(entries.filter(e=>['ORDER_CHARGE','ORDER_CORRECTION'].includes(String(e.kind))).map(e=>String(e.delta)))));
  group.surcharge_revenue=addVnd(group.surcharge_revenue,subtractVnd('0',sumVnd(entries.filter(e=>e.kind==='ORDER_SURCHARGE').map(e=>String(e.delta)))));
  const q=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(o.id) as Row|undefined;
  if(!q&&entries.length)group.missing_estimate=true;
  group.refunds=addVnd(group.refunds,sumVnd((db.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind='CANCELLATION_REFUND'").all(o.id) as Row[]).map(e=>String(e.delta))));
  if(q&&entries.length){const quote=JSON.parse(String(q.snapshot_json));if(typeof quote.net_vnd!=='string'||typeof quote.base_vnd!=='string')group.missing_estimate=true;group.estimated_net=addVnd(group.estimated_net,quote.net_vnd??'0');group.estimated_base=addVnd(group.estimated_base,quote.base_vnd??'0');}
  groups.set(key,group);
 }
 const actuals=orders.map(o=>{const lots=db.prepare(`SELECT l.id FROM order_lots l WHERE l.order_id=? AND (
  EXISTS (SELECT 1 FROM order_cartons c WHERE c.order_lot_id=l.id)
  OR EXISTS (SELECT 1 FROM vnd_supplier_costs s WHERE s.lot_id=l.id)
 )`).all(o.id) as {id:number}[];const costs=lots.map(l=>{
  const history=lotFulfillments(l.id);
  if(!history||history.incomplete)return null;
  const actual=history.attempts.map(a=>approvedFulfillment(l.id,a.supplier,a.id));
  if(actual.some(a=>a.uncertain)||!actual.at(-1)?.approved)return null;
  return sumVnd(actual.flatMap(a=>a.approved?[String(a.approved.amount)]:[]));
 });const complete=lots.length>0&&costs.every(c=>c!==null);return {order_id:Number(o.id),actual_net:complete?sumVnd(costs.map(String)):null,status:complete?'APPROVED_TOTAL':'MISSING_ACTUAL',coverage:String(o.service)==='ePacket'&&['Standard','Eco'].includes(String(o.sub_service))?'WORKBOOK_INCLUSIVE_MID_LAST_MILE':'TOTAL',component_breakdown:String(o.service)==='ePacket'&&['Standard','Eco'].includes(String(o.sub_service))?'DEFERRED':'NOT_SPECIFIED'};});
 const decisionRows=db.prepare("SELECT category,delta,context_json FROM vnd_refund_events WHERE kind='DECISION' AND substr(datetime(created_at,'+7 hours'),1,7)=?").all(month) as Row[];
 const decisions=new Map<string,{sales_user_id:number|null;category:string;delta:string}>();
 for(const d of decisionRows){const ids=[...new Set((JSON.parse(String(d.context_json)).orders as Row[]).map(o=>o.sales_user_id))];const sales=ids.length===1&&Number(ids[0])>0?Number(ids[0]):null;const k=String(sales)+':'+d.category;const g=decisions.get(k)??{sales_user_id:sales,category:String(d.category),delta:'0'};g.delta=addVnd(g.delta,String(d.delta));decisions.set(k,g);}
 const profitability=actuals.map(actual=>{
  const revenue=recognizedOrderRevenue(actual.order_id);
  const recovery=approvedRecoveryForOrder(actual.order_id);
  const cost=actual.actual_net===null?null:subtractVnd(actual.actual_net,recovery);
  return {order_id:actual.order_id,recognized_revenue:revenue,approved_supplier_recovery:recovery,
   recognized_cost:cost,gp_net:revenue===null||cost===null?null:subtractVnd(revenue,cost)};
 });
 const cash=db.prepare("SELECT l.* FROM vnd_ledger l WHERE substr(datetime(l.created_at,'+7 hours'),1,7)=?").all(month) as Row[];
 return {currency:'VND',month,order_profitability:profitability,supplier_recovery_movements:supplierRecoveryMovements(month),commission:vndCommissionInputs(orders),performance:[...groups.values()].map(g=>({...g,estimated_gp_net:g.missing_estimate?null:subtractVnd(g.revenue,g.estimated_net),signed_gp_base:g.missing_estimate?null:subtractVnd(g.freight_revenue,g.estimated_base)})),cash_flow:[...new Set(cash.map(e=>String(e.kind)))].map(kind=>({kind,delta:sumVnd(cash.filter(e=>e.kind===kind).map(e=>String(e.delta)))})),addon_revenue:subtractVnd('0',sumVnd(cash.filter(e=>['ADDON_REVENUE','ADDON_CORRECTION'].includes(String(e.kind))).map(e=>String(e.delta)))),actual_gp:null,actual_gp_status:'USE_ORDER_RECONCILIATION_NO_POOL_ALLOCATION',gp_reconciliation:orders.map(o=>{const actual=actuals.find(a=>a.order_id===Number(o.id))!;const freight=subtractVnd('0',sumVnd((db.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION')").all(o.id) as Row[]).map(e=>String(e.delta))));const surcharge=subtractVnd('0',sumVnd((db.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind='ORDER_SURCHARGE'").all(o.id) as Row[]).map(e=>String(e.delta))));return {order_id:Number(o.id),freight_revenue:freight,surcharge_revenue:surcharge,actual_net:actual.actual_net,gp_net_before_client_refunds:actual.actual_net===null?null:subtractVnd(addVnd(freight,surcharge),actual.actual_net),supplier_receivable_in_gp:false,client_claim_allocation:'CLIENT_POOL_NO_ORDER_ALLOCATION'};}),claim_refund_status:'ACTIVE',supplier_actuals:actuals,refund_obligations:[...decisions.values()],refund_cash:(db.prepare("SELECT kind,delta,executed_day FROM vnd_refund_events WHERE kind IN ('BANK','RECOVER_BANK') AND substr(executed_day,1,7)=?").all(month) as Row[]),claim_allocation_status:'CLIENT_POOL_NO_ORDER_ALLOCATION'};
}
