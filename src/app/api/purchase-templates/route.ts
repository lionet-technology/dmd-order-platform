import { NextRequest,NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { missingRoutePlaceholders,scanPurchaseWorkbook,validateRepeatSections } from "@/lib/purchase-templates";

export const runtime="nodejs";

export async function GET(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const rows=db.prepare(
    "SELECT pt.*,rc.service,rc.sub_service,rc.supplier,pv.id version_id,pv.version_number,pv.original_filename,pv.status,pv.placeholder_map_json,pv.validation_json,pv.created_at version_created_at "+
    "FROM purchase_templates pt JOIN service_route_configs rc ON rc.id=pt.route_config_id "+
    "LEFT JOIN purchase_template_versions pv ON pv.template_id=pt.id "+
    "ORDER BY pt.id,pv.version_number DESC"
  ).all();
  return NextResponse.json(rows);
}

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const form=await req.formData();
    const file=form.get("file");
    if(!(file instanceof File))throw new Error("File template .xlsx là bắt buộc.");
    if(!file.name.toLowerCase().endsWith(".xlsx"))throw new Error("Phase này chỉ hỗ trợ file .xlsx.");
    const routeId=Number(form.get("route_config_id")||0);
    const route=db.prepare("SELECT * FROM service_route_configs WHERE id=?").get(routeId) as Record<string,unknown>|undefined;
    if(!route)throw new Error("Service Route không hợp lệ.");
    const templateKind=String(form.get("template_kind")||"PURCHASE").toUpperCase();
    if(!["PURCHASE","MANIFEST"].includes(templateKind))throw new Error("Loại template không hợp lệ.");
    const templateLabel=templateKind==="MANIFEST"?"Manifest Template":"Purchase Template";
    const name=String(form.get("name")||"").trim();
    if(!name)throw new Error("Tên "+templateLabel+" là bắt buộc.");
    const outputMode=String(form.get("output_mode")||"").toUpperCase();
    if(!["MULTI_ORDER","PER_ORDER","PER_LOT"].includes(outputMode))throw new Error("Output mode không hợp lệ.");
    let rawSections:unknown=[];
    try{rawSections=JSON.parse(String(form.get("repeat_sections")||"[]"))}catch{throw new Error("Repeat sections không đúng JSON.")}
    const buffer=Buffer.from(await file.arrayBuffer());
    const scan=await scanPurchaseWorkbook(buffer);
    const sections=validateRepeatSections(rawSections,scan.sheets);
    let routeVariables:Record<string,string>={};
    try{routeVariables=JSON.parse(String(route.route_variables_json||"{}"))}catch{}
    const errors:string[]=[];
    const warnings:string[]=[];
    if(!scan.placeholders.length)errors.push("Workbook không có placeholder nào.");
    if(scan.unknown.length)errors.push("Có placeholder hệ thống không biết: "+[...new Set(scan.unknown.map(row=>row.token))].join(", "));
    const missingRouteVariables=missingRoutePlaceholders(scan.placeholders,routeVariables);
    if(missingRouteVariables.length)errors.push("Chưa cấu hình biến cố định: "+missingRouteVariables.join(", "));
    if(outputMode==="MULTI_ORDER"&&!sections.length)errors.push("MULTI_ORDER cần ít nhất một dòng lặp.");
    for(const section of sections){
      const hasToken=scan.placeholders.some(row=>row.sheet===section.sheet&&Number(row.cell.match(/\d+$/)?.[0]||0)===section.row);
      if(!hasToken)warnings.push(section.sheet+"!"+section.row+" chưa có placeholder trong dòng mẫu.");
    }
    let templateId=Number(form.get("template_id")||0);
    const tx=db.transaction(()=>{
      if(templateId){
        const existing=db.prepare("SELECT id FROM purchase_templates WHERE id=? AND route_config_id=? AND template_kind=?").get(templateId,routeId,templateKind);
        if(!existing)throw new Error(templateLabel+" không thuộc Service Route này.");
        db.prepare("UPDATE purchase_templates SET name=?,template_kind=?,output_mode=?,repeat_sections_json=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(name,templateKind,outputMode,JSON.stringify(sections),auth.user.id,templateId);
      }else{
        const existing=db.prepare("SELECT id FROM purchase_templates WHERE route_config_id=? AND template_kind=? AND active=1").get(routeId,templateKind) as {id:number}|undefined;
        if(existing){
          templateId=existing.id;
          db.prepare("UPDATE purchase_templates SET name=?,template_kind=?,output_mode=?,repeat_sections_json=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .run(name,templateKind,outputMode,JSON.stringify(sections),auth.user.id,templateId);
        }else{
          const result=db.prepare("INSERT INTO purchase_templates(route_config_id,name,template_kind,output_mode,repeat_sections_json,created_by_user_id,updated_by_user_id) VALUES (?,?,?,?,?,?,?)")
            .run(routeId,name,templateKind,outputMode,JSON.stringify(sections),auth.user.id,auth.user.id);
          templateId=Number(result.lastInsertRowid);
        }
      }
      const version=(db.prepare("SELECT COALESCE(MAX(version_number),0)+1 version FROM purchase_template_versions WHERE template_id=?").get(templateId) as {version:number}).version;
      const dataDirectory=process.env.DMD_DB_PATH?path.dirname(path.resolve(process.env.DMD_DB_PATH)):path.join(process.cwd(),"data");
      const directory=path.join(dataDirectory,"purchase-templates",String(templateId));
      fs.mkdirSync(directory,{recursive:true});
      const storedPath=path.join(directory,"v"+version+".xlsx");
      fs.writeFileSync(storedPath,buffer);
      const result=db.prepare("INSERT INTO purchase_template_versions(template_id,version_number,original_filename,stored_path,status,placeholder_map_json,validation_json,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)")
        .run(templateId,version,file.name,storedPath,"DRAFT",JSON.stringify(scan.placeholders),JSON.stringify({errors,warnings,sheets:scan.sheets}),auth.user.id);
      return Number(result.lastInsertRowid);
    });
    const versionId=tx.immediate();
    const version=db.prepare("SELECT * FROM purchase_template_versions WHERE id=?").get(versionId);
    return NextResponse.json({template_id:templateId,template_kind:templateKind,version,...scan,sections,errors,warnings},{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể upload Purchase Template."},{status:400});
  }
}
