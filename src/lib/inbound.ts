import {db} from "./db";
import type {AuthUser} from "./auth";
import {orderAccess} from "./cases";
import {cents,localDay,audit} from "./credit";
import {quote} from "./epacket-pricing";
import {publishPublicNote} from "./order-audit";
type Row=Record<string,unknown>;
db.exec(`CREATE TABLE IF NOT EXISTS inbound_parcels(id INTEGER PRIMARY KEY,scan_key TEXT NOT NULL,order_id INTEGER REFERENCES orders(id),status TEXT NOT NULL CHECK(status IN ('UNIDENTIFIED','RECEIVED','MEASURED')),received_by INTEGER NOT NULL REFERENCES users(id),received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,matched_by INTEGER REFERENCES users(id),matched_at TEXT,note TEXT);
 CREATE TABLE IF NOT EXISTS inbound_measurements(id INTEGER PRIMARY KEY,parcel_id INTEGER NOT NULL REFERENCES inbound_parcels(id),carton_id INTEGER NOT NULL REFERENCES order_cartons(id),weight REAL NOT NULL,length REAL NOT NULL,width REAL NOT NULL,height REAL NOT NULL,chargeable_weight REAL NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS weight_adjustments(id INTEGER PRIMARY KEY,measurement_id INTEGER NOT NULL UNIQUE REFERENCES inbound_measurements(id),order_id INTEGER NOT NULL REFERENCES orders(id),amount_cents INTEGER NOT NULL CHECK(amount_cents>0),actual_total_cents INTEGER NOT NULL,declared_tier REAL,actual_tier REAL,status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL','CHARGED','REJECTED')),approved_by INTEGER REFERENCES users(id),ledger_id INTEGER UNIQUE REFERENCES ledger_entries(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_order ON inbound_parcels(order_id) WHERE order_id IS NOT NULL;`);
export function inboundFor(user:AuthUser){
 if(user.role==='CLIENT')throw Error("Client không xem kho nội bộ.");
 const parcels=db.prepare("SELECT * FROM inbound_parcels ORDER BY id DESC LIMIT 1000").all() as Row[];
 return {parcels:parcels.filter(p=>{if(!p.order_id)return ['ADMIN','WAREHOUSE'].includes(user.role);try{orderAccess(user,Number(p.order_id));return true}catch{return false}}),adjustments:(db.prepare("SELECT * FROM weight_adjustments ORDER BY id DESC LIMIT 1000").all() as Row[]).filter(a=>{try{orderAccess(user,Number(a.order_id));return true}catch{return false}})};
}
export function inboundAction(user:AuthUser,b:Row){return db.transaction(()=>{
 const action=String(b.action);if(user.role==='CLIENT')throw Error("Client không thao tác kho.");
 if(action==='scan'){
 if(!['ADMIN','WAREHOUSE'].includes(user.role))throw Error("Chỉ Kho/Admin nhận hàng.");
 const key=String(b.scan_key||'').trim();if(!key||key.length>200)throw Error("Mã scan không hợp lệ.");
 const found=db.prepare(`SELECT DISTINCT o.* FROM orders o LEFT JOIN order_trackings t ON t.order_id=o.id AND t.status='ACTIVE' WHERE o.order_id=? OR o.system_order_code=? OR UPPER(REPLACE(REPLACE(t.tracking,'-',''),' ',''))=?`).all(key,key,key.toUpperCase().replace(/[ -]/g,'')) as Row[];
 const o=found.length===1?found[0]:undefined;if(o?.workflow_status==='CANCELLED')throw Error("Đơn đã hủy.");
 if(o){const existing=db.prepare("SELECT * FROM inbound_parcels WHERE order_id=?").get(o.id);if(existing)return existing;}
 const id=Number(db.prepare("INSERT INTO inbound_parcels(scan_key,order_id,status,received_by,note) VALUES (?,?,?,?,?)").run(key,o?.id||null,o?'RECEIVED':'UNIDENTIFIED',user.id,String(b.note||'')).lastInsertRowid);
 if(o)db.prepare("UPDATE orders SET fulfillment_started_at=COALESCE(fulfillment_started_at,CURRENT_TIMESTAMP) WHERE id=?").run(o.id);return {id,status:o?'RECEIVED':'UNIDENTIFIED',ambiguous:found.length>1};
 }
 const p=db.prepare("SELECT * FROM inbound_parcels WHERE id=?").get(Number(b.parcel_id)) as Row|undefined;if(!p)throw Error("Kiện inbound không tồn tại.");
 if(action==='match'){
 if(!['ADMIN','SALES'].includes(user.role))throw Error("Ops/Sales match thủ công.");if(p.order_id)throw Error("Kiện đã match.");const o=orderAccess(user,Number(b.order_id));if(o.workflow_status==='CANCELLED')throw Error("Đơn đã hủy.");db.prepare("UPDATE inbound_parcels SET order_id=?,status='RECEIVED',matched_by=?,matched_at=CURRENT_TIMESTAMP WHERE id=?").run(o.id,user.id,p.id);db.prepare("UPDATE orders SET fulfillment_started_at=COALESCE(fulfillment_started_at,CURRENT_TIMESTAMP) WHERE id=?").run(o.id);return {id:p.id};
 }
 if(!p.order_id)throw Error("Match Order trước khi đo.");const o=orderAccess(user,Number(p.order_id));
 if(action==='measure'){
 if(!['ADMIN','WAREHOUSE'].includes(user.role))throw Error("Chỉ Kho/Admin cân đo.");const carton=db.prepare("SELECT * FROM order_cartons WHERE id=? AND order_id=?").get(Number(b.carton_id),o.id) as Row|undefined;if(!carton)throw Error("Carton không thuộc Order.");
 const values=['weight','length','width','height'].map(k=>Number(b[k]));if(values.some(v=>!Number.isFinite(v)||v<=0||v>10000))throw Error("Cân/kích thước phải lớn hơn 0 và không vượt 10000.");const [weight,length,width,height]=values,chargeable=Math.max(weight,length*width*height/Number(o.dimensional_divisor||5000));
 if(db.prepare("SELECT a.id FROM weight_adjustments a WHERE a.order_id=? AND a.status='PENDING_APPROVAL'").get(o.id))throw Error("Xử lý adjustment hiện tại trước khi cân lại.");
 const measurement=Number(db.prepare("INSERT INTO inbound_measurements(parcel_id,carton_id,weight,length,width,height,chargeable_weight,created_by) VALUES (?,?,?,?,?,?,?,?)").run(p.id,carton.id,weight,length,width,height,chargeable,user.id).lastInsertRowid);
 db.prepare("UPDATE inbound_parcels SET status='MEASURED' WHERE id=?").run(p.id);
 if(o.pricing_snapshot_json){const frozen=JSON.parse(String(o.pricing_snapshot_json)) as Row,version=db.prepare("SELECT tiers_json FROM route_price_versions WHERE id=?").get(Number(o.pricing_version_id)) as Row,config=db.prepare("SELECT * FROM route_pricing_configs WHERE id=?").get(Number(o.pricing_config_version_id)) as Row;
 const q=quote({...o,weight,length,width,height,volume:length*width*height,carton_count:1},JSON.parse(String(version.tiers_json)),Number(config.base_markup),Number(config.retail_markup),Number(frozen.discount_percent),JSON.parse(String(config.surcharges_json)));
 if(!q.eligible)throw Error("Thông số thực tế cần xử lý ngoại lệ: "+q.reasons.join('; '));
 const already=Number((db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM weight_adjustments WHERE order_id=? AND status='CHARGED'").get(o.id) as {n:number}).n),amount=cents(q.total_charge)-cents(frozen.total_charge)-already;
 if(Number(q.tier)>Number(frozen.tier)&&amount>0){db.prepare("INSERT INTO weight_adjustments(measurement_id,order_id,amount_cents,actual_total_cents,declared_tier,actual_tier) VALUES (?,?,?,?,?,?)").run(measurement,o.id,amount,cents(q.total_charge),frozen.tier,q.tier);publishPublicNote({orderId:Number(o.id),eventType:'SURCHARGE_NOTICE',summary:'Cân đo thực tế: phụ thu '+(amount/100).toFixed(2)+' USD đang chờ Sales/Admin duyệt.',actorId:user.id,publicData:{amount:amount/100,currency:'USD'}});}
 }else if(chargeable>Number(carton.chargeable_weight||o.chargeable_weight||0)){audit(Number(o.client_user_id),user.id,'MEASUREMENT_REQUIRES_MANUAL_PRICING',{order_id:o.id,measurement});}
 return {measurement_id:measurement};
 }
 if(action==='approve_adjustment'||action==='reject_adjustment'){
 if(!['ADMIN','SALES'].includes(user.role))throw Error("Sales/Admin duyệt phụ thu.");const a=db.prepare("SELECT * FROM weight_adjustments WHERE id=? AND order_id=?").get(Number(b.adjustment_id),o.id) as Row|undefined;if(!a)throw Error("Adjustment không tồn tại.");if(a.status!=='PENDING_APPROVAL')return a;
 let ledger:number|null=null;if(action==='approve_adjustment'){ledger=Number(db.prepare("INSERT INTO ledger_entries(client_user_id,occurred_at,entry_type,direction,amount,customer,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,'WEIGHT_ADJUSTMENT','DEBIT',?,?,'WEIGHT_ADJUSTMENT',?,'Actual measurement surcharge',?)").run(o.client_user_id,localDay(),Number(a.amount_cents)/100,o.customer,String(a.id),user.id).lastInsertRowid);publishPublicNote({orderId:Number(o.id),eventType:'SURCHARGE_NOTICE',summary:'Đã duyệt và thu phụ phí cân đo '+(Number(a.amount_cents)/100).toFixed(2)+' USD.',actorId:user.id});}
 db.prepare("UPDATE weight_adjustments SET status=?,approved_by=?,ledger_id=? WHERE id=?").run(action==='approve_adjustment'?'CHARGED':'REJECTED',user.id,ledger,a.id);audit(Number(o.client_user_id),user.id,action,{adjustment_id:a.id});return {id:a.id};
 }throw Error("Action không hỗ trợ.");
 }).immediate();}
