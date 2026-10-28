import {purchaseService,safePricing} from './route-pricing';
import type {AuthUser} from './auth';

export function purchaseErrorType(message:string):'DATA'|'SYSTEM'{
 return /balance|credit|công nợ|quá hạn|khóa mua|khoá mua|thiếu|trùng|cân|weight|carton|không có quyền|không được phép|dịch vụ|hold|route đang|đơn đã huỷ/i.test(message)&&!/chưa có bảng giá|base rate|chưa có giá|chưa (có )?cấu hình|lỗi hệ thống|purchase thất bại/i.test(message)?'DATA':'SYSTEM';
}
// Each Order owns its own immediate transaction. Errors never undo successful
// reservations from earlier Orders, and the remaining Orders are still checked.
export function purchaseBatch(ids:number[],actor:AuthUser,expectedQuotes:Record<string,string>={}){
 const seen=new Set<number>();
 const results:Array<{id:number;status:'PURCHASED'|'FAILED';order_id?:string;pricing?:ReturnType<typeof safePricing>;error?:string;error_type?:'DATA'|'SYSTEM'}>=[];
 for(const id of ids){
  if(!Number.isSafeInteger(id)||id<=0||seen.has(id)){
   results.push({id,status:'FAILED',error:'Order ID không hợp lệ hoặc trùng trong batch.',error_type:'DATA'});continue;
  }
  seen.add(id);
  try{const o=purchaseService(id,actor,true,expectedQuotes[String(id)]);results.push({id,status:'PURCHASED',order_id:String(o.order_id||''),pricing:safePricing(o,'CLIENT')});}
  catch(e){const error=e instanceof Error?e.message:'Không thể mua đơn.';results.push({id,status:'FAILED',error,error_type:purchaseErrorType(error)});}
 }
 return {results,succeeded:results.filter(r=>r.status==='PURCHASED').length,failed:results.filter(r=>r.status==='FAILED').length};
}
