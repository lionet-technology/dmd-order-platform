import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { upsertOrder } from "@/lib/finance";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  const {page,pageSize,q,offset}=pageParams(req);
  const where:string[]=[];
  const params:unknown[]=[];
  if(auth.user.role==="SALES"){
    where.push("sales_user_id=?");
    params.push(auth.user.id);
  }
  if(q){
    where.push("(order_id LIKE ? OR tracking LIKE ? OR customer LIKE ? OR service LIKE ? OR sales LIKE ?)");
    const like="%"+q+"%";
    params.push(like,like,like,like,like);
  }
  const whereSql=where.length?" WHERE "+where.join(" AND "):"";
  const total=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders"+whereSql,params)?.c||0;
  const items=queryAll(
    "SELECT * FROM orders"+whereSql+" ORDER BY COALESCE(created_at,updated_at) DESC,id DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  return NextResponse.json(paged(items,total,page,pageSize));
}

export async function POST(req: NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  try {
    const body=await req.json();

    if(auth.user.role==="SALES"){
      if(body.id){
        const owned=db.prepare("SELECT id FROM orders WHERE id=? AND sales_user_id=?").get(Number(body.id),auth.user.id);
        if(!owned)return NextResponse.json({error:"Không có quyền sửa order này."},{status:403});
      } else {
        const tracking=String(body.tracking||"").trim();
        const orderId=String(body.order_id||"").trim();
        if(tracking){
          const other=db.prepare("SELECT id,sales_user_id FROM orders WHERE tracking=?").get(tracking) as {id:number;sales_user_id:number|null}|undefined;
          if(other && other.sales_user_id!==auth.user.id)return NextResponse.json({error:"Tracking đã thuộc tài khoản Sales khác."},{status:409});
        }
        if(orderId){
          const others=db.prepare("SELECT id,sales_user_id FROM orders WHERE order_id=?").all(orderId) as Array<{id:number;sales_user_id:number|null}>;
          if(others.some(x=>x.sales_user_id!==auth.user.id))return NextResponse.json({error:"Order ID đã thuộc tài khoản Sales khác."},{status:409});
        }
      }
      const salesBody={
        ...body,
        sales:auth.user.display_name,
        supplier:undefined,label:undefined,tracking:undefined,est_net_cost:undefined,base_cost:undefined,
        retail:undefined,sales_price:undefined,surcharge:undefined,import_tax:undefined,total_due:undefined,
        auto_pricing:undefined,volume:undefined,chargeable_weight:undefined,
      };
      const saved=upsertOrder(salesBody) as {id:number};
      db.prepare("UPDATE orders SET sales_user_id=?,sales=?,created_by_user_id=COALESCE(created_by_user_id,?),updated_by_user_id=? WHERE id=?")
        .run(auth.user.id,auth.user.display_name,auth.user.id,auth.user.id,saved.id);
      return NextResponse.json(db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id),{status:body.id?200:201});
    }

    let salesName=String(body.sales||"").trim();
    const salesUserId=body.sales_user_id?Number(body.sales_user_id):null;
    if(salesUserId){
      const salesUser=db.prepare("SELECT id,display_name FROM users WHERE id=? AND role='SALES' AND active=1").get(salesUserId) as {id:number;display_name:string}|undefined;
      if(!salesUser)return NextResponse.json({error:"Sales account không hợp lệ."},{status:400});
      salesName=salesUser.display_name;
    }
    const saved=upsertOrder({...body,sales:salesName}) as {id:number};
    db.prepare("UPDATE orders SET sales_user_id=COALESCE(?,sales_user_id),created_by_user_id=COALESCE(created_by_user_id,?),updated_by_user_id=? WHERE id=?")
      .run(salesUserId,auth.user.id,auth.user.id,saved.id);
    return NextResponse.json(db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id),{status:body.id?200:201});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu order" }, { status: 400 });
  }
}
