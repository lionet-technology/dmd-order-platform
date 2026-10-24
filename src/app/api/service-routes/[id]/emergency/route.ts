import {NextRequest,NextResponse} from "next/server";
import ExcelJS from "exceljs";
import {requireUser} from "@/lib/auth";
import {emergencyStatus,startEmergencyHold,undoEmergencyHold,emergencyHoldDetails} from "@/lib/emergency-hold";
import {emergencySwitchOrder} from "@/lib/emergency-switch";
import {EMERGENCY_EXCEL_HEADERS,importEmergencyWorkbook} from "@/lib/emergency-excel";
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const id=Number((await params).id),holdId=Number(req.nextUrl.searchParams.get("hold_id"));
 if(holdId&&req.nextUrl.searchParams.get("format")==="xlsx"){
   const rows=emergencyHoldDetails(auth.user,id,holdId);
   const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Emergency Hold");
   sheet.columns=EMERGENCY_EXCEL_HEADERS.map((header,index)=>({header,key:"col"+index,width:index===1||index===5||index===6||index===7?26:20}));
   for(const row of rows){
     const trackings=row.trackings as Array<{old_tracking_id:number;old_tracking:string}>;
     for(const tracking of trackings.length?trackings:[{old_tracking_id:0,old_tracking:""}]){
       sheet.addRow([row.source_dmd_id,row.client_order_id,row.original_selling_price,row.source_route_id,
         tracking.old_tracking_id||"",tracking.old_tracking,"","","","",row.hold_id,row.resolved_at?"Đã chuyển":"Đang Hold"]);
     }
   }
   sheet.getCell("I1").note="Nhập Route ID mới vào từng dòng cần đổi. Để trống = bỏ qua.";
   sheet.getCell("J1").note="Estimated Net Cost mới; để trống = giữ nguyên.";
   sheet.getRow(1).font={bold:true};sheet.views=[{state:"frozen",ySplit:1}];
   const bytes=await workbook.xlsx.writeBuffer();
   return new NextResponse(new Uint8Array(bytes as ArrayBuffer),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="Emergency-Hold-'+holdId+'.xlsx"',"Cache-Control":"no-store"}});
  }
  return NextResponse.json(holdId?{orders:emergencyHoldDetails(auth.user,id,holdId)}:{holds:emergencyStatus(auth.user,id),replacement_enabled:true});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
export async function POST(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const id=Number((await params).id);
 if(req.headers.get("content-type")?.includes("multipart/form-data")){
  const data=await req.formData();
  if(data.get("action")!=="import_switch_excel")throw Error("Tác vụ Excel không hợp lệ.");
  const holdId=Number(data.get("hold_id")),file=data.get("file");
  if(!(file instanceof File))throw Error("Cần chọn file .xlsx hợp lệ.");
  if(!emergencyStatus(auth.user,id).some((x)=>Number((x as Record<string,unknown>).id)===holdId&&!(x as Record<string,unknown>).undone_at))throw Error("Emergency Hold không thuộc Route đang mở.");
  return NextResponse.json(await importEmergencyWorkbook(auth.user,id,holdId,await file.arrayBuffer()));
 }
 const body=await req.json();
 if(body.action==="hold")return NextResponse.json(startEmergencyHold(auth.user,id,String(body.reason||"")));
 if(body.action==="undo")return NextResponse.json(undoEmergencyHold(auth.user,id,Number(body.hold_id)));
 if(body.action==="switch"){
  if(!emergencyStatus(auth.user,id).some((value)=>Number((value as Record<string,unknown>).id)===Number(body.hold_id)&&!(value as Record<string,unknown>).undone_at))throw Error("Emergency Hold không thuộc Route này hoặc đã đóng.");
  return NextResponse.json(emergencySwitchOrder(auth.user,Number(body.hold_id),Number(body.order_id),Number(body.new_route_id),body.trackings??[],body.estimated_net_cost));
 }
 return NextResponse.json({error:"Chỉ hỗ trợ Hold/Undo/đổi Route và Tracking trên chính Order. Huỷ/tạo lại không được dùng."},{status:409});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
