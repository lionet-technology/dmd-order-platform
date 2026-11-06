import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { addSupplierCost } from "@/lib/finance";
import {moneyCommand} from "@/lib/money-command";
import {reviewSupplierCost} from "@/lib/supplier-cost-review";
import { logOrderEvent } from "@/lib/order-audit";

export const runtime = "nodejs";

export async function GET(req:NextRequest) {
  const auth=requireAnyRole(req,["ADMIN","FINANCE","BOD"]); if(auth.error)return auth.error;
  const {page,pageSize,q,offset}=pageParams(req);
  const params:unknown[]=[];
  const clauses:string[]=[];
  if(q){
    clauses.push("(sc.tracking LIKE ? OR sc.supplier LIKE ? OR sc.service LIKE ? OR o.order_id LIKE ? OR o.system_order_code LIKE ? OR o.customer LIKE ?)");
    const like="%"+q+"%"; params.push(like,like,like,like,like,like);
  }
  const supplier=req.nextUrl.searchParams.get("supplier");
  const status=req.nextUrl.searchParams.get("status");
  if(supplier){clauses.push("sc.supplier=?");params.push(supplier)}
  const importStatus=req.nextUrl.searchParams.get("import_status");
  if(importStatus==="OPEN")clauses.push("sc.import_status IN ('ACTIVE','PENDING')");
  else{clauses.push("sc.import_status=?");params.push(importStatus||"ACTIVE");}
  if(status==="UNMATCHED")clauses.push("o.id IS NULL AND sc.import_status='ACTIVE'");
  else if(status){clauses.push("sc.import_status='ACTIVE' AND COALESCE(o.reconciliation_status,'PENDING')=?");params.push(status)}
  const where=clauses.length?" WHERE "+clauses.join(" AND "):"";
  const join=" FROM supplier_costs sc LEFT JOIN orders o ON o.id=COALESCE(sc.matched_order_id,(SELECT order_id FROM order_trackings WHERE normalized_tracking=sc.normalized_tracking AND sc.import_status IN ('PENDING','DISCARDED'))) LEFT JOIN order_lots l ON l.id=sc.order_lot_id";
  const total=queryOne<{c:number}>("SELECT COUNT(*) c"+join+where,params)?.c||0;
  const items=queryAll(
    `SELECT sc.*,CASE WHEN sc.matched_order_id IS NULL THEN 0 ELSE 1 END matched,o.order_id,o.system_order_code,o.customer,
     l.lot_number,${auth.user.role==="ADMIN"?"":"o.est_net_cost,"}o.reconciliation_status,
     (SELECT display_name FROM users WHERE id=sc.resolved_by_user_id) resolved_by,
     CASE WHEN sc.import_status='PENDING' THEN (SELECT group_concat(id,',' ORDER BY id) FROM supplier_costs
       WHERE normalized_tracking=sc.normalized_tracking AND import_status='ACTIVE') END previous_ids,
     CASE WHEN sc.import_status='PENDING' THEN (SELECT SUM(total_net_cost) FROM supplier_costs
       WHERE normalized_tracking=sc.normalized_tracking AND import_status='ACTIVE') END previous_total
     `+join+where+" ORDER BY CASE WHEN sc.import_status='PENDING' THEN 0 ELSE 1 END,COALESCE(sc.occurred_at,sc.created_at) DESC,sc.id DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize),{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req: NextRequest) {
  const auth=requireAnyRole(req,["ADMIN","FINANCE","BOD"]); if(auth.error)return auth.error;
  try {
    const body = await req.json();
    const key=req.headers.get("Idempotency-Key")||body.request_key;
    if(body.source_key!=null&&(typeof body.source_key!=="string"||!body.source_key.trim()||body.source_key.length>200)){
      throw Error("Mã chứng từ không hợp lệ.");
    }
    if(!key&&!body.source_key)throw Error("Cần mã chứng từ hoặc request_key để chống ghi trùng.");
    const result=moneyCommand("supplier-cost:"+auth.user.id,key,body,()=>{
      const saved=addSupplierCost(body,auth.user.id);
      if(!saved.duplicate&&saved.matched){
        const cost=db.prepare("SELECT matched_order_id,tracking,total_net_cost,extra_surcharge,import_tax,surcharge_type,note FROM supplier_costs WHERE id=?").get(saved.id) as
          {matched_order_id:number;tracking:string;total_net_cost:number;extra_surcharge:number;import_tax:number;surcharge_type:string|null;note:string|null};
        logOrderEvent({
          orderId:cost.matched_order_id,eventType:"SUPPLIER_COST_IMPORTED",
          summary:`Cập nhật chi phí theo Tracking ${cost.tracking}: Net Cost True ${cost.total_net_cost} USD, phụ phí ${cost.extra_surcharge||0} USD, thuế NK ${cost.import_tax||0} USD.`,
          actorId:auth.user.id,visibility:"ADMIN",after:cost,
        });
      }
      return saved;
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu chi phí" }, { status: 400 });
  }
}

export async function PATCH(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","FINANCE"]);if(auth.error)return auth.error;
  try{
    return NextResponse.json(reviewSupplierCost(auth.user,await req.json()));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể xử lý Supplier Cost."},{status:400});
  }
}
