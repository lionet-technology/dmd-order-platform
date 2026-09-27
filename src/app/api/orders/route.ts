import { NextRequest, NextResponse } from "next/server";
import { queryAll } from "@/lib/db";
import { upsertOrder } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(queryAll(`SELECT * FROM orders ORDER BY COALESCE(created_at, updated_at) DESC, id DESC LIMIT 300`));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json(upsertOrder(body), { status: body.id ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu order" }, { status: 400 });
  }
}
