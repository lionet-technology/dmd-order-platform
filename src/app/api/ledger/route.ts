import { NextRequest, NextResponse } from "next/server";
import { canAccessClient, getClientAccount, requireUser } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { addLedgerEntry } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
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
  if(auth.user.role==="CLIENT")return NextResponse.json({error:"Client chỉ có quyền xem Balance Ledger."},{status:403});
  try {
    const body = await req.json();
    const clientRaw=body.client_user_id;
    const client=clientRaw?getClientAccount(clientRaw,true):undefined;
    if(auth.user.role==="SALES"){
      if(!client)return NextResponse.json({error:"Hãy chọn Client hợp lệ trước khi ghi Balance."},{status:400});
      if(!canAccessClient(auth.user,client))return NextResponse.json({error:"Client này không thuộc Sales đang đăng nhập."},{status:403});
    } else if(clientRaw && !client){
      return NextResponse.json({error:"Client account không hợp lệ."},{status:400});
    }
    const result=addLedgerEntry({
      ...body,
      client_user_id:client?.id??null,
      customer:client?.display_name??body.customer,
    }) as {id:number};
    db.prepare("UPDATE ledger_entries SET created_by_user_id=? WHERE id=?").run(auth.user.id,result.id);
    return NextResponse.json(db.prepare("SELECT * FROM ledger_entries WHERE id=?").get(result.id), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu balance entry" }, { status: 400 });
  }
}
