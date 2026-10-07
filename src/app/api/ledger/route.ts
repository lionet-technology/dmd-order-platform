import { NextRequest, NextResponse } from "next/server";
import { canAccessClient, getClientAccount, requireUser } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { addLedgerEntry } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  if(auth.user.role==="WAREHOUSE")return NextResponse.json({error:"Kho không có quyền xem tài chính."},{status:403});
  const {page,pageSize,q,offset}=pageParams(req);
  const where:string[]=[];
  const params:unknown[]=[];

  if(auth.user.role==="SALES"){
    where.push("client_user_id IN (SELECT id FROM users WHERE role='CLIENT' AND sales_user_id=?)");
    params.push(auth.user.id);
  } else if(auth.user.role==="CLIENT"){
    where.push("client_user_id=?");
    params.push(auth.user.id);
  }
  if(auth.user.role!=="ADMIN")where.push("entry_type!='SERVICE_COST'");
  if(q){
    where.push("(entry_type LIKE ? OR customer LIKE ? OR reference_id LIKE ? OR note LIKE ?)");
    const like="%"+q+"%"; params.push(like,like,like,like);
  }
  const whereSql=where.length?" WHERE "+where.join(" AND "):"";
  const total=queryOne<{c:number}>("SELECT COUNT(*) c FROM ledger_entries"+whereSql,params)?.c||0;
  const items=queryAll(
    "SELECT * FROM ledger_entries"+whereSql+" ORDER BY COALESCE(occurred_at,created_at) DESC,id DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize));
}

export async function POST(req: NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  if(!["ADMIN","SALES"].includes(auth.user.role))return NextResponse.json({error:"Chỉ Admin/Sales được ghi Balance Ledger."},{status:403});
  try {
    const body = await req.json();
    if(auth.user.role==="SALES" && !["PAYMENT","ADDITIONAL_FEE"].includes(String(body.entry_type).toUpperCase()))throw Error("Sales chỉ được nhập Payment hoặc Additional Fee; hoàn tiền cần Admin.");
    if(auth.user.role==="SALES")body.direction=String(body.entry_type).toUpperCase()==="PAYMENT"?"CREDIT":"DEBIT";
    const clientRaw=body.client_user_id;
    const client=clientRaw?getClientAccount(clientRaw,true):undefined;
    if(auth.user.role==="SALES"){
      if(!client)return NextResponse.json({error:"Hãy chọn Client hợp lệ trước khi ghi Balance."},{status:400});
      if(!canAccessClient(auth.user,client))return NextResponse.json({error:"Client này không thuộc Sales đang đăng nhập."},{status:403});
    } else if(clientRaw && !client){
      return NextResponse.json({error:"Client account không hợp lệ."},{status:400});
    }
    if(String(body.entry_type).toUpperCase()==="PAYMENT"&&!String(body.request_key||req.headers.get("Idempotency-Key")||"").trim())throw Error("Payment cần request key để tránh ghi nhận lặp.");
    const result=addLedgerEntry({
      ...body,
      request_key:body.request_key||req.headers.get("Idempotency-Key")||undefined,
      created_by_user_id:auth.user.id,
      client_user_id:client?.id??null,
      customer:client?.display_name??body.customer,
    }) as {id:number};
    return NextResponse.json(db.prepare("SELECT * FROM ledger_entries WHERE id=?").get(result.id), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu balance entry" }, { status: 400 });
  }
}
