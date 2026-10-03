import { NextRequest, NextResponse } from "next/server";
import { canAccessClient, getClientAccount, requireUser } from "@/lib/auth";
import { db, queryAll, queryOne } from "@/lib/db";
import { pageParams, paged } from "@/lib/pagination";
import { upsertOrder } from "@/lib/finance";
import { listOrderTrackings,publicOrderTracking } from "@/lib/order-operations";
import { logOrderEvent,publicNoteText,sanitizePrivateNoteForSales } from "@/lib/order-audit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  const {page,pageSize,q,offset}=pageParams(req);
  const where:string[]=[];
  const params:unknown[]=[];

  if(auth.user.role==="SALES"){
    where.push("client_user_id IN (SELECT id FROM users WHERE role='CLIENT' AND sales_user_id=?)");
    params.push(auth.user.id);
  } else if(auth.user.role==="CLIENT"){
    where.push("client_user_id=?");
    params.push(auth.user.id);
  }

  if(q){
    const bulkTerms=[...new Set(q.split(/[\n,]+/).map(term=>term.trim()).filter(Boolean))];
    if(bulkTerms.length>1){
      const clauses:string[]=[];
      for(const term of bulkTerms){
        const normalized=term.toUpperCase().replace(/[\s-]+/g,"");
        clauses.push("(lower(COALESCE(system_order_code,''))=lower(?) OR lower(COALESCE(order_id,''))=lower(?) OR UPPER(REPLACE(REPLACE(COALESCE(tracking,''),' ',''),'-',''))=? OR EXISTS(SELECT 1 FROM order_trackings ot WHERE ot.order_id=orders.id AND ot.normalized_tracking=?))");
        params.push(term,term,normalized,normalized);
      }
      where.push("("+clauses.join(" OR ")+")");
    }else{
      where.push("(system_order_code LIKE ? OR order_id LIKE ? OR tracking LIKE ? OR customer LIKE ? OR recipient_name LIKE ? OR service LIKE ? OR sales LIKE ? OR EXISTS(SELECT 1 FROM order_trackings ot WHERE ot.order_id=orders.id AND ot.tracking LIKE ?))");
      const like="%"+q+"%";
      params.push(like,like,like,like,like,like,like,like);
    }
  }
  const status=String(req.nextUrl.searchParams.get("status")||"").trim();
  const service=String(req.nextUrl.searchParams.get("service")||"").trim();
  const reconcile=String(req.nextUrl.searchParams.get("reconcile")||"").trim();
  const salesUserRaw=String(req.nextUrl.searchParams.get("salesUserId")||"").trim();
  if(status){where.push("workflow_status=?");params.push(status);}
  if(service){where.push("service=?");params.push(service);}
  if(reconcile){where.push("reconciliation_status=?");params.push(reconcile);}
  if(auth.user.role==="ADMIN"&&salesUserRaw){
    const salesUserId=/^\d+$/.test(salesUserRaw)
      ? Number(salesUserRaw)
      : (db.prepare("SELECT id FROM users WHERE role='SALES' AND active=1 AND (lower(display_name)=lower(?) OR lower(username)=lower(?)) LIMIT 1").get(salesUserRaw,salesUserRaw) as {id:number}|undefined)?.id;
    if(salesUserId){
      where.push("(client_user_id IN (SELECT id FROM users WHERE role='CLIENT' AND sales_user_id=?) OR (client_user_id IS NULL AND sales_user_id=?))");
      params.push(salesUserId,salesUserId);
    } else where.push("1=0");
  }
  const whereSql=where.length?" WHERE "+where.join(" AND "):"";
  const total=queryOne<{c:number}>("SELECT COUNT(*) c FROM orders"+whereSql,params)?.c||0;
  const rawItems=queryAll<Record<string,unknown>>(
    "SELECT * FROM orders"+whereSql+" ORDER BY COALESCE(created_at,updated_at) DESC,id DESC LIMIT ? OFFSET ?",
    [...params,pageSize,offset],
  );
  const items=rawItems.map(order=>{
    const trackings=listOrderTrackings(Number(order.id),auth.user.role==="ADMIN");
    const visible=auth.user.role==="ADMIN"?trackings:trackings.filter(row=>row.status==="ACTIVE").map(publicOrderTracking);
    const active=visible.filter(row=>row.status==="ACTIVE");
    const payload={...order,tracking:active.find(row=>row.is_primary)?.tracking||active[0]?.tracking||null,tracking_count:active.length,tracking_data:JSON.stringify(visible),trackings:visible};
    if(auth.user.role==="ADMIN")return payload;
    const safe:Record<string,unknown>={...payload};
    safe.public_note=publicNoteText(Number(order.id));
    delete safe.note;
    for(const key of ["supplier","est_net_cost","true_net_cost","base_cost","retail","gross_profit_base","gross_profit_net","gross_margin_pct","margin_status","reconciliation_delta"])delete safe[key];
    if(auth.user.role==="CLIENT")for(const key of ["internal_note","discount_note","discount_source"])delete safe[key];
    else safe.internal_note=sanitizePrivateNoteForSales(order.internal_note,order.supplier);
    return safe;
  });
  return NextResponse.json(paged(items,total,page,pageSize));
}

export async function POST(req: NextRequest) {
  const auth=requireUser(req); if(auth.error)return auth.error;
  if(auth.user.role==="CLIENT")return NextResponse.json({error:"Client chỉ có quyền xem Orders."},{status:403});

  try {
    const body=await req.json();
    const before=body.id?db.prepare("SELECT * FROM orders WHERE id=?").get(Number(body.id)):undefined;

    if(auth.user.role==="SALES"){
      const client=getClientAccount(body.client_user_id,true);
      if(!client)return NextResponse.json({error:"Hãy chọn Client hợp lệ trước khi lưu Order."},{status:400});
      if(!canAccessClient(auth.user,client))return NextResponse.json({error:"Client này không thuộc Sales đang đăng nhập."},{status:403});

      if(body.id){
        const owned=db.prepare("SELECT id,client_user_id FROM orders WHERE id=?").get(Number(body.id)) as {id:number;client_user_id:number|null}|undefined;
        if(!owned)return NextResponse.json({error:"Order không tồn tại."},{status:404});
        const existingClient=owned.client_user_id?getClientAccount(owned.client_user_id):undefined;
        if(!existingClient||!canAccessClient(auth.user,existingClient))return NextResponse.json({error:"Không có quyền sửa order này."},{status:403});
      } else {
        const orderId=String(body.order_id||"").trim();
        if(orderId){
          const others=db.prepare("SELECT id,client_user_id FROM orders WHERE order_id=?").all(orderId) as Array<{id:number;client_user_id:number|null}>;
          if(others.some(x=>x.client_user_id!==client.id))return NextResponse.json({error:"Order ID đã thuộc Client khác."},{status:409});
        }
      }

      const salesBody={
        ...body,
        client_user_id:client.id,
        customer:client.display_name,
        sales:auth.user.display_name,
        supplier:undefined,label:undefined,tracking:undefined,est_net_cost:undefined,base_cost:undefined,
        retail:undefined,sales_price:undefined,surcharge:undefined,import_tax:undefined,total_due:undefined,
        auto_pricing:undefined,volume:undefined,chargeable_weight:undefined,
      };
      const saved=upsertOrder(salesBody) as {id:number};
      db.prepare("UPDATE orders SET client_user_id=?,sales_user_id=?,customer=?,sales=?,created_by_user_id=COALESCE(created_by_user_id,?),updated_by_user_id=? WHERE id=?")
        .run(client.id,auth.user.id,client.display_name,auth.user.display_name,auth.user.id,auth.user.id,saved.id);
      const after=db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id);
      logOrderEvent({orderId:saved.id,eventType:body.id?"ORDER_UPDATED":"ORDER_CREATED",summary:body.id?"Cập nhật thông tin Order.":"Tạo Order mới.",actorId:auth.user.id,before,after});
      const record={...(after as Record<string,unknown>)};
      delete record.note;
      record.public_note=publicNoteText(saved.id);
      record.internal_note=sanitizePrivateNoteForSales(record.internal_note,record.supplier);
      for(const key of ["supplier","est_net_cost","true_net_cost","base_cost","retail","gross_profit_base","gross_profit_net","gross_margin_pct","margin_status","reconciliation_delta"])delete record[key];
      return NextResponse.json(record,{status:body.id?200:201});
    }

    let salesName=String(body.sales||"").trim();
    let salesUserId:number|null=null;
    let clientUserId:number|null=null;
    const clientRaw=String(body.client_user_id||"").trim();

    if(clientRaw){
      const client=getClientAccount(clientRaw,!body.id);
      if(!client)return NextResponse.json({error:"Client account không hợp lệ."},{status:400});
      if(!client.sales_user_id)return NextResponse.json({error:"Client chưa được gán Sales phụ trách."},{status:400});
      const salesUser=db.prepare("SELECT id,display_name FROM users WHERE id=? AND role='SALES'").get(client.sales_user_id) as {id:number;display_name:string}|undefined;
      if(!salesUser)return NextResponse.json({error:"Sales phụ trách của Client không còn hợp lệ."},{status:400});
      clientUserId=client.id;
      salesUserId=salesUser.id;
      salesName=salesUser.display_name;
      body.customer=client.display_name;
      body.client_user_id=client.id;
    } else {
      const salesUserRaw=String(body.sales_user_id||"").trim();
      if(salesUserRaw){
        const salesUser=/^\d+$/.test(salesUserRaw)
          ? db.prepare("SELECT id,display_name FROM users WHERE id=? AND role='SALES' AND active=1").get(Number(salesUserRaw)) as {id:number;display_name:string}|undefined
          : db.prepare("SELECT id,display_name FROM users WHERE role='SALES' AND active=1 AND (lower(display_name)=lower(?) OR lower(username)=lower(?)) LIMIT 1").get(salesUserRaw,salesUserRaw) as {id:number;display_name:string}|undefined;
        if(!salesUser)return NextResponse.json({error:"Sales account không hợp lệ. Hãy chọn hoặc nhập đúng tên/username Sales."},{status:400});
        salesUserId=salesUser.id;
        salesName=salesUser.display_name;
      }
    }

    const saved=upsertOrder({...body,client_user_id:clientUserId??body.client_user_id,sales:salesName}) as {id:number};
    db.prepare("UPDATE orders SET client_user_id=COALESCE(?,client_user_id),sales_user_id=COALESCE(?,sales_user_id),created_by_user_id=COALESCE(created_by_user_id,?),updated_by_user_id=? WHERE id=?")
      .run(clientUserId,salesUserId,auth.user.id,auth.user.id,saved.id);
    const after=db.prepare("SELECT * FROM orders WHERE id=?").get(saved.id);
    logOrderEvent({orderId:saved.id,eventType:body.id?"ORDER_UPDATED":"ORDER_CREATED",summary:body.id?"Cập nhật thông tin Order.":"Tạo Order mới.",actorId:auth.user.id,before,after});
    return NextResponse.json(after,{status:body.id?200:201});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể lưu order" }, { status: 400 });
  }
}
