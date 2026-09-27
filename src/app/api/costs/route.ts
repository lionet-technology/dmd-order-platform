import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { addSupplierCost } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  const {page,pageSize,q,offset}=pageParams(req);
  const params:unknown[]=[];
  let where="";
  if(q){
    where=" WHERE (sc.tracking LIKE ? OR sc.supplier LIKE ? OR sc.service LIKE ? OR o.order_id LIKE ? OR o.customer LIKE ?)";
    const like="%"+q+"%"; params.push(like,like,like,like,like);
  }
  const total=queryOne<{c:number}>(
    "SELECT COUNT(*) c FROM supplier_costs sc LEFT JOIN orders o ON o.tracking=sc.tracking"+where,
    params,
  )?.c||0;
  const items=queryAll(
    "SELECT sc.*,CASE WHEN o.id IS NULL THEN 0 ELSE 1 END matched,o.order_id,o.customer,o.est_net_cost,o.reconciliation_status FROM supplier_costs sc LEFT JOIN orders o ON o.tracking=sc.tracking"+where+" ORDER BY COALESCE(sc.occurred_at,sc.created_at) DESC,sc.id DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize));
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
