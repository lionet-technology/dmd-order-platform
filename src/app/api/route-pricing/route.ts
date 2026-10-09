import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { activePricing,activatePricing,createPriceVersion,pricingAdmin } from "@/lib/route-pricing";
import { readSheet } from "read-excel-file/node";
export const runtime="nodejs";
export async function GET(req:NextRequest){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 const id=Number(req.nextUrl.searchParams.get("route_id")),route=db.prepare("SELECT id,service,sub_service,supplier,pricing_engine,client_self_purchase FROM service_route_configs WHERE id=?").get(id);
 if(!route)return NextResponse.json({error:"Route không tồn tại."},{status:404});
 if(req.nextUrl.searchParams.get("download")==="1"){
 const active=activePricing(id);if(!active)return NextResponse.json({error:"Chưa có bảng active."},{status:404});
 const rows=JSON.parse(String(active.tiers_json)) as Array<{weight:number;net:number}>;
 return new NextResponse("weight,net\r\n"+rows.map(r=>r.weight+","+r.net).join("\r\n"),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":'attachment; filename="Net_USD_route_'+id+'_v'+active.price_version_id+'.csv"'}});
 }
 return NextResponse.json({...route,...pricingAdmin(id)});
}
export async function POST(req:NextRequest){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{
 let body:Record<string,unknown>;
 if(req.headers.get("content-type")?.includes("multipart/form-data")){
 const f=await req.formData(),file=f.get("file");
 if(!(file instanceof File)||file.size>5*1024*1024)throw Error("Chọn file tối đa 5 MB.");
 const buffer=Buffer.from(await file.arrayBuffer());let tiers;
 if(file.name.toLowerCase().endsWith(".csv")){
 const rows=buffer.toString("utf8").trim().split(/\r?\n/).map(r=>r.split(",").map(c=>c.trim()));
 if(rows[0].join(",").replace(/^\uFEFF/,"").toLowerCase()!=="weight,net")throw Error("Header phải là weight,net.");
 tiers=rows.slice(1).map(r=>({weight:Number(r[0]),net:Number(r[1])}));
 }else if(file.name.toLowerCase().endsWith(".xlsx")){
 const rows=await readSheet(buffer,1) as unknown[][];
 if(rows[0]?.map(String).join(",").toLowerCase()!=="weight,net")throw Error("Header phải là weight,net.");
 tiers=rows.slice(1).filter(r=>r.some(v=>v!=null)).map(r=>({weight:Number(r[0]),net:Number(r[1])}));
 }else throw Error("Chỉ nhận CSV/XLSX.");
 body={action:"upload",route_id:Number(f.get("route_id")),tiers};
 }else body=await req.json();
 const id=Number(body.route_id);
 if(!db.prepare("SELECT id FROM service_route_configs WHERE id=?").get(id))throw Error("Route không tồn tại.");
 if(body.action==="upload")return NextResponse.json(createPriceVersion(id,body.tiers,auth.user.id),{status:201});
 if(body.action==="activate")return NextResponse.json(activatePricing(id,body,auth.user.id));
 if(body.action==="self-purchase"){
 if(typeof body.enabled!=="boolean")throw Error("Bật/tắt không hợp lệ.");
 const previous=db.prepare("SELECT client_self_purchase FROM service_route_configs WHERE id=?").get(id);
 db.prepare("INSERT INTO route_pricing_audit(route_id,action,actor_user_id,before_json,after_json) VALUES (?,?,?,?,?)").run(id,"SELF_PURCHASE_TOGGLE",auth.user.id,JSON.stringify(previous),JSON.stringify({enabled:body.enabled}));
 db.prepare("UPDATE service_route_configs SET client_self_purchase=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(body.enabled?1:0,auth.user.id,id);
 return NextResponse.json({...pricingAdmin(id),client_self_purchase:body.enabled?1:0});
 }
 throw Error("Thao tác không hợp lệ.");
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Không thể lưu pricing."},{status:400})}
}
