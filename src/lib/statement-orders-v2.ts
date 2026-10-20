import {db} from './db';
export function statementOrderIdsV2(events:{detail:Record<string,unknown>}[]){
 const orderIds=new Set<number>();
 for(const e of events){const d=e.detail,ref=Number(d.reference_id);if(['ORDER','ORDER_RECONCILIATION'].includes(String(d.reference_type)))orderIds.add(ref);
 if(d.reference_type==='TRACKING')for(const o of db.prepare('SELECT order_id FROM order_trackings WHERE tracking=?').all(d.reference_id) as {order_id:number}[])orderIds.add(o.order_id);
 if(d.reference_type==='LOT_RECONCILIATION'){const o=db.prepare('SELECT order_id FROM order_lots WHERE id=?').get(ref) as {order_id:number}|undefined;if(o)orderIds.add(o.order_id);}
 if(d.reference_type==='WEIGHT_ADJUSTMENT'&&db.prepare("SELECT name FROM sqlite_master WHERE name='weight_adjustments'").get()){const o=db.prepare('SELECT order_id FROM weight_adjustments WHERE id=?').get(ref) as {order_id:number}|undefined;if(o)orderIds.add(o.order_id);}}
 return orderIds;
}
