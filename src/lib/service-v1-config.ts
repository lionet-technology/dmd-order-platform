import {createHash} from "node:crypto";
import {db} from "./db";
import {routeState} from "./route-lifecycle";

export type ServiceV1Config = {
 currency:"VND";
 adapter:"EPACKET"|"UPS"|"YUNEXPRESS"|"CUSTOM"|"FULFILLMENT"|"ADD_ON";
 markets:string[];
};
type ConfigVersion = {id:number;route_id:number;revision:number;config_json:string;request_key:string;request_hash:string;actor_id:number;created_at:string};
export function assertServiceV1Owner(actorId:number) {
 const actor=db.prepare("SELECT role,active,is_root_admin FROM users WHERE id=?").get(actorId) as {role:string;active:number;is_root_admin:number}|undefined;
 if(!actor||actor.role!=="ADMIN"||!actor.active||!actor.is_root_admin)throw Error("Chỉ Owner quản lý cấu hình Service V1.");
}
export function serviceV1Key(value:unknown) {
 if(typeof value!=="string"||! /^[a-zA-Z0-9._:-]{8,120}$/.test(value))throw Error("Request key không hợp lệ.");
 return value;
}
function normalizeConfig(value:unknown):ServiceV1Config {
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("Cần cấu hình V1.");
 const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!["currency","adapter","markets"].includes(key)))throw Error("Cấu hình V1 có trường chưa hỗ trợ.");
 if(row.currency!=="VND")throw Error("Service V1 dùng VNĐ.");
 const adapters=["EPACKET","UPS","YUNEXPRESS","CUSTOM","FULFILLMENT","ADD_ON"];
 if(typeof row.adapter!=="string"||!adapters.includes(row.adapter))throw Error("Adapter V1 không hợp lệ.");
 if(!Array.isArray(row.markets)||!row.markets.length||row.markets.length>250||row.markets.some(v=>typeof v!=="string"||! /^[A-Z]{2}$/.test(v)))throw Error("Market cần country code hai chữ in hoa.");
 const markets=[...new Set(row.markets as string[])].sort();
 if(markets.length!==row.markets.length)throw Error("Market bị trùng.");
 return {currency:"VND",adapter:row.adapter as ServiceV1Config["adapter"],markets};
}
export function readServiceV1Config(routeId:number,actorId:number) {
 assertServiceV1Owner(actorId);
 return db.prepare("SELECT * FROM service_v1_config_versions WHERE route_id=? ORDER BY revision DESC LIMIT 1").get(routeId) as ConfigVersion|undefined;
}
export function saveServiceV1Config(input:{route_id:number;expected_revision:number;request_key:string;config:unknown},actorId:number) {
 assertServiceV1Owner(actorId);
 const config=normalizeConfig(input.config),key=serviceV1Key(input.request_key);
 if(!Number.isSafeInteger(input.route_id)||input.route_id<1||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<0)throw Error("Route/revision không hợp lệ.");
 const payload=JSON.stringify({route_id:input.route_id,expected_revision:input.expected_revision,config});
 const hash=createHash("sha256").update(payload).digest("hex");
 return db.transaction(()=>{
  const replay=db.prepare("SELECT * FROM service_v1_config_versions WHERE request_key=?").get(key) as ConfigVersion|undefined;
  if(replay) {
   if(replay.actor_id!==actorId||replay.request_hash!==hash)throw Error("Request key đã dùng cho thay đổi khác.");
   return replay;
  }
  const route=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(input.route_id) as {service:string;warehouse_hold:number}|undefined;
  if(!route)throw Error("Route không tồn tại.");
  const state=routeState(input.route_id);
  if(["ARCHIVED","DELETED"].includes(state)||route.warehouse_hold)throw Error("Route đang Hold/Archived/Deleted.");
  if(config.adapter==="UPS"&&!/^UPS$/i.test(route.service))throw Error("UPS adapter cần route UPS.");
  if(config.adapter==="EPACKET"&&!/^ePacket$/i.test(route.service))throw Error("ePacket adapter cần route ePacket.");
  if(/^UPS$/i.test(route.service)&&config.adapter!=="UPS")throw Error("Route UPS cần UPS adapter.");
  if(/^ePacket$/i.test(route.service)&&config.adapter!=="EPACKET")throw Error("Route ePacket cần ePacket adapter.");
  const previous=readServiceV1Config(input.route_id,actorId);
  if((previous?.revision??0)!==input.expected_revision)throw Error("Cấu hình đã thay đổi; tải lại trước khi lưu.");
  const result=db.prepare("INSERT INTO service_v1_config_versions(route_id,revision,config_json,request_key,request_hash,actor_id) VALUES (?,?,?,?,?,?)")
   .run(input.route_id,input.expected_revision+1,JSON.stringify(config),key,hash,actorId);
  return db.prepare("SELECT * FROM service_v1_config_versions WHERE id=?").get(result.lastInsertRowid) as ConfigVersion;
 }).immediate();
}
