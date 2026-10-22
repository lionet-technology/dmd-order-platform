import {db} from './db';
export function labelFingerprint(orderId:number){return JSON.stringify(db.prepare("SELECT id,tracking,carton_id,label_url FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY id").all(orderId));}
export function hasPartialLabelOverride(orderId:number){
 const row=db.prepare("SELECT after_json FROM order_events WHERE order_id=? AND event_type='PARTIAL_LABEL_OVERRIDE' ORDER BY id DESC LIMIT 1").get(orderId) as {after_json:string}|undefined;
 if(!row)return false;
 try{return JSON.parse(row.after_json).fingerprint===labelFingerprint(orderId);}catch{return false;}
}
