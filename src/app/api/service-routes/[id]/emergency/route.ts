import {NextRequest,NextResponse} from "next/server";
import ExcelJS from "exceljs";
import {requireUser} from "@/lib/auth";
import {emergencyStatus,startEmergencyHold,undoEmergencyHold,exportEmergencyHold} from "@/lib/emergency-hold";
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const id=Number((await params).id),holdId=Number(req.nextUrl.searchParams.get("hold_id"));
 if(holdId&&req.nextUrl.searchParams.get("format")==="xlsx"){
   const rows=exportEmergencyHold(auth.user,id,holdId);
   const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Emergency Hold");
   sheet.columns=[
     {header:"DMD ID gốc",key:"source_dmd_id",width:16},
     {header:"Client Order ID",key:"client_order_id",width:24},
     {header:"Trạng thái gốc",key:"original_status",width:20},
     {header:"Giá bán gốc (USD)",key:"original_selling_price",width:22},
     {header:"Route ID cũ",key:"source_route_id",width:15},
     {header:"Tracking cũ",key:"tracking",width:28},
     {header:"URL Label cũ",key:"label",width:30},
     {header:"Hold ID",key:"hold_id",width:12},
   ];for(const row of rows)sheet.addRow(row);
   sheet.getRow(1).font={bold:true};sheet.views=[{state:"frozen",ySplit:1}];
   const bytes=await workbook.xlsx.writeBuffer();
   return new NextResponse(new Uint8Array(bytes as ArrayBuffer),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="Emergency-Hold-'+holdId+'.xlsx"',"Cache-Control":"no-store"}});
  }
  return NextResponse.json(holdId?{orders:exportEmergencyHold(auth.user,id,holdId)}:{holds:emergencyStatus(auth.user,id),replacement_enabled:false});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
export async function POST(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const id=Number((await params).id),body=await req.json();
 if(body.action==="hold")return NextResponse.json(startEmergencyHold(auth.user,id,String(body.reason||"")));
 if(body.action==="undo")return NextResponse.json(undoEmergencyHold(auth.user,id,Number(body.hold_id)));
 return NextResponse.json({error:"Chỉ hỗ trợ Hold/Undo. Huỷ/tạo lại chưa được bật vì cần bảo toàn nghĩa vụ tài chính."},{status:409});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
