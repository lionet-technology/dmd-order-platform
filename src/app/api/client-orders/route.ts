import {saveDrafts,submitDrafts} from "@/lib/client-drafts";
import {accountFinancials} from "@/lib/credit";
import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CLIENT_FIELDS,parseClientFile } from "@/lib/client-order-import";
import { activePricing,orderQuote,purchaseService,safePricing } from "@/lib/route-pricing";
import { logOrderEvent } from "@/lib/order-audit";
import { normalizeCountry } from "@/lib/epacket-pricing";
export const runtime="nodejs";
type Row=Record<string,unknown>;
export async function GET(req:NextRequest){
 const auth=requireUser(req,"CLIENT");if(auth.error)return auth.error;
 const routes=(db.prepare("SELECT r.* FROM service_route_configs r WHERE r.active=1 AND r.client_self_purchase=1").all() as Row[]).filter(r=>activePricing(Number(r.id))).map(r=>{
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(auth.user.id,String(r.service),String(r.sub_service),String(r.sub_service)) as Row|undefined;
 return setting?.is_enabled?{id:r.id,service:r.service,sub_service:r.sub_service,discount_percent:setting.discount_percent,currency:"USD"}:null}).filter(Boolean);
 const balance=(db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries WHERE client_user_id=?").get(auth.user.id) as {balance:number}).balance;
 return NextResponse.json({routes,balance,financials:accountFinancials(auth.user.id)});
}
export async function POST(req:NextRequest){
 const auth=requireUser(req,"CLIENT");if(auth.error)return auth.error;
 try{
 let body:Row;
 if(req.headers.get("content-type")?.includes("multipart/form-data")){
 const form=await req.formData(),file=form.get("file");
 if(!(file instanceof File)||file.size>5*1024*1024||!/[.](csv|xlsx)$/i.test(file.name))throw Error("Chọn CSV/XLSX tối đa 5 MB.");
 body={action:"preview",route_id:Number(form.get("route_id")),rows:await parseClientFile(Buffer.from(await file.arrayBuffer()),file.name)};
 }else body=await req.json();
 const action=String(body.action||"preview");
 if(action==="purchase"&&Array.isArray(body.order_ids)&&(body.order_ids as unknown[]).every(id=>Number(id)<0)){return NextResponse.json(submitDrafts(auth.user,(body.order_ids as unknown[]).map(id=>-Number(id))));}
 if(action==="purchase"){
 const ids=Array.isArray(body.order_ids)?body.order_ids.map(Number):[];
 if(!ids.length||ids.length>1000)throw Error("Chọn 1–1000 Order.");
 const batch=db.prepare("SELECT id,order_id FROM orders WHERE client_user_id=? AND id IN ("+ids.map(()=>"?").join(",")+")").all(auth.user.id,...ids) as Row[];
 const counts=new Map<string,number>();for(const o of batch){const key=String(o.order_id||"").trim();counts.set(key,(counts.get(key)||0)+1)}
 const orders:Row[]=[],failures:Row[]=[];
 for(const id of ids){try{
 const row=batch.find(o=>Number(o.id)===id);if(!row)throw Error("Không có quyền đặt đơn này.");
 if((counts.get(String(row.order_id||"").trim())||0)>1)throw Error("Client Order ID trùng trong batch: "+row.order_id);
 const o=purchaseService(id,auth.user);orders.push({id:o.id,order_id:o.order_id,pricing:safePricing(o,"CLIENT")});
 }catch(e){const reason=(e as Error).message;failures.push({id,error:reason});if(batch.some(o=>Number(o.id)===id))logOrderEvent({orderId:id,eventType:"ORDER_UPDATED",summary:"Đặt thất bại: "+reason,actorId:auth.user.id});}}
 return NextResponse.json({orders,failures});
 }
 const route=db.prepare("SELECT * FROM service_route_configs WHERE id=? AND active=1 AND client_self_purchase=1").get(Number(body.route_id)) as Row|undefined;
 if(!route)throw Error("Route chưa cho phép Client tự đặt mua.");
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(auth.user.id,String(route.service),String(route.sub_service),String(route.sub_service)) as Row|undefined;
 if(!setting?.is_enabled)throw Error("Client chưa được cấp dịch vụ.");
 const rows=Array.isArray(body.rows)?body.rows as Row[]:[];
 if(!rows.length||rows.length>1000)throw Error("Nhập 1–1000 Order.");
 if(action==="save")return NextResponse.json({orders:saveDrafts(auth.user,auth.user.id,Number(route.id),rows)},{status:201});
 const seen=new Set<string>();
 const prepared=rows.map((row,index)=>{
 const old=Number(row.id)>0?db.prepare("SELECT * FROM orders WHERE id=? AND client_user_id=?").get(Number(row.id),auth.user.id) as Row|undefined:undefined;
 if(Number(row.id)>0&&(!old||old.pricing_snapshot_json||old.purchase_completed_at||["CANCELLED","PURCHASED","RECONCILED"].includes(String(old.workflow_status))))throw Error("Không được sửa Order này.");
 const data:Row={...(old?{id:old.id,workflow_status:old.workflow_status}:Number(row.id)<0?{id:row.id,draft_id:-Number(row.id)}:{}),...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,row[k]])),client_user_id:auth.user.id,customer:auth.user.display_name,sales_user_id:auth.user.sales_user_id,service:route.service,sub_service:route.sub_service,supplier:route.supplier,discount:setting.discount_percent,carton_count:row.carton_count??1,country:normalizeCountry(row.country)};
 const errors:string[]=[];
 for(const k of ["order_id","recipient_name","address1","city","state","zip","phone","item","material"])if(!String(data[k]||"").trim())errors.push("Thiếu "+k);
 const orderId=String(data.order_id||"").trim();
 if(seen.has(orderId))errors.push("Client Order ID trùng trong file.");seen.add(orderId);
 if(db.prepare("SELECT id FROM orders WHERE order_id=? AND client_user_id="+auth.user.id+" AND service_purchased_at IS NOT NULL AND id<>?").get(orderId,Number(old?.id||0)))errors.push("Client Order ID đã tồn tại; mở Draft để tiếp tục mua.");
 if(!Number.isFinite(Number(data.weight))||Number(data.weight)<=0)errors.push("Cân nặng phải >0.");
 if(!Number.isInteger(Number(data.carton_count))||Number(data.carton_count)<1)errors.push("Carton phải là số nguyên >=1.");
 const count=["length","width","height"].filter(k=>Number(data[k])>0).length;
 if(count!==0&&count!==3)errors.push("Nhập đủ Dài/Rộng/Cao.");
 if(count===0&&!(Number(data.manual_volume)>0))errors.push("Thiếu kích thước/thể tích.");
 const q=orderQuote(data);if(!q)errors.push("Chưa có giá active.");
 const pricing=safePricing(data,"CLIENT");
 const reasons=[...errors,...(q?.reasons||[]),...(pricing?.reasons||[])];
 return {row_number:Number(row.row_number||index+1),data,errors,pricing:pricing?{...pricing,eligible:!reasons.length,reasons}:null};
 });
 if(action==="preview")return NextResponse.json({rows:prepared.map(({data,...r})=>({...r,input:{...(data.id?{id:data.id}:{}),...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,data[k]]))}}))});
 throw Error("Thao tác không hợp lệ.");
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Không thể xử lý Order."},{status:400})}
}
