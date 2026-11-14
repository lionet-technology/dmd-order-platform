import {createHash} from "node:crypto";
import {db} from "./db";
import {serviceV1Key} from "./service-v1-config";
import {routeState} from "./route-lifecycle";
type Row=Record<string,unknown>;
function access(clientId:number,actorId:number) {
 const actor=db.prepare("SELECT role,active FROM users WHERE id=?").get(actorId) as Row|undefined;
 const client=db.prepare("SELECT role,active,sales_user_id FROM users WHERE id=?").get(clientId) as Row|undefined;
 if(!actor?.active||!client?.active||client.role!=="CLIENT"||
  !(actor.role==="ADMIN"||(actor.role==="CLIENT"&&actorId===clientId)||(actor.role==="SALES"&&Number(client.sales_user_id)===actorId)))
  throw Error("Không có quyền xem báo giá Client này.");
}
function publicQuote(row:Row) {
 const q=JSON.parse(String(row.snapshot_json));
 return {id:row.id,created_at:row.created_at,route_id:row.route_id,client_id:row.client_id,
  currency:"VND",rounding:"NONE",config_version_id:q.config_version_id,price_version_id:q.price_version_id,
  rate_key:q.rate_key,discount_percent:q.discount_percent,sales_vnd:q.sales_vnd,
  operational_cutover:false,purchase_eligible:false,notice:"Báo giá theo dòng đã chọn; chưa tra cân/zone hoặc phụ phí và chưa dùng để Purchase."};
}
/** Explicit row preview only. Server order→rate mapping and VND ledger cutover are separate gates. */
export function createServiceV1Quote(input:{route_id:number;client_id:number;rate_key:string;request_key:string},actorId:number) {
 access(input.client_id,actorId);
 if(!Number.isSafeInteger(input.route_id)||input.route_id<1||typeof input.rate_key!=="string"||!input.rate_key.trim())throw Error("Route/dòng giá không hợp lệ.");
 const key=serviceV1Key(input.request_key);
 const hash=createHash("sha256").update(JSON.stringify({route_id:input.route_id,client_id:input.client_id,rate_key:input.rate_key})).digest("hex");
 return db.transaction(()=>{
  const existing=db.prepare("SELECT * FROM service_v1_quotes WHERE request_key=?").get(key) as Row|undefined;
  if(existing) {
   if(existing.actor_id!==actorId||existing.request_hash!==hash)throw Error("Request key đã dùng cho báo giá khác.");
   return publicQuote(existing);
  }
  const route=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(input.route_id) as Row|undefined;
  if(!route?.active||route.warehouse_hold||routeState(input.route_id)!=="ACTIVE")throw Error("Route không active hoặc đang Hold.");
  const config=db.prepare("SELECT * FROM service_v1_config_versions WHERE route_id=? ORDER BY revision DESC LIMIT 1").get(input.route_id) as Row|undefined;
  const price=db.prepare("SELECT d.* FROM service_v1_price_events e JOIN service_v1_price_documents d ON d.id=e.document_id WHERE d.route_id=? AND d.kind='PROPOSAL' AND e.action='PUBLISH' ORDER BY e.id DESC LIMIT 1").get(input.route_id) as Row|undefined;
  if(!config||!price||price.config_id!==config.id)throw Error("Chưa có Published Price cho cấu hình hiện tại.");
  const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(input.client_id,route.service,route.sub_service,route.sub_service) as Row|undefined;
  if(!setting?.is_enabled)throw Error("Client chưa được cấp dịch vụ.");
  const discount=Number(setting.discount_percent);
  if(!Number.isFinite(discount)||discount<0||discount>100)throw Error("Client Discount không hợp lệ.");
  const body=JSON.parse(String(price.body_json));
  const rate=(body.rows as Array<{key:string;retail_vnd:number}>).find(r=>r.key===input.rate_key);
  if(body.currency!=="VND"||!rate)throw Error("Thiếu dòng Published Price.");
  const sales=rate.retail_vnd*(1-discount/100);
  if(!Number.isFinite(sales)||sales<0||sales>Number.MAX_SAFE_INTEGER)throw Error("Giá vượt độ chính xác.");
  const snapshot={currency:"VND",config_version_id:config.id,price_version_id:price.id,net_version_id:price.source_net_id,
   config:JSON.parse(String(config.config_json)),rate_key:rate.key,price_row:rate,client_setting:setting,
   discount_percent:discount,sales_vnd:sales,rounding:"NONE"};
  const result=db.prepare("INSERT INTO service_v1_quotes(route_id,client_id,actor_id,snapshot_json,request_key,request_hash) VALUES (?,?,?,?,?,?)").run(input.route_id,input.client_id,actorId,JSON.stringify(snapshot),key,hash);
  return publicQuote(db.prepare("SELECT * FROM service_v1_quotes WHERE id=?").get(result.lastInsertRowid) as Row);
 }).immediate();
}
export function serviceV1QuoteHistory(clientId:number,actorId:number) {
 access(clientId,actorId);
 return (db.prepare("SELECT * FROM service_v1_quotes WHERE client_id=? ORDER BY id DESC LIMIT 100").all(clientId) as Row[]).map(publicQuote);
}
