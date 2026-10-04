import {db} from "./db";

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

function createNextCarton(service:string,userId:number,date=localDate()){
  const sequence=Number((db.prepare("SELECT COALESCE(MAX(daily_sequence),0)+1 sequence FROM manifest_cartons WHERE service=? COLLATE NOCASE AND manifest_date=?").get(service,date) as {sequence:number}).sequence);
  const result=db.prepare("INSERT INTO manifest_cartons(carton_code,service,manifest_date,daily_sequence,created_by_user_id) VALUES (?,?,?,?,?)")
    .run(cartonCode(service,date,sequence),service,date,sequence,userId);
  return Number(result.lastInsertRowid);
}

function summary(id:number){
  return db.prepare(`
    SELECT mc.*,COUNT(mci.id) item_count,COUNT(DISTINCT mci.order_id) order_count,
      creator.display_name created_by_name,closer.display_name closed_by_name
    FROM manifest_cartons mc
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
      o.system_order_code,o.order_id client_order_id,o.customer,o.recipient_name,o.service,o.sub_service,o.supplier,
      u.display_name added_by_name
    FROM manifest_carton_items mci
    JOIN orders o ON o.id=mci.order_id
    JOIN order_cartons oc ON oc.id=mci.order_carton_id
    JOIN order_trackings ot ON ot.id=mci.tracking_id
    LEFT JOIN users u ON u.id=mci.added_by_user_id
    WHERE mci.manifest_carton_id=? ORDER BY mci.id
  `).all(id);
  return {carton,items};
}

export function listManifestCartons(limit=30){
  return db.prepare(`
    SELECT mc.*,COUNT(mci.id) item_count,COUNT(DISTINCT mci.order_id) order_count,
      creator.display_name created_by_name,closer.display_name closed_by_name
    FROM manifest_cartons mc
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
      o.id order_id,o.system_order_code,o.order_id client_order_id,o.customer,o.recipient_name,o.service,o.sub_service,o.supplier,o.workflow_status
    FROM order_trackings ot JOIN orders o ON o.id=ot.order_id JOIN order_cartons oc ON oc.id=ot.carton_id
    WHERE ot.normalized_tracking=? AND ot.status='ACTIVE'
  `).get(normalized) as DataRow|undefined;
  if(tracking){
    if(tracking.workflow_status==="CANCELLED")throw new Error("Order đã hủy.");
    return [tracking];
  }
  const orders=db.prepare("SELECT id,system_order_code,order_id,workflow_status FROM orders WHERE system_order_code=? COLLATE NOCASE OR order_id=? COLLATE NOCASE ORDER BY id").all(identifier,identifier) as DataRow[];
  if(!orders.length)throw new Error("Không tìm thấy Order hoặc Tracking: "+identifier);
  if(orders.length>1)throw new Error("Client Order ID trùng nhiều khách. Hãy nhập DMD ID hoặc Tracking.");
  const order=orders[0];
  if(order.workflow_status==="CANCELLED")throw new Error("Order đã hủy.");
  const cartons=Number((db.prepare("SELECT COUNT(*) count FROM order_cartons WHERE order_id=?").get(order.id) as {count:number}).count);
  const rows=db.prepare(`
    SELECT ot.id tracking_id,ot.tracking,ot.carton_id order_carton_id,oc.carton_number,
      o.id order_id,o.system_order_code,o.order_id client_order_id,o.customer,o.recipient_name,o.service,o.sub_service,o.supplier,o.workflow_status
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
  const tx=db.transaction(()=>{
    let carton:DataRow|undefined;
    if(requestedCartonId)carton=db.prepare("SELECT * FROM manifest_cartons WHERE id=?").get(requestedCartonId) as DataRow|undefined;
    else carton=db.prepare("SELECT * FROM manifest_cartons WHERE service=? COLLATE NOCASE AND status='OPEN' ORDER BY id DESC LIMIT 1").get(service) as DataRow|undefined;
    if(carton&&carton.status!=="OPEN")throw new Error("Thùng đã đóng, không thể thêm Order.");
    if(carton&&String(carton.service).toLowerCase()!==service.toLowerCase())throw new Error(`Thùng ${carton.carton_code} chỉ nhận dịch vụ ${carton.service}.`);
    const cartonId=carton?Number(carton.id):createNextCarton(service,userId);
    for(const row of rows){
      const existing=db.prepare("SELECT mc.carton_code FROM manifest_carton_items mci JOIN manifest_cartons mc ON mc.id=mci.manifest_carton_id WHERE mci.order_carton_id=?").get(row.order_carton_id) as {carton_code:string}|undefined;
      if(existing)throw new Error(`Carton đã nằm trong thùng ${existing.carton_code}.`);
      db.prepare("INSERT INTO manifest_carton_items(manifest_carton_id,order_id,order_carton_id,tracking_id,added_by_user_id) VALUES (?,?,?,?,?)")
        .run(cartonId,row.order_id,row.order_carton_id,row.tracking_id,userId);
    }
    return cartonId;
  });
  const id=tx.immediate();
  return {...manifestCartonDetail(id),added_count:rows.length};
}

export function removeManifestItem(cartonId:number,itemId:number){
  const carton=summary(cartonId);if(!carton)throw new Error("Không tìm thấy thùng Manifest.");
  if(carton.status!=="OPEN")throw new Error("Thùng đã đóng, không thể bỏ Order.");
  const result=db.prepare("DELETE FROM manifest_carton_items WHERE id=? AND manifest_carton_id=?").run(itemId,cartonId);
  if(!result.changes)throw new Error("Không tìm thấy dòng cần bỏ.");
  return manifestCartonDetail(cartonId);
}

export function closeManifestCarton(cartonId:number,userId:number){
  const tx=db.transaction(()=>{
    const carton=summary(cartonId);if(!carton)throw new Error("Không tìm thấy thùng Manifest.");
    if(carton.status!=="OPEN")throw new Error("Thùng đã được đóng trước đó.");
    if(!Number(carton.item_count||0))throw new Error("Thùng đang trống.");
    db.prepare("UPDATE manifest_cartons SET status='CLOSED',closed_by_user_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=?").run(userId,cartonId);
    return createNextCarton(String(carton.service),userId);
  });
  const nextId=tx.immediate();
  return {closed:manifestCartonDetail(cartonId),next:manifestCartonDetail(nextId)};
}

export function manifestCartonTrackings(cartonId:number){
  const detail=manifestCartonDetail(cartonId);
  if(detail.carton.status!=="CLOSED")throw new Error("Chỉ xuất file sau khi đã đóng đầy thùng.");
  if(!detail.items.length)throw new Error("Thùng không có Order.");
  return {detail,trackings:detail.items.map(row=>String((row as DataRow).tracking))};
}

export function markManifestCartonExported(cartonId:number){
  db.prepare("UPDATE manifest_cartons SET exported_at=CURRENT_TIMESTAMP WHERE id=?").run(cartonId);
}
