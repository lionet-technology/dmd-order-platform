import {NextRequest,NextResponse} from "next/server";
import {requireUser,canAccessClient,getClientAccount} from "@/lib/auth";
import {db} from "@/lib/db";
import {logInternalEvent} from "@/lib/order-audit";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=requireUser(req);if(auth.error)return auth.error;
 if(!["ADMIN","CLIENT","SALES"].includes(auth.user.role))return NextResponse.json({error:"Không có quyền hold."},{status:403});
 const id=Number((await params).id);
 const order=db.prepare("SELECT * FROM orders WHERE id=?").get(id) as Record<string,unknown>|undefined;
 if(!order)return NextResponse.json({error:"Không tìm thấy Order."},{status:404});
 const client=order.client_user_id?getClientAccount(Number(order.client_user_id)):undefined;
 if(auth.user.role!=="ADMIN"&&(!client||!canAccessClient(auth.user,client)))return NextResponse.json({error:"Không có quyền với Order này."},{status:403});
 try{
 const body=await req.json();if(typeof body.hold!=="boolean")throw new Error("hold phải là boolean.");
 const reason=String(body.reason||"").trim();if(body.hold&&!reason)throw new Error("Nhập lý do hold.");
 db.transaction(()=>{
 if(body.hold)db.prepare("INSERT INTO warehouse_order_holds(order_id,source,reason,created_by_user_id) VALUES (?,?,?,?)").run(id,auth.user.role,reason,auth.user.id);
 else db.prepare("UPDATE warehouse_order_holds SET released_at=CURRENT_TIMESTAMP,released_by_user_id=? WHERE order_id=? AND source=? AND released_at IS NULL").run(auth.user.id,id,auth.user.role);
 logInternalEvent({orderId:id,eventType:"WAREHOUSE_HOLD",summary:body.hold?"Hold xuất kho: "+reason:"Gỡ hold xuất kho: "+auth.user.role,actorId:auth.user.id,after:{hold:body.hold,source:auth.user.role}});
 }).immediate();
 return NextResponse.json({holds:db.prepare("SELECT * FROM warehouse_order_holds WHERE order_id=? AND released_at IS NULL").all(id)});
 }catch(error){return NextResponse.json({error:(error as Error).message},{status:400})}
}
