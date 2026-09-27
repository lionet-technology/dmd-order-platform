import { NextRequest, NextResponse } from "next/server";
import { queryAll } from "@/lib/db";
import { addLedgerEntry } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(queryAll(`SELECT * FROM ledger_entries ORDER BY COALESCE(occurred_at, created_at) DESC, id DESC LIMIT 300`));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json(addLedgerEntry(body), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu balance entry" }, { status: 400 });
  }
}
