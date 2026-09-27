import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { addLedgerEntry } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  const {page,pageSize,q,offset}=pageParams(req);
  const params:unknown[]=[];
  let where="";
  if(q){
    where=" WHERE (entry_type LIKE ? OR customer LIKE ? OR reference_id LIKE ? OR note LIKE ?)";
    const like="%"+q+"%"; params.push(like,like,like,like);
  }
  const total=queryOne<{c:number}>("SELECT COUNT(*) c FROM ledger_entries"+where,params)?.c||0;
  const items=queryAll(
    "SELECT * FROM ledger_entries"+where+" ORDER BY COALESCE(occurred_at,created_at) DESC,id DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize));
}

export async function POST(req: NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  try {
    const body = await req.json();
    const result=addLedgerEntry(body) as {id:number};
    db.prepare("UPDATE ledger_entries SET created_by_user_id=? WHERE id=?").run(auth.user.id,result.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu balance entry" }, { status: 400 });
  }
}
