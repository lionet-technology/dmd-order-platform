import { NextRequest,NextResponse } from "next/server";
import { canAccessClient,getClientAccount,requireUser,type AuthUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrderShipmentStructure,saveOrderShipmentStructure,validatePurchaseReadiness } from "@/lib/order-shipments";
import { logInternalEvent } from "@/lib/order-audit";

export const runtime="nodejs";

function accessible(user:AuthUser,orderId:number){
  const order=db.prepare("SELECT id,client_user_id,workflow_status FROM orders WHERE id=?").get(orderId) as {id:number;client_user_id:number|null;workflow_status:string}|undefined;
  if(!order)return {error:NextResponse.json({error:"Order không tồn tại."},{status:404})};
  if(user.role!=="ADMIN"){
    const client=order.client_user_id?getClientAccount(order.client_user_id):undefined;
    if(!client||!canAccessClient(user,client))return {error:NextResponse.json({error:"Không có quyền truy cập Order này."},{status:403})};
  }
  return {order};
}

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);
  const access=accessible(auth.user,id);if(access.error)return access.error;
  const structure=getOrderShipmentStructure(id);
  const readiness=auth.user.role==="ADMIN"?validatePurchaseReadiness(id):undefined;
  return NextResponse.json({...structure,readiness});
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  if(auth.user.role==="CLIENT")return NextResponse.json({error:"Client chỉ được xem khai báo kiện hàng."},{status:403});
  const id=Number((await params).id);
  const access=accessible(auth.user,id);if(access.error)return access.error;
  try{
    const before=getOrderShipmentStructure(id);
    const body=await req.json();
    const after=saveOrderShipmentStructure(id,body);
    logInternalEvent({orderId:id,eventType:"SHIPMENT_STRUCTURE_UPDATED",summary:"Cập nhật khai báo Lot, Carton và SKU.",actorId:auth.user.id,before,after});
    return NextResponse.json(after);
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể lưu khai báo kiện hàng."},{status:400});
  }
}
