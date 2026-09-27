import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, queryAll } from "@/lib/db";
import { addSupplierCost } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  return NextResponse.json(queryAll(
    "SELECT sc.*,CASE WHEN o.id IS NULL THEN 0 ELSE 1 END matched,o.order_id,o.customer,o.est_net_cost,o.reconciliation_status FROM supplier_costs sc LEFT JOIN orders o ON o.tracking=sc.tracking ORDER BY COALESCE(sc.occurred_at,sc.created_at) DESC,sc.id DESC LIMIT 300"
  ));
}

export async function POST(req: NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  try {
    const body = await req.json();
    const result=addSupplierCost(body) as {id:number};
    db.prepare("UPDATE supplier_costs SET created_by_user_id=? WHERE id=?").run(auth.user.id,result.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu chi phí" }, { status: 400 });
  }
}
