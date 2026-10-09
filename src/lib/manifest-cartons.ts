import {resolveRoute} from "./routes";
import {db} from "./db";
import {enforceWarehouseGuard,WarehouseBlock} from "./warehouse-guard";

type DataRow=Record<string,unknown>;

function localDate(date=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function serviceCode(service:string){
  return service.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"")||"SERVICE";
}

function cartonCode(service:string,date:string,sequence:number){
  return `${serviceCode(service)}-${date.replaceAll("-","")}-${String(sequence).padStart(3,"0")}`;
}

function routeKey(row:DataRow){try{return String(resolveRoute(row).id)}catch{throw new WarehouseBlock("ROUTE_MISMATCH","Route chưa được cấu hình hoặc chưa xác định duy nhất.")}}

function createNextCarton(service:string,userId:number,date=localDate(),routeId?:number,segmentKey?:string){
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(daily_sequence),0)+1 sequence FROM manifest_cartons WHERE service=? COLLATE NOCASE AND manifest_date=?").get(service,date) as {sequence:number}).sequence);
  const result=db.prepare("INSERT INTO manifest_cartons(carton_code,service,manifest_date,daily_sequence,created_by_user_id,route_config_id,segment_key) VALUES (?,?,?,?,?,?,?)")
    .run(cartonCode(service,date,sequence),service,date,sequence,userId,routeId??null,segmentKey??null);
  const id=Number(result.lastInsertRowid);audit(id,"CREATE",userId,{route_config_id:routeId,segment_key:segmentKey});return id;
}

function summary(id:number){
  return db.prepare(`
    SELECT mc.*,rc.sub_service,rc.supplier,COUNT(mci.id) item_count,COUNT(DISTINCT mci.order_id) order_count,
      creator.display_name created_by_name,closer.display_name closed_by_name
    FROM manifest_cartons mc
    LEFT JOIN service_route_configs rc ON rc.id=mc.route_config_id
    LEFT JOIN manifest_carton_items mci ON mci.manifest_carton_id=mc.id
    LEFT JOIN users creator ON creator.id=mc.created_by_user_id
    LEFT JOIN users closer ON closer.id=mc.closed_by_user_id
    WHERE mc.id=? GROUP BY mc.id
  `).get(id) as DataRow|undefined;
}

export function manifestCartonDetail(id:number){
  const carton=summary(id);
  if(!carton)throw new Error("Không tìm thấy thùng Manifest.");
  const items=db.prepare(`
    SELECT mci.id item_id,mci.order_id,mci.order_carton_id,mci.tracking_id,mci.added_at,
      ot.tracking,ot.status tracking_status,oc.carton_number,
      o.system_order_code,o.order_id client_order_id,o.customer,o.recipient_name,o.route_id,o.service,o.sub_service,o.supplier,
      u.display_name added_by_name
    FROM manifest_carton_items mci
    JOIN orders o ON o.id=mci.order_id
    JOIN order_cartons oc ON oc.id=mci.order_carton_id
    JOIN order_trackings ot ON ot.id=mci.tracking_id
    LEFT JOIN users u ON u.id=mci.added_by_user_id
    WHERE mci.manifest_carton_id=? ORDER BY mci.id
  `).all(id);
  const history=db.prepare("SELECT e.*,u.display_name actor_name FROM manifest_carton_events e LEFT JOIN users u ON u.id=e.actor_user_id WHERE manifest_carton_id=? ORDER BY e.id DESC").all(id);
  return {carton,items,history};
}

export function listManifestCartons(limit=30){
  return db.prepare(`
    SELECT mc.*,rc.sub_service,rc.supplier,COUNT(mci.id) item_count,COUNT(DISTINCT mci.order_id) order_count,
      creator.display_name created_by_name,closer.display_name closed_by_name
    FROM manifest_cartons mc
    LEFT JOIN service_route_configs rc ON rc.id=mc.route_config_id
    LEFT JOIN manifest_carton_items mci ON mci.manifest_carton_id=mc.id
    LEFT JOIN users creator ON creator.id=mc.created_by_user_id
    LEFT JOIN users closer ON closer.id=mc.closed_by_user_id
    GROUP BY mc.id ORDER BY mc.manifest_date DESC,mc.daily_sequence DESC,mc.id DESC LIMIT ?
  `).all(Math.max(1,Math.min(100,limit)));
}

function resolveIdentifier(raw:string){
  const identifier=raw.trim();
  if(!identifier)throw new Error("Nhập DMD ID, Client Order ID hoặc Tracking.");
  const normalized=identifier.replace(/[\s-]+/g,"").toUpperCase();
  const tracking=db.prepare(`
    SELECT ot.id tracking_id,ot.tracking,ot.carton_id order_carton_id,oc.carton_number,
      o.id order_id,o.system_order_code,o.order_id client_order_id,o.customer,o.recipient_name,o.route_id,o.service,o.sub_service,o.supplier,o.workflow_status
    FROM order_trackings ot JOIN orders o ON o.id=ot.order_id JOIN order_cartons oc ON oc.id=ot.carton_id
    WHERE ot.normalized_tracking=? AND ot.status IN ('ACTIVE','CANCELLED') ORDER BY ot.id DESC LIMIT 1
  `).get(normalized) as DataRow|undefined;
  if(tracking){
    return [tracking];
  }
  const orders=db.prepare("SELECT id,system_order_code,order_id,workflow_status FROM orders WHERE system_order_code=? COLLATE NOCASE OR order_id=? COLLATE NOCASE ORDER BY id").all(identifier,identifier) as DataRow[];
  if(!orders.length)throw new Error("Không tìm thấy Order hoặc Tracking: "+identifier);
  if(orders.length>1)throw new Error("Client Order ID trùng nhiều khách. Hãy nhập DMD ID hoặc Tracking.");
  const order=orders[0];
  if(order.workflow_status==="CANCELLED")throw new WarehouseBlock("ORDER_CANCELLED","Order đã hủy.");
  const cartons=Number((db.prepare("SELECT COUNT(*) count FROM order_cartons WHERE order_id=?").get(order.id) as {count:number}).count);
  const rows=db.prepare(`
    SELECT ot.id tracking_id,ot.tracking,ot.carton_id order_carton_id,oc.carton_number,
      o.id order_id,o.system_order_code,o.order_id client_order_id,o.customer,o.recipient_name,o.route_id,o.service,o.sub_service,o.supplier,o.workflow_status
    FROM order_cartons oc JOIN orders o ON o.id=oc.order_id
    JOIN order_trackings ot ON ot.id=(SELECT active.id FROM order_trackings active WHERE active.carton_id=oc.id AND active.status='ACTIVE' ORDER BY active.id DESC LIMIT 1)
    WHERE o.id=? ORDER BY oc.carton_number
  `).all(order.id) as DataRow[];
  if(!cartons||rows.length!==cartons)throw new Error("Order chưa đủ Tracking theo từng carton.");
  return rows;
}

export function addManifestIdentifier(raw:string,requestedCartonId:number|undefined,userId:number){
  const rows=resolveIdentifier(raw);
  const service=String(rows[0].service||"").trim();
  if(!service)throw new Error("Order chưa có Dịch vụ.");
  if(rows.some(row=>String(row.service||"").toLowerCase()!==service.toLowerCase()))throw new Error("Một lần nhập chỉ được có một Dịch vụ.");
  const incomingRoute=rows[0];
  if(rows.some(row=>routeKey(row)!==routeKey(incomingRoute)))throw new Error("Một Order đang có nhiều route, cần kiểm tra lại trước khi đóng thùng.");
  const tx=db.transaction(()=>{
    const route=resolveRoute(incomingRoute);
    let carton=requestedCartonId?db.prepare("SELECT * FROM manifest_cartons WHERE id=?").get(requestedCartonId) as DataRow|undefined:undefined;
    if(requestedCartonId&&!carton)throw new Error("Không tìm thấy thùng.");
    if(carton&&carton.status!=="OPEN")throw new Error("Hãy tiếp tục / mở lại thùng trước khi scan.");
    if(!carton){
      if(!route)throw new WarehouseBlock("ROUTE_MISMATCH","Route chưa được cấu hình.");
      const cartonId=createNextCarton(service,userId,localDate(),Number(route.id));
      carton=db.prepare("SELECT * FROM manifest_cartons WHERE id=?").get(cartonId) as DataRow;
    }
    const cartonId=Number(carton.id);
    // Legacy empty cartons bind once on first scan; populated cartons never rebind.
    if(!carton.route_config_id&&route&&String(carton.service).toLowerCase()===service.toLowerCase()&&!db.prepare("SELECT id FROM manifest_carton_items WHERE manifest_carton_id=?").get(cartonId)){
      db.prepare("UPDATE manifest_cartons SET route_config_id=? WHERE id=?").run(route.id,cartonId);
      carton.route_config_id=route.id;audit(cartonId,"BIND_ROUTE",userId,{route_config_id:route.id});
    }
    for(const row of rows)enforceWarehouseGuard(row,carton);
    for(const row of rows){
      const existing=db.prepare("SELECT mc.carton_code FROM manifest_carton_items mci JOIN manifest_cartons mc ON mc.id=mci.manifest_carton_id WHERE mci.order_carton_id=?").get(row.order_carton_id) as {carton_code:string}|undefined;
      if(existing)throw new Error(`Carton đã nằm trong thùng ${existing.carton_code}.`);
      db.prepare("INSERT INTO manifest_carton_items(manifest_carton_id,order_id,order_carton_id,tracking_id,added_by_user_id) VALUES (?,?,?,?,?)")
        .run(cartonId,row.order_id,row.order_carton_id,row.tracking_id,userId);
      audit(cartonId,"ADD",userId,row);
    }
    return cartonId;
  });
  const id=tx.immediate();
  return {...manifestCartonDetail(id),added_count:rows.length};
}

function audit(id:number,action:string,userId:number,details:DataRow){
 db.prepare("INSERT INTO manifest_carton_events(manifest_carton_id,action,actor_user_id,details_json) VALUES (?,?,?,?)").run(id,action,userId,JSON.stringify(details));
}
export function removeManifestItem(cartonId:number,itemId:number,userId:number){
 return db.transaction(()=>{
 const carton=summary(cartonId);if(!carton||carton.status!=="OPEN")throw new Error("Hãy mở lại / tiếp tục thùng trước khi bốc hàng.");
 const item=db.prepare("SELECT * FROM manifest_carton_items WHERE id=? AND manifest_carton_id=?").get(itemId,cartonId) as DataRow|undefined;
 if(!item)throw new Error("Kiện không nằm trong thùng này.");
 db.prepare("DELETE FROM manifest_carton_items WHERE id=?").run(itemId);audit(cartonId,"REMOVE",userId,item);
 return manifestCartonDetail(cartonId);
 }).immediate();
}
export function removeManifestIdentifier(raw:string,cartonId:number,userId:number){
 return db.transaction(()=>{
 const normalized=raw.trim().replace(/[\s-]+/g,"").toUpperCase();
 const items=db.prepare(`SELECT i.id FROM manifest_carton_items i JOIN orders o ON o.id=i.order_id
 JOIN order_trackings t ON t.id=i.tracking_id WHERE i.manifest_carton_id=? AND
 (t.normalized_tracking=? OR o.system_order_code=? COLLATE NOCASE OR o.order_id=? COLLATE NOCASE)`).all(cartonId,normalized,raw.trim(),raw.trim()) as {id:number}[];
 if(!items.length)throw new Error("Kiện không nằm trong thùng này.");
 for(const item of items)removeManifestItem(cartonId,item.id,userId);
 return {...manifestCartonDetail(cartonId),removed_count:items.length};
 }).immediate();
}
export function changeManifestStatus(id:number,action:"pause"|"resume"|"reopen",userId:number){
 return db.transaction(()=>{
 const carton=summary(id);if(!carton)throw new Error("Không tìm thấy thùng.");
 const expected={pause:"OPEN",resume:"PAUSED",reopen:"CLOSED"}[action];
 if(carton.status!==expected)throw new Error("Trạng thái thùng không phù hợp.");
 const status=action==="pause"?"PAUSED":"OPEN";
 db.prepare("UPDATE manifest_cartons SET status=?,closed_at=NULL,closed_by_user_id=NULL,exported_at=NULL WHERE id=?").run(status,id);
 audit(id,action.toUpperCase(),userId,{from:carton.status,to:status});return manifestCartonDetail(id);
 }).immediate();
}
export function closeManifestCarton(cartonId:number,userId:number){
 const nextId=db.transaction(()=>{
 const carton=summary(cartonId);if(!carton||carton.status!=="OPEN")throw new Error("Chỉ chốt thùng đang mở.");
 if(!Number(carton.item_count))throw new Error("Thùng đang trống.");
 const rows=db.prepare("SELECT o.*,o.id order_id FROM manifest_carton_items i JOIN orders o ON o.id=i.order_id WHERE i.manifest_carton_id=?").all(cartonId) as DataRow[];
 for(const row of rows)enforceWarehouseGuard(row,carton);
 db.prepare("UPDATE manifest_cartons SET status='CLOSED',closed_by_user_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=?").run(userId,cartonId);
 audit(cartonId,"CLOSE",userId,{from:"OPEN",to:"CLOSED"});
 return createNextCarton(String(carton.service),userId,localDate(),Number(carton.route_config_id),carton.segment_key?String(carton.segment_key):undefined);
 }).immediate();
 return {closed:manifestCartonDetail(cartonId),next:manifestCartonDetail(nextId)};
}
export function createManifestCarton(routeId:number,segmentKey:string|undefined,userId:number){
 return db.transaction(()=>{
 const route=db.prepare("SELECT * FROM service_route_configs WHERE id=? AND active=1").get(routeId) as DataRow|undefined;
 if(!route)throw new Error("Route không hợp lệ.");
 return manifestCartonDetail(createNextCarton(String(route.service),userId,localDate(),routeId,segmentKey));
 }).immediate();
}

export function manifestCartonTrackings(cartonId:number){
  const detail=manifestCartonDetail(cartonId);
  if(detail.carton.status!=="CLOSED")throw new Error("Chỉ xuất file sau khi đã đóng đầy thùng.");
  if(!detail.items.length)throw new Error("Thùng không có Order.");
  for(const item of detail.items)enforceWarehouseGuard(item as DataRow,detail.carton);
  return {detail,trackings:detail.items.map(row=>String((row as DataRow).tracking))};
}

export function markManifestCartonExported(cartonId:number){
  db.prepare("UPDATE manifest_cartons SET exported_at=CURRENT_TIMESTAMP WHERE id=?").run(cartonId);
}
