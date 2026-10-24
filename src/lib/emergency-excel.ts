import ExcelJS from "exceljs";
import type {AuthUser} from "./auth";
import {emergencySwitchOrder} from "./emergency-switch";
import {recordEmergencyError,emergencyHoldDetails} from "./emergency-hold";

type Entry={order_id:number;client_order_id:string;route_id:number;estimate:string;hold_id:number;tracking_id:number;new_tracking:string;new_label_url:string;parse_error?:string};
const headers=["DMD ID gốc","Client Order ID","Giá bán gốc (USD)","Route ID cũ","Tracking ID cũ","Tracking cũ","Tracking mới","URL Label mới","Route ID mới","Estimated Net Cost mới (USD)","Hold ID","Trạng thái"];
export const EMERGENCY_EXCEL_HEADERS=headers;
export async function importEmergencyWorkbook(user:AuthUser,oldRouteId:number,holdId:number,file:ArrayBuffer){
 if(user.role!=="ADMIN")throw Error("Chỉ Admin được import Emergency.");
 if(file.byteLength>5_000_000)throw Error("Excel vượt quá 5 MB.");
 const workbook=new ExcelJS.Workbook();
 await workbook.xlsx.load(Buffer.from(file) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
 const sheet=workbook.worksheets[0];if(!sheet)throw Error("File không có sheet.");
 if(sheet.rowCount>2001)throw Error("File vượt quá 2.000 dòng.");
 const idx=headers.map(h=>{
  for(let i=1;i<=sheet.columnCount;i++)if(sheet.getRow(1).getCell(i).text.trim()===h)return i;
  throw Error("File thiếu cột: "+h);
 });
 const read=(row:ExcelJS.Row,k:number)=>{
  const cell=row.getCell(idx[k]);const v=cell.value;
  if(v&&typeof v==="object")throw Error("Không dùng công thức hoặc hyperlink ở dòng "+row.number+", cột "+headers[k]);
  const result=String(v??"").trim();
  if(result.startsWith("="))throw Error("File không cho phép công thức: dòng "+row.number);
  return result;
 };
 const groups=new Map<number,Entry[]>();
 const parseErrors:{order_id:number;client_order_id:string;error:string}[]=[];
 let skipped=0;
 for(let n=2;n<=sheet.rowCount;n++){
  const row=sheet.getRow(n);
  if(!row.hasValues)continue;
  // Parse independently so a bad row cannot discard other Orders' valid results.
  let orderId=0;
  try{
   orderId=Number(read(row,0));
   const value=read(row,8);
   if(!value){skipped++;continue;}
   if(!Number.isSafeInteger(orderId)||orderId<=0)throw Error("Dòng "+n+" có DMD ID sai.");
   const entry:Entry={order_id:orderId,client_order_id:read(row,1),route_id:Number(value),estimate:read(row,9),hold_id:Number(read(row,10)),
    tracking_id:Number(read(row,4)||0),new_tracking:read(row,6),new_label_url:read(row,7)};
   if(!Number.isSafeInteger(entry.route_id)||entry.route_id<=0||entry.hold_id!==holdId)entry.parse_error="Dòng "+n+" có Route/Hold ID sai.";
   if(!groups.has(orderId))groups.set(orderId,[]);
   groups.get(orderId)!.push(entry);
  }catch(e){
   const error=(e as Error).message;
   if(Number.isSafeInteger(orderId)&&orderId>0){
    if(!groups.has(orderId))groups.set(orderId,[]);
    groups.get(orderId)!.push({order_id:orderId,client_order_id:"",route_id:0,estimate:"",hold_id:holdId,tracking_id:0,new_tracking:"",new_label_url:"",parse_error:error});
   }else parseErrors.push({order_id:0,client_order_id:"Dòng "+n,error});
  }
 }
 if(groups.size>250)throw Error("Mỗi lần chỉ xử lý tối đa 250 Order.");
 const allowed=emergencyHoldDetails(user,oldRouteId,holdId);
 const lookup=new Map(allowed.map(x=>[Number(x.source_dmd_id),x]));
 const errors:{order_id:number;client_order_id:string;error:string}[]=parseErrors,successes:number[]=[];
 for(const [orderId,rows]of groups){
  const original=lookup.get(orderId);
  try{
   if(rows.some(r=>r.parse_error))throw Error(rows.find(r=>r.parse_error)!.parse_error);
   if(!original||rows.some(r=>r.client_order_id!==String(original.client_order_id)||r.route_id!==rows[0].route_id))throw Error("Order không thuộc Hold hoặc Route mới/Client Order ID không nhất quán.");
   const estimates=[...new Set(rows.map(r=>r.estimate).filter(Boolean))];
   if(estimates.length>1)throw Error("Estimated Net Cost của cùng Order không nhất quán.");
   const replacement=rows.some(r=>r.new_tracking||r.new_label_url);
   if(replacement&&rows.some(r=>!Number.isSafeInteger(r.tracking_id)||r.tracking_id<=0||!r.new_tracking||!r.new_label_url))throw Error("Khi thay Tracking/Label phải nhập đủ cả hai và Tracking ID cũ trên tất cả dòng Order.");
   const mappings=(replacement?rows:[]).map(r=>({old_tracking_id:r.tracking_id,new_tracking:r.new_tracking,new_label_url:r.new_label_url}));
   emergencySwitchOrder(user,holdId,orderId,rows[0].route_id,mappings,estimates[0]);
   successes.push(orderId);
  }catch(e){const error=(e as Error).message;if(original)recordEmergencyError(holdId,orderId,error);errors.push({order_id:orderId,client_order_id:String(original?.client_order_id||rows[0].client_order_id),error})}
 }
 return {processed:groups.size,success:successes.length,success_order_ids:successes,failed:errors.length,errors,skipped};
}
