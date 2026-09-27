import { NextResponse } from "next/server";
import { queryAll } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json(queryAll(`SELECT * FROM ledger_entries ORDER BY COALESCE(occurred_at, created_at) DESC, id DESC LIMIT 250`));
}
