import './inbound';
import {db} from './db';
import {instant} from './sla';
import {listOrderEvents} from './order-audit';
import type {UserRole} from './auth';
type Row=Record<string,unknown>;
// Read projection only. Authoritative events remain in their original audited tables.
export function orderTimeline(orderId:number,role:UserRole){
 const events=listOrderEvents(orderId,role) as Row[];
 const cases=db.prepare("SELECT c.id,c.kind,c.visibility,c.summary,c.created_at,c.status FROM operation_cases c JOIN operation_case_orders co ON co.case_id=c.id WHERE co.order_id=? AND (?!='CLIENT' OR c.visibility='PUBLIC')").all(orderId,role) as Row[];
 for(const c of cases){events.push({id:'case:'+c.id,event_type:'CASE_MEMBERSHIP',visibility:c.visibility,created_at:c.created_at,summary:'Order thuộc '+c.kind+' #'+c.id+' · '+c.status+'. Xem nội dung và quyết định tại Case.'});}
 const parcels=db.prepare('SELECT id,status,received_at FROM inbound_parcels WHERE order_id=?').all(orderId) as Row[];
 for(const p of parcels)events.push({id:'inbound:'+p.id,event_type:'WAREHOUSE_RECEIVED',visibility:'PUBLIC',created_at:p.received_at,summary:'Kho đã tiếp nhận hàng.'});
 if(role!=='CLIENT'){
 const measurements=db.prepare('SELECT m.id,m.created_at,m.weight,m.chargeable_weight FROM inbound_measurements m JOIN inbound_parcels p ON p.id=m.parcel_id WHERE p.order_id=?').all(orderId) as Row[];
 for(const m of measurements)events.push({id:'measurement:'+m.id,event_type:'WAREHOUSE_MEASURED',visibility:'INTERNAL',created_at:m.created_at,summary:'Kho cân đo: '+m.weight+' kg; chargeable '+m.chargeable_weight+' kg.'});
 }
 const charges=db.prepare("SELECT id,entry_type,direction,amount,created_at FROM ledger_entries WHERE reference_type IN ('ORDER','ORDER_CANCELLATION') AND reference_id=?").all(String(orderId)) as Row[];
 for(const e of charges)events.push({id:'ledger:'+e.id,event_type:'FINANCIAL_COMMAND',visibility:'PUBLIC',created_at:e.created_at,summary:String(e.entry_type)+' · '+e.direction+' $'+Number(e.amount).toFixed(2)});
 for(const e of events)e.created_at=new Date(instant(e.created_at)).toISOString();
 return events.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
}
