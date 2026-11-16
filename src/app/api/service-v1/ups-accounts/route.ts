import {db} from "@/lib/db";
import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {publishedUpsV1Account,saveUpsV1Account,upsV1AccountEvent,quotePublishedUpsV1} from "@/lib/ups-v1-accounts";
import type {UpsAccount} from "@/lib/ups-v1-calculator";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý UPS account."},{status:403});
 return NextResponse.json({staged:true,operational_cutover:false,versions:db.prepare("SELECT * FROM service_v1_ups_account_versions WHERE route_id=? ORDER BY id DESC").all(Number(req.nextUrl.searchParams.get("route_id"))),accounts:(["VTT","SDS","JD"] as UpsAccount[]).map(account=>publishedUpsV1Account(Number(req.nextUrl.searchParams.get("route_id")),account,auth.user.id)??null)});
}
export async function POST(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý UPS account."},{status:403});
 try {
  const body=await req.json();let result;
  if(body.action==="SAVE")result=saveUpsV1Account(body,auth.user.id);
  else if(body.action==="REVIEW"||body.action==="PUBLISH")result=upsV1AccountEvent(body,auth.user.id);
  else if(body.action==="PREVIEW")result=quotePublishedUpsV1(body.route_id,body.zones,body.weight_kg,auth.user.id);
  else throw Error("Tác vụ UPS account không hợp lệ.");
  return NextResponse.json({staged:true,operational_cutover:false,result});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"UPS account lỗi."},{status:400});}
}
