import {db} from './db';
import {vndCommissionInputs} from './vnd-commission';
import {addVnd,subtractVnd,sumVnd} from './vnd-money';
import {validVndDay} from './vnd-debt';
type Row=Record<string,unknown>;
/** Performance uses Order purchase time; cash uses immutable posting time. */
export function vndBusinessReport(month:string){
 return db.transaction(()=>readReport(month)).deferred();
}
function readReport(month:string){
 if(!/^[0-9]{4}-[0-9]{2}$/.test(month))throw Error('Chọn tháng YYYY-MM.');
 validVndDay(month+'-01');
 const orders=db.prepare("SELECT o.*,r.status,r.offer FROM orders o JOIN vnd_purchase_requests r ON r.order_id=o.id WHERE substr(datetime(o.service_purchased_at,'+7 hours'),1,7)=?").all(month) as Row[];
 const groups=new Map<string,{service:string;sub_service:string;client_id:number;sales_user_id:unknown;orders:number;revenue:string;estimated_net:string;estimated_base:string;cancelled:number;actual_cost_status:string;missing_estimate:boolean;refunds:string;supplier:string}>();
 for(const o of orders){
  const key=[o.service,o.sub_service,o.client_user_id,o.sales_user_id,o.supplier].join(':');
  const group=groups.get(key)??{service:String(o.service),sub_service:String(o.sub_service),client_id:Number(o.client_user_id),sales_user_id:o.sales_user_id,orders:0,revenue:'0',estimated_net:'0',estimated_base:'0',cancelled:0,actual_cost_status:'NOT_RECONCILED',missing_estimate:false,refunds:'0',supplier:String(o.supplier)};
  group.orders++;if(o.status==='CANCELLED')group.cancelled++;
  const entries=db.prepare("SELECT * FROM vnd_ledger WHERE order_id=? AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION')").all(o.id) as Row[];
  group.revenue=addVnd(group.revenue,subtractVnd('0',sumVnd(entries.map(e=>String(e.delta)))));
  const q=db.prepare('SELECT snapshot_json FROM vnd_auto_quotes WHERE order_id=?').get(o.id) as Row|undefined;
  if(!q&&entries.length)group.missing_estimate=true;
  group.refunds=addVnd(group.refunds,sumVnd((db.prepare("SELECT delta FROM vnd_ledger WHERE order_id=? AND kind='CANCELLATION_REFUND'").all(o.id) as Row[]).map(e=>String(e.delta))));
  if(q&&entries.length){const quote=JSON.parse(String(q.snapshot_json));group.estimated_net=addVnd(group.estimated_net,quote.net_vnd??'0');group.estimated_base=addVnd(group.estimated_base,quote.base_vnd??'0');}
  groups.set(key,group);
 }
 const cash=db.prepare("SELECT l.* FROM vnd_ledger l WHERE substr(datetime(l.created_at,'+7 hours'),1,7)=?").all(month) as Row[];
 return {currency:'VND',month,commission:vndCommissionInputs(orders),performance:[...groups.values()].map(g=>({...g,estimated_gp_net:g.missing_estimate?null:subtractVnd(g.revenue,g.estimated_net),signed_gp_base:g.missing_estimate?null:subtractVnd(g.revenue,g.estimated_base)})),cash_flow:[...new Set(cash.map(e=>String(e.kind)))].map(kind=>({kind,delta:sumVnd(cash.filter(e=>e.kind===kind).map(e=>String(e.delta)))})),addon_revenue:subtractVnd('0',sumVnd(cash.filter(e=>['ADDON_REVENUE','ADDON_CORRECTION'].includes(String(e.kind))).map(e=>String(e.delta)))),actual_gp:null,claim_refund_status:'NOT_ACTIVATED'};
}
