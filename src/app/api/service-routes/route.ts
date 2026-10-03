import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canonicalEnumValue } from "@/lib/enums";

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

export async function GET(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const rows=db.prepare(
    "SELECT rc.*,pt.id template_id,pt.name template_name,pt.output_mode,pt.repeat_sections_json,pt.active template_active,"+
    "pv.id active_version_id,pv.version_number,pv.original_filename,pv.placeholder_map_json,pv.validation_json "+
    "FROM service_route_configs rc "+
    "LEFT JOIN purchase_templates pt ON pt.route_config_id=rc.id AND pt.active=1 "+
    "LEFT JOIN purchase_template_versions pv ON pv.template_id=pt.id AND pv.status='ACTIVE' "+
    "ORDER BY rc.active DESC,rc.service,rc.sub_service,rc.supplier"
  ).all();
  return NextResponse.json(rows);
}

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const service=canonicalEnumValue("SERVICE",body.service);
    const subService=body.sub_service?canonicalEnumValue("SUB_SERVICE",body.sub_service,service):"";
    const supplier=canonicalEnumValue("SUPPLIER",body.supplier);
    const active=body.active===false||body.active===0?0:1;
    const hasVariables=Object.prototype.hasOwnProperty.call(body,"route_variables")||Object.prototype.hasOwnProperty.call(body,"variables");
    const variables=hasVariables?routeVariables(body.route_variables??body.variables):null;
    const existing=body.id
      ? db.prepare("SELECT id FROM service_route_configs WHERE id=?").get(Number(body.id)) as {id:number}|undefined
      : db.prepare("SELECT id FROM service_route_configs WHERE lower(service)=lower(?) AND lower(sub_service)=lower(?) AND lower(supplier)=lower(?)").get(service,subService,supplier) as {id:number}|undefined;
    let id:number;
    if(existing){
      id=existing.id;
      if(variables){
        db.prepare("UPDATE service_route_configs SET service=?,sub_service=?,supplier=?,route_variables_json=?,active=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(service,subService,supplier,JSON.stringify(variables),active,auth.user.id,id);
      }else{
        db.prepare("UPDATE service_route_configs SET service=?,sub_service=?,supplier=?,active=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(service,subService,supplier,active,auth.user.id,id);
      }
    }else{
      const result=db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,route_variables_json,active,created_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?,?)")
        .run(service,subService,supplier,JSON.stringify(variables||{}),active,auth.user.id,auth.user.id);
      id=Number(result.lastInsertRowid);
    }
    return NextResponse.json(db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(id),{status:existing?200:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể lưu cấu hình tuyến."},{status:400});
  }
}
