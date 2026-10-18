import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { NextRequest, NextResponse } from "next/server";
import { currentUser, isFinanceRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { importWorkbook } from "@/lib/importers";

export const runtime = "nodejs";

async function handlePOST(req: NextRequest) {
  const financeUser=currentUser(req);
  const auth=financeUser&&isFinanceRole(financeUser.role)?{user:financeUser,error:undefined}:requireUser(req); if(auth.error)return auth.error;
  try {
    const form = await req.formData();
    const kind = String(form.get("kind") || "") as "orders" | "sales_orders" | "costs" | "tracking_updates" | "balance";
    const file = form.get("file");
    const adminKinds = ["orders","tracking_updates","balance"];
    const allowed = isFinanceRole(auth.user.role)?kind==="costs":auth.user.role==="ADMIN" ? adminKinds.includes(kind) : auth.user.role==="SALES" && kind==="sales_orders";
    if (!allowed) return NextResponse.json({ error: "Bạn không có quyền import loại dữ liệu này." }, { status: 403 });
    if(file instanceof File&&file.size>10*1024*1024)return NextResponse.json({error:"File tối đa 10 MB."},{status:400});
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });

    const result = await importWorkbook(
      kind,
      Buffer.from(await file.arrayBuffer()),
      file.name,
      auth.user.role==="SALES" ? { salesActor:{ userId:auth.user.id, displayName:auth.user.display_name },actorId:auth.user.id } : {actorId:auth.user.id,requestKey:String(form.get("request_key")||req.headers.get("Idempotency-Key")||"")||undefined},
    );
    db.prepare("UPDATE import_batches SET created_by_user_id=? WHERE id=?").run(auth.user.id,result.batchId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 400 });
  }
}

export const POST=withFinancialPrivacy(handlePOST);
