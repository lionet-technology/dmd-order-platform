import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { importWorkbook } from "@/lib/importers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  try {
    const form = await req.formData();
    const kind = String(form.get("kind") || "") as "orders" | "sales_orders" | "costs" | "balance";
    const file = form.get("file");
    const adminKinds = ["orders","costs","balance"];
    const allowed = auth.user.role==="ADMIN" ? adminKinds.includes(kind) : kind==="sales_orders";
    if (!allowed) return NextResponse.json({ error: "Bạn không có quyền import loại dữ liệu này." }, { status: 403 });
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });

    const result = await importWorkbook(
      kind,
      Buffer.from(await file.arrayBuffer()),
      file.name,
      auth.user.role==="SALES" ? { salesActor:{ userId:auth.user.id, displayName:auth.user.display_name } } : undefined,
    );
    db.prepare("UPDATE import_batches SET created_by_user_id=? WHERE id=?").run(auth.user.id,result.batchId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}
