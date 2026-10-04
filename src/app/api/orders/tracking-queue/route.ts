import { assertConfiguredPurchase,clientDraftAwaitingPurchase,purchaseService,orderQuote } from "@/lib/route-pricing";
import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { canonicalEnumValue } from "@/lib/enums";
import { addOrderTracking,normalizeTracking,updateOrderTracking } from "@/lib/order-operations";
import { ensureOrderShipmentStructure } from "@/lib/order-shipments";
import { validatePurchaseReadiness } from "@/lib/order-shipments";
import { resolveManifestTemplate,resolvePurchaseTemplate,validateManifestReadiness } from "@/lib/purchase-templates";
import { logAdminEvent,logOrderEvent } from "@/lib/order-audit";
import { readSheet } from "read-excel-file/node";
import writeXlsxFile from "write-excel-file/node";

export const runtime="nodejs";

type QueueRow={
  order_pk:number;system_order_code:string;client_order_id:string;customer:string;recipient_name:string;
  service:string;sub_service:string;carton_count:number;carton_slot:number;carton_id:number|null;supplier:string;
  expected_lot_count:number;tracking_id:number|null;tracking:string;label_url:string;
  purchase_status:string;purchase_issue:string;manifest_status:string;manifest_issue:string;
};

function baseOrders(service="",subService="",supplier=""){
  const where=["COALESCE(o.workflow_status,'')<>'CANCELLED'"];
  const params:unknown[]=[];
  if(service){where.push("o.service=?");params.push(service)}
  if(subService){where.push("o.sub_service=?");params.push(subService)}
  if(supplier){where.push("o.supplier=?");params.push(supplier)}
  return db.prepare(
    "SELECT o.* FROM orders o WHERE "+where.join(" AND ")+" ORDER BY COALESCE(o.created_at,o.updated_at) ASC,o.id ASC"
  ).all(...params) as Array<Record<string,unknown>>;
}

function queueRows(service="",subService="",supplier="",mode:"PURCHASE"|"MANIFEST"="PURCHASE"){
  const rows:QueueRow[]=[];
  for(const order of baseOrders(service,subService,supplier)){
    if(mode==="PURCHASE"&&clientDraftAwaitingPurchase(order))continue;
    const trackings=db.prepare("SELECT * FROM order_trackings WHERE order_id=? AND status='ACTIVE' ORDER BY id").all(order.id) as Array<Record<string,unknown>>;
    const cartonCount=Math.max(1,Number(order.carton_count||1));
    const trackingComplete=trackings.length>=cartonCount;
    const purchaseComplete=trackingComplete&&trackings.filter(row=>String(row.label_url||"").trim()).length>=cartonCount;
    if(mode==="PURCHASE"&&purchaseComplete)continue;
    if(mode==="MANIFEST"&&!trackings.length)continue;
    const count=Math.max(cartonCount,trackings.length);
    ensureOrderShipmentStructure(Number(order.id));
    const template=resolvePurchaseTemplate(order);
    const readiness=validatePurchaseReadiness(Number(order.id));
    const purchaseStatus=!template?"MISSING_TEMPLATE":readiness.ready?"READY":"MISSING_DATA";
    const purchaseIssue=!template?"Chưa có Purchase Template":readiness.issues.map(issue=>issue.message).join(" ");
    const manifestTemplate=resolveManifestTemplate(order);
    const manifestReadiness=validateManifestReadiness(Number(order.id));
    const manifestStatus=!manifestTemplate?"MISSING_TEMPLATE":manifestReadiness.ready?"READY":"MISSING_DATA";
    const manifestIssue=!manifestTemplate?"Chưa có Manifest Template":manifestReadiness.issues.map(issue=>issue.message).join(" ");
    const cartons=db.prepare("SELECT id FROM order_cartons WHERE order_id=? ORDER BY carton_number").all(order.id) as Array<{id:number}>;
    for(let index=0;index<count;index++){
      const carton=cartons[index];
      const tracking=trackings.find(row=>Number(row.carton_id||0)===Number(carton?.id||0))||trackings.filter(row=>!row.carton_id)[index];
      rows.push({
        order_pk:Number(order.id),system_order_code:String(order.system_order_code||""),client_order_id:String(order.order_id||""),
        customer:String(order.customer||""),recipient_name:String(order.recipient_name||""),service:String(order.service||""),
        sub_service:String(order.sub_service||""),carton_count:cartonCount,carton_slot:index+1,carton_id:carton?.id||null,supplier:String(order.supplier||""),
        expected_lot_count:Math.max(1,Number(order.expected_lot_count||1)),tracking_id:tracking?Number(tracking.id):null,
        tracking:String(tracking?.tracking||""),label_url:String(tracking?.label_url||""),
        purchase_status:purchaseStatus,purchase_issue:purchaseIssue,manifest_status:manifestStatus,manifest_issue:manifestIssue,
      });
    }
  }
  return rows;
}

function text(value:unknown){return String(value??"").trim()}
function norm(value:unknown){return text(value).toLowerCase()}
function cell(row:unknown[],headers:Map<string,number>,name:string){const index=headers.get(norm(name));return index===undefined?"":row[index]}

export async function GET(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const service=String(req.nextUrl.searchParams.get("service")||"");
  const subService=String(req.nextUrl.searchParams.get("sub_service")||"");
  const supplier=String(req.nextUrl.searchParams.get("supplier")||"");
  const mode=String(req.nextUrl.searchParams.get("mode")||"PURCHASE").toUpperCase()==="MANIFEST"?"MANIFEST":"PURCHASE";
  const rows=queueRows(service,subService,supplier,mode);
  if(req.nextUrl.searchParams.get("format")==="xlsx"){
    const headers=["DMD ID","Client Order ID","Client","Người nhận","Service","Sub-Service","Số lượng Carton","Carton số","Supplier","Số lượng Lô","Tracking","URL Label"];
    const excelRows=[
      headers.map(value=>({type:String,value,fontWeight:"bold" as const,backgroundColor:"#EAF0FF"})),
      ...rows.map(row=>[
        row.system_order_code,row.client_order_id,row.customer,row.recipient_name,row.service,row.sub_service,
        String(row.carton_count),String(row.carton_slot),row.supplier,String(row.expected_lot_count),row.tracking,row.label_url,
      ].map(value=>({type:String,value}))),
    ];
    const buffer=await writeXlsxFile(excelRows).toBuffer();
    return new NextResponse(new Uint8Array(buffer),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":"attachment; filename=dmd-tracking-label-queue.xlsx"}});
  }
  return NextResponse.json({rows,total:rows.length});
}

export async function PUT(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const form=await req.formData();const file=form.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"File Excel là bắt buộc."},{status:400});
    const sheet=await readSheet(Buffer.from(await file.arrayBuffer())) as unknown[][];
    if(!sheet.length)return NextResponse.json({error:"File không có dữ liệu."},{status:400});
    const headers=new Map<string,number>();sheet[0].forEach((value,index)=>headers.set(norm(value),index));
    if(!headers.has(norm("DMD ID"))||!headers.has(norm("Tracking")))return NextResponse.json({error:"File thiếu cột DMD ID hoặc Tracking."},{status:400});
    const rows:QueueRow[]=[];
    for(const source of sheet.slice(1)){
      const code=text(cell(source,headers,"DMD ID"));if(!code)continue;
      const order=db.prepare("SELECT * FROM orders WHERE system_order_code=?").get(code) as Record<string,unknown>|undefined;
      if(!order)throw new Error("Không tìm thấy "+code+".");
      const trackingValue=text(cell(source,headers,"Tracking"));
      const existing=trackingValue?db.prepare("SELECT id FROM order_trackings WHERE order_id=? AND normalized_tracking=UPPER(REPLACE(REPLACE(?,' ',''),'-',''))").get(order.id,trackingValue) as {id:number}|undefined:undefined;
      rows.push({
        order_pk:Number(order.id),system_order_code:String(order.system_order_code||""),client_order_id:String(order.order_id||""),
        customer:String(order.customer||""),recipient_name:String(order.recipient_name||""),service:String(order.service||""),
        sub_service:String(order.sub_service||""),carton_count:Number(order.carton_count||1),
        carton_slot:Number(cell(source,headers,"Carton số")||1),
        carton_id:(db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number=?").get(order.id,Number(cell(source,headers,"Carton số")||1)) as {id:number}|undefined)?.id||null,
        supplier:text(cell(source,headers,"Supplier"))||String(order.supplier||""),
        expected_lot_count:Math.max(1,Number(cell(source,headers,"Số lượng Lô")||order.expected_lot_count||1)),
        tracking_id:existing?.id||null,tracking:trackingValue,label_url:text(cell(source,headers,"URL Label")),
        purchase_status:"",purchase_issue:"",manifest_status:"",manifest_issue:"",
      });
    }
    return NextResponse.json({rows,total:rows.length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không đọc được file Excel."},{status:400})}
}

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const body=await req.json();const rows=Array.isArray(body.rows)?body.rows:[] as Array<Record<string,unknown>>;
    if(!rows.length)throw new Error("Không có dữ liệu Tracking/Label.");
    const groups=new Map<number,Array<Record<string,unknown>>>();
    for(const raw of rows as Array<Record<string,unknown>>){
      const orderId=Number(raw.order_pk||0);if(!orderId)throw new Error("Có dòng thiếu Order.");
      if(!groups.has(orderId))groups.set(orderId,[]);groups.get(orderId)?.push(raw);
    }
    let saved=0;
    const tx=db.transaction(()=>{
      for(const [orderId,group] of groups){
        const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as Record<string,unknown>|undefined;
        if(!order)throw new Error("Order không tồn tại.");
        const first=group[0];
        const supplier=text(first.supplier)?canonicalEnumValue("SUPPLIER",first.supplier):String(order.supplier||"");
        const subService=text(first.sub_service)?canonicalEnumValue("SUB_SERVICE",first.sub_service,String(order.service||"")):"";
        if(order.pricing_snapshot_json&&(supplier!==order.supplier||subService!==order.sub_service))throw new Error("Route đã khóa khi đặt mua.");
        const expectedLots=Math.max(1,Math.trunc(Number(first.expected_lot_count||order.expected_lot_count||1)));
        db.prepare("UPDATE orders SET sub_service=?,supplier=?,expected_lot_count=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(subService||null,supplier||null,expectedLots,auth.user.id,orderId);
        if(text(order.supplier)!==supplier||text(order.sub_service)!==subService){
          logAdminEvent({orderId,eventType:"PURCHASE_ROUTE_OVERRIDDEN",summary:"Admin điều chỉnh route mua đơn.",actorId:auth.user.id,source:"BULK",before:{sub_service:order.sub_service,supplier:order.supplier},after:{sub_service:subService,supplier}});
        }
        const current:Record<string,unknown>={...order,sub_service:subService,supplier};
        assertConfiguredPurchase(current);
        if(!current.pricing_snapshot_json&&orderQuote(current))purchaseService(orderId,auth.user,false);
        ensureOrderShipmentStructure(orderId);
        for(const raw of group){
          const tracking=text(raw.tracking);const label=text(raw.label_url);
          if(!tracking)continue;
          const cartonId=Number(raw.carton_id||0)||(
            db.prepare("SELECT id FROM order_cartons WHERE order_id=? AND carton_number=?").get(orderId,Math.max(1,Number(raw.carton_slot||1))) as {id:number}|undefined
          )?.id||null;
          const existingTracking=raw.tracking_id
            ? {id:Number(raw.tracking_id)}
            : db.prepare("SELECT id FROM order_trackings WHERE order_id=? AND normalized_tracking=? LIMIT 1").get(orderId,normalizeTracking(tracking)) as {id:number}|undefined;
          if(existingTracking)updateOrderTracking({orderId,id:existingTracking.id,labelUrl:label,cartonId});
          else addOrderTracking({orderId,tracking,labelUrl:label,cartonId,actorId:auth.user.id});
          saved++;
        }
        const progress=db.prepare("SELECT COUNT(*) active_count,SUM(CASE WHEN COALESCE(label_url,'')<>'' THEN 1 ELSE 0 END) label_count FROM order_trackings WHERE order_id=? AND status='ACTIVE'").get(orderId) as {active_count:number;label_count:number};
        const cartonCount=Math.max(1,Number(order.carton_count||1));
        const complete=progress.active_count>=cartonCount&&Number(progress.label_count||0)>=cartonCount;
        db.prepare("UPDATE orders SET workflow_status=?,purchase_completed_at=CASE WHEN ? THEN COALESCE(purchase_completed_at,CURRENT_TIMESTAMP) ELSE purchase_completed_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .run(complete?"PURCHASED":progress.active_count?"PURCHASING":"PENDING_PURCHASE",complete?1:0,orderId);
        logOrderEvent({orderId,eventType:"TRACKINGS_UPDATED",summary:"Bulk Tracking/Label: "+progress.active_count+"/"+cartonCount+" Tracking, "+Number(progress.label_count||0)+"/"+cartonCount+" Label; Số lượng Lô "+expectedLots+".",actorId:auth.user.id,source:"BULK",after:{sub_service:subService,expected_lot_count:expectedLots,...progress}});
      }
    });
    tx();
    return NextResponse.json({saved,orders:groups.size});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể lưu Tracking/Label"},{status:400})}
}
