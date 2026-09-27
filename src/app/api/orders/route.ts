import { NextResponse } from "next/server";
import { queryAll } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json(queryAll(`SELECT * FROM orders ORDER BY COALESCE(created_at, updated_at) DESC, id DESC LIMIT 200`));
}
