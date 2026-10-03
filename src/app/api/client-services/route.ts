import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canonicalEnumValue } from "@/lib/enums";

export const runtime="nodejs";
export async function GET(req:NextRequest){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const requested=Number(req.nextUrl.searchParams.get("clientUserId")||0);
  const clientId=auth.user.role==="CLIENT"?auth.user.id:requested;
  if(!clientId)return NextResponse.json({error:"Thiếu Client."},{status:400});
  if(auth.user.role==="SALES"){
    const owned=db.prepare("SELECT id FROM users WHERE id=? AND role='CLIENT' AND sales_user_id=?").get(clientId,auth.user.id);
    if(!owned)return NextResponse.json({error:"Client không thuộc Sales đang đăng nhập."},{status:403});
  }
  const settings=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? ORDER BY service,sub_service").all(clientId);
  if(req.nextUrl.searchParams.get("view")==="setup"){
    const balance=(db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries WHERE client_user_id=?").get(clientId) as {balance:number}).balance;
    return NextResponse.json({client_user_id:clientId,balance,settings});
  }
  return NextResponse.json(settings);
}
export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();const clientId=Number(body.client_user_id||0);
    const client=db.prepare("SELECT id FROM users WHERE id=? AND role='CLIENT'").get(clientId);if(!client)throw new Error("Client không hợp lệ.");
    const service=canonicalEnumValue("SERVICE",String(body.service||""));
    const sub=body.sub_service?canonicalEnumValue("SUB_SERVICE",String(body.sub_service),service):"";
    const defaultSub=body.default_sub_service?canonicalEnumValue("SUB_SERVICE",String(body.default_sub_service),service):"";
    const defaultSupplier=body.default_supplier?canonicalEnumValue("SUPPLIER",String(body.default_supplier)):"";
    const discount=Math.max(0,Math.min(100,Number(body.discount_percent||0)));
    db.prepare(`INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent,default_sub_service,default_supplier,updated_by_user_id)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(client_user_id,service,sub_service) DO UPDATE SET is_enabled=excluded.is_enabled,discount_percent=excluded.discount_percent,default_sub_service=excluded.default_sub_service,default_supplier=excluded.default_supplier,updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .run(clientId,service,sub,body.is_enabled===false||body.is_enabled===0?0:1,discount,defaultSub,defaultSupplier,auth.user.id);
    return NextResponse.json(db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND service=? AND sub_service=?").get(clientId,service,sub));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể lưu cấu hình dịch vụ"},{status:400})}
}
