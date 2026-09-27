import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, queryAll } from "@/lib/db";
import { addLedgerEntry } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  return NextResponse.json(queryAll("SELECT * FROM ledger_entries ORDER BY COALESCE(occurred_at,created_at) DESC,id DESC LIMIT 300"));
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
