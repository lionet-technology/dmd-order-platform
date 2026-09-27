import { NextRequest, NextResponse } from "next/server";
import { importWorkbook } from "@/lib/importers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const kind = String(form.get("kind") || "") as "orders" | "costs" | "balance";
    const file = form.get("file");
    if (!["orders", "costs", "balance"].includes(kind)) return NextResponse.json({ error: "Invalid import kind" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importWorkbook(kind, buffer, file.name);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
