import {guardManualOrderRows} from "@/lib/manual-order-limit";
import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {accountFinancials} from "@/lib/credit";
import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { upsertOrder } from "@/lib/finance";
import { CLIENT_FIELDS,parseClientFile } from "@/lib/client-order-import";
import {groupClientCartonRows} from '@/lib/client-carton-groups';
import {saveOrderShipmentStructure} from '@/lib/order-shipments';
import {maxCartonsForService} from '@/lib/carton-policy';
import {isManualPriceRoute} from '@/lib/manual-route-price';
import { activePricing,orderQuote,safePricing } from "@/lib/route-pricing";
import { logOrderEvent } from "@/lib/order-audit";
import { normalizeCountry } from "@/lib/epacket-pricing";
import {purchaseBatch} from '@/lib/client-bulk-purchase';
export const runtime="nodejs";
type Row=Record<string,unknown>;
async function handleGET(req:NextRequest){
 const auth=requireUser(req,"CLIENT");if(auth.error)return auth.error;
 const routes=(db.prepare("SELECT r.* FROM service_route_configs r WHERE r.active=1 AND r.client_self_purchase=1").all() as Row[]).filter(r=>activePricing(Number(r.id))||isManualPriceRoute(r.service)).map(r=>{
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(auth.user.id,String(r.service),String(r.sub_service),String(r.sub_service)) as Row|undefined;
 return setting?.is_enabled?{id:r.id,service:r.service,sub_service:r.sub_service,discount_percent:setting.discount_percent,currency:"USD",max_cartons_per_order:maxCartonsForService(r.service,r.max_cartons_per_order)}:null}).filter(Boolean);
 const balance=(db.prepare("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0) balance FROM ledger_entries WHERE client_user_id=?").get(auth.user.id) as {balance:number}).balance;
 return NextResponse.json({routes,balance,financials:accountFinancials(auth.user.id,{readOnly:true})});
}
async function handlePOST(req:NextRequest){
 const auth=requireUser(req,"CLIENT");if(auth.error)return auth.error;
 try{
 let body:Row;
 const fileImport=!!req.headers.get("content-type")?.includes("multipart/form-data");
 if(req.headers.get("content-type")?.includes("multipart/form-data")){
 const form=await req.formData(),file=form.get("file");
 if(!(file instanceof File)||file.size>5*1024*1024||!/[.](csv|xlsx)$/i.test(file.name))throw Error("Chọn CSV/XLSX tối đa 5 MB.");
 body={action:String(form.get("action")||"preview"),route_id:Number(form.get("route_id")),rows:groupClientCartonRows(await parseClientFile(Buffer.from(await file.arrayBuffer()),file.name))};
 }else body=await req.json();
 const action=String(body.action||"preview");
 if(action==="purchase"){
 const ids=Array.isArray(body.order_ids)?body.order_ids.map(Number):[];
 if(!ids.length||ids.length>1000)throw Error("Chọn 1–1000 Order.");
 return NextResponse.json(purchaseBatch(ids,auth.user,(body.expected_quotes&&typeof body.expected_quotes==="object"?body.expected_quotes:{}) as Record<string,string>));
 }
 const route=db.prepare("SELECT * FROM service_route_configs WHERE id=? AND active=1 AND client_self_purchase=1").get(Number(body.route_id)) as Row|undefined;
 if(!route)throw Error("Route chưa cho phép Client tự đặt mua.");
 const setting=db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=? AND lower(service)=lower(?) AND (lower(sub_service)=lower(?) OR sub_service='') ORDER BY CASE WHEN lower(sub_service)=lower(?) THEN 0 ELSE 1 END LIMIT 1").get(auth.user.id,String(route.service),String(route.sub_service),String(route.sub_service)) as Row|undefined;
 if(!setting?.is_enabled)throw Error("Client chưa được cấp dịch vụ.");
 const rows=Array.isArray(body.rows)?body.rows as Row[]:[];
 if(!rows.length||rows.length>1000)throw Error("Nhập 1–1000 Order.");
 if(!fileImport)guardManualOrderRows(rows);
 const seen=new Set<string>();
 const prepared=rows.map((row,index)=>{
 const old=row.id?db.prepare("SELECT * FROM orders WHERE id=? AND client_user_id=?").get(Number(row.id),auth.user.id) as Row|undefined:undefined;
 if(row.id&&(!old||old.pricing_snapshot_json||old.service_purchased_at||old.purchase_completed_at||["CANCELLED","PURCHASED","RECONCILED"].includes(String(old.workflow_status))))throw Error("Không được sửa Order này.");
 const cartons=Array.isArray(row.carton_rows)?row.carton_rows as Row[]:[row];
 const data:Row={...(old?{id:old.id,workflow_status:old.workflow_status}:{}),...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,row[k]])),client_user_id:auth.user.id,customer:auth.user.display_name,sales_user_id:auth.user.sales_user_id,service:route.service,sub_service:route.sub_service,supplier:route.supplier,discount:setting.discount_percent,carton_count:row.carton_count??1,country:normalizeCountry(row.country)};
 const normalized=groupClientCartonRows(cartons.map((c,i)=>i===0?{...c,...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,row[k]]))}:c));
 const errors:string[]=normalized.flatMap(g=>g.group_errors);
 if(normalized.length!==1||String(normalized[0]?.order_id||'').trim()!==String(row.order_id||'').trim())errors.push('Danh sách Carton chứa nhiều mã Order hoặc không khớp với Order đang khai báo.');
 const maxCartons=maxCartonsForService(route.service,route.max_cartons_per_order);
 if(cartons.length>maxCartons||Number(data.carton_count)>maxCartons)errors.push('Route chỉ cho phép tối đa '+maxCartons+' Carton/Order.');
 if(cartons.length!==Number(data.carton_count))errors.push('Carton Quantity phải bằng số dòng khai báo Carton.');
 for(const k of ["order_id","recipient_name","address1","city","state","zip","phone","item","material"])if(!String(data[k]||"").trim())errors.push("Thiếu "+k);
 const orderId=String(data.order_id||"").trim();
 if(seen.has(orderId))errors.push("Client Order ID trùng trong file.");seen.add(orderId);
 if(db.prepare("SELECT id FROM orders WHERE client_user_id=? AND order_id=? AND id<>?").get(auth.user.id,orderId,Number(old?.id||0)))errors.push("Client Order ID đã tồn tại; mở Draft để tiếp tục mua.");
 if(!Number.isFinite(Number(data.weight))||Number(data.weight)<=0)errors.push("Cân nặng phải >0.");
 if(!Number.isInteger(Number(data.carton_count))||Number(data.carton_count)<1)errors.push("Carton phải là số nguyên >=1.");
 const count=["length","width","height"].filter(k=>Number(data[k])>0).length;
 if(count!==0&&count!==3)errors.push("Nhập đủ Dài/Rộng/Cao.");
 if(count===0&&!(Number(data.manual_volume)>0))errors.push("Thiếu kích thước/thể tích.");
 const q=orderQuote(data);if(!q&&!isManualPriceRoute(route.service))errors.push('Route chưa có cơ chế báo giá tự động được duyệt; chưa thể mua dịch vụ.');
 const pricing=safePricing(data,"CLIENT");
 const reasons=[...errors,...(q?.reasons||[]),...(pricing?.reasons||[])];
 return {row_number:Number(row.row_number||index+1),data,cartons,errors,pricing:pricing?{...pricing,eligible:!reasons.length,reasons:reasons.length?reasons:pricing.reasons}:null};
 });
 if(action==="preview")return NextResponse.json({rows:prepared.map(({data,cartons,...r})=>({...r,input:{...(data.id?{id:data.id}:{}),...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,data[k]])),carton_rows:cartons.map(c=>Object.fromEntries([...CLIENT_FIELDS,'row_number'].map(k=>[k,c[k]])))}}))});
 if(action!=="save")throw Error("Thao tác không hợp lệ.");
 if(prepared.some(r=>r.errors.length))return NextResponse.json({error:"Sửa lỗi dữ liệu trước khi lưu Draft.",rows:prepared.map(({data,cartons,...r})=>({...r,input:{...(data.id?{id:data.id}:{}),...Object.fromEntries(CLIENT_FIELDS.map(k=>[k,data[k]])),carton_rows:cartons.map(c=>Object.fromEntries([...CLIENT_FIELDS,'row_number'].map(k=>[k,c[k]])))}}))},{status:422});
 const orders=db.transaction(()=>prepared.map(r=>{
 const saved=upsertOrder(r.data) as Row;
 if(r.cartons.length>1){
  saveOrderShipmentStructure(Number(saved.id),{lot_count:1,cartons:r.cartons.map((carton,index)=>({
   carton_number:index+1,lot_number:1,weight:Number(carton.weight),length:Number(carton.length)||null,width:Number(carton.width)||null,height:Number(carton.height)||null,volume:Number(carton.manual_volume)||null,
   items:[{sku:'CARTON-'+(index+1),description:String(carton.item||''),material:String(carton.material||''),quantity:1,unit_manufacturing_value:Number(carton.declared_value)||0}]
  }))});
 }
 db.prepare("UPDATE orders SET workflow_status=CASE WHEN workflow_status='HOLD' THEN 'HOLD' ELSE 'SALES_DRAFT' END,sales_user_id=?,created_by_user_id=COALESCE(created_by_user_id,?),updated_by_user_id=? WHERE id=?").run(auth.user.sales_user_id,auth.user.id,auth.user.id,Number(saved.id));
 logOrderEvent({orderId:Number(saved.id),eventType:r.data.id?"ORDER_UPDATED":"ORDER_CREATED",summary:"Client lưu Draft.",actorId:auth.user.id});
 return {id:saved.id,order_id:saved.order_id,pricing:safePricing(saved,"CLIENT")};
 })).immediate();
 return NextResponse.json({orders},{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Không thể xử lý Order."},{status:400})}
}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
