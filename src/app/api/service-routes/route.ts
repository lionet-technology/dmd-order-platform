import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canonicalEnumValue } from "@/lib/enums";
import {maxCartonsForService} from '@/lib/carton-policy';
import {routeState} from "@/lib/route-lifecycle";

import {parseCancellationRules,readCancellationRules,saveCancellationRules} from "@/lib/cancellation-config";
import { parseSegmentation, readSegmentation, saveSegmentation } from "@/lib/route-segmentation";

export const runtime="nodejs";

function routeVariables(value:unknown){
  const source=Array.isArray(value)
    ? Object.fromEntries(value.map(item=>[String((item as Record<string,unknown>).key||""),String((item as Record<string,unknown>).value||"")]))
    : value&&typeof value==="object"?value as Record<string,unknown>:{};
  const result:Record<string,string>={};
  for(const [rawKey,rawValue] of Object.entries(source)){
    const key=rawKey.trim().toLowerCase();
    if(!key&&!String(rawValue??"").trim())continue;
    if(!/^[a-z][a-z0-9_]*$/.test(key))throw new Error("Key biến cố định chỉ dùng a-z, 0-9, dấu _ và phải bắt đầu bằng chữ.");
    const text=String(rawValue??"").trim();
    if(!text)throw new Error("Biến route."+key+" chưa có giá trị.");
    if(text.length>4000)throw new Error("Giá trị route."+key+" quá dài.");
    result[key]=text;
  }
  return result;
}

async function handleGET(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const rows=db.prepare(
    "SELECT rc.*,"+
    "ppt.id template_id,ppt.id purchase_template_id,ppt.name template_name,ppt.name purchase_template_name,ppt.output_mode,ppt.output_mode purchase_output_mode,ppt.repeat_sections_json,ppt.active template_active,"+
    "ppv.id active_version_id,ppv.id purchase_active_version_id,ppv.version_number,ppv.version_number purchase_version_number,ppv.original_filename,ppv.placeholder_map_json,ppv.validation_json,"+
    "mpt.id manifest_template_id,mpt.name manifest_template_name,mpt.output_mode manifest_output_mode,mpt.repeat_sections_json manifest_repeat_sections_json,"+
    "mpv.id manifest_active_version_id,mpv.version_number manifest_version_number,mpv.original_filename manifest_original_filename,mpv.placeholder_map_json manifest_placeholder_map_json,mpv.validation_json manifest_validation_json "+
    "FROM service_route_configs rc "+
    "LEFT JOIN purchase_templates ppt ON ppt.route_config_id=rc.id AND ppt.active=1 AND ppt.template_kind='PURCHASE' "+
    "LEFT JOIN purchase_template_versions ppv ON ppv.template_id=ppt.id AND ppv.status='ACTIVE' "+
    "LEFT JOIN purchase_templates mpt ON mpt.route_config_id=rc.id AND mpt.active=1 AND mpt.template_kind='MANIFEST' "+
    "LEFT JOIN purchase_template_versions mpv ON mpv.template_id=mpt.id AND mpv.status='ACTIVE' "+
    "ORDER BY rc.active DESC,rc.service,rc.sub_service,rc.supplier"
  ).all();
  return NextResponse.json((rows as Array<{id:number}>).map(row=>({...row,lifecycle_state:routeState(row.id),segmentation:readSegmentation(row.id),cancellation_policy:readCancellationRules(row.id)})));
}

async function handlePOST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const cancellation=Object.prototype.hasOwnProperty.call(body,"cancellation_policy")?parseCancellationRules(body.cancellation_policy):null;
    const segmentation=Object.prototype.hasOwnProperty.call(body,"segmentation")?parseSegmentation(body.segmentation):null;
    const service=canonicalEnumValue("SERVICE",body.service);
    const subService=body.sub_service?canonicalEnumValue("SUB_SERVICE",body.sub_service,service):"";
    const supplier=canonicalEnumValue("SUPPLIER",body.supplier);
    const active=body.active===false||body.active===0?0:1;
    const hasMax=Object.prototype.hasOwnProperty.call(body,'max_cartons_per_order');
    const maxCartons=Number(body.max_cartons_per_order);
    if(hasMax&&(!Number.isSafeInteger(maxCartons)||maxCartons<1||maxCartons>1000))throw Error('Carton tối đa phải là số nguyên từ 1 đến 1000.');
    if(hasMax&&maxCartonsForService(service,maxCartons)!==maxCartons)throw Error('ePacket và Yun chỉ cho phép 1 carton/Order.');
    const hasVariables=Object.prototype.hasOwnProperty.call(body,"route_variables")||Object.prototype.hasOwnProperty.call(body,"variables");
    const variables=hasVariables?routeVariables(body.route_variables??body.variables):null;
    const existing=body.id
      ? db.prepare("SELECT id FROM service_route_configs WHERE id=?").get(Number(body.id)) as {id:number}|undefined
      : db.prepare("SELECT id FROM service_route_configs WHERE lower(service)=lower(?) AND lower(sub_service)=lower(?) AND lower(supplier)=lower(?)").get(service,subService,supplier) as {id:number}|undefined;
    const id=db.transaction(()=>{
      let id:number;
      if(existing){
        id=existing.id;
        const previous=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(id) as Record<string,unknown>;
        const effectiveActive=Object.prototype.hasOwnProperty.call(body,"active")?active:Number(previous.active);
        if(Number(previous.active)!==effectiveActive){
          const before=routeState(id);
          db.prepare("INSERT INTO route_lifecycle(route_id,state,reason,actor_id) VALUES (?,?,?,?) ON CONFLICT(route_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=CURRENT_TIMESTAMP")
            .run(id,effectiveActive?"ACTIVE":"INACTIVE","Chuyển trạng thái qua cấu hình dịch vụ",auth.user.id);
          db.prepare("INSERT INTO route_lifecycle_events(route_id,from_state,to_state,reason,actor_id) VALUES (?,?,?,?,?)")
            .run(id,before,effectiveActive?"ACTIVE":"INACTIVE","Chuyển trạng thái qua cấu hình dịch vụ",auth.user.id);
        }
        const previousState=routeState(id);
        if(previousState==="DELETED"||previousState==="ARCHIVED")throw Error("Route đã Archived/Deleted; dùng tác vụ đổi trạng thái trước khi sửa.");
        // Historic order identities must stay immutable, not merely manifest references.
        const renaming=[service,subService,supplier].some((value,index)=>value.toLowerCase()!==String(previous[["service","sub_service","supplier"][index]]).toLowerCase());
        if(renaming&&db.prepare("SELECT id FROM orders WHERE service=? COLLATE NOCASE AND sub_service=? COLLATE NOCASE AND supplier=? COLLATE NOCASE LIMIT 1").get(previous.service,previous.sub_service,previous.supplier))throw Error("Route đã gắn Order; hãy tạo Route mới để bảo toàn lịch sử tài chính.");
        if(renaming&&db.prepare("SELECT id FROM manifest_cartons WHERE route_config_id=? LIMIT 1").get(id))throw new Error("Route đã gắn với thùng kho. Hãy tạo route mới để giữ lịch sử thùng.");
        if(variables){
          db.prepare("UPDATE service_route_configs SET service=?,sub_service=?,supplier=?,route_variables_json=?,active=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(service,subService,supplier,JSON.stringify(variables),effectiveActive,auth.user.id,id);
        }else{
          db.prepare("UPDATE service_route_configs SET service=?,sub_service=?,supplier=?,active=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(service,subService,supplier,effectiveActive,auth.user.id,id);
        }
      }else{
        const result=db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,route_variables_json,active,created_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?,?)")
          .run(service,subService,supplier,JSON.stringify(variables||{}),active,auth.user.id,auth.user.id);
        id=Number(result.lastInsertRowid);
      }
      if(hasMax)db.prepare('UPDATE service_route_configs SET max_cartons_per_order=? WHERE id=?').run(maxCartons,id);
      if(cancellation)saveCancellationRules(id,cancellation,body.cancellation_reason,auth.user.id);
      if(segmentation)saveSegmentation(id,segmentation);
      return id;
    })();
    return NextResponse.json({...db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(id) as Record<string,unknown>,segmentation:readSegmentation(id),cancellation_policy:readCancellationRules(id)},{status:existing?200:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể lưu cấu hình tuyến."},{status:400});
  }
}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
