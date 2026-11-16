import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {db} from '@/lib/db';
import {automaticVndOrderQuote,importFinalServiceNet} from '@/lib/service-v1-order-quote';
import {importFinalUpsAccounts} from '@/lib/ups-vnd-quote';
import {vndAccess} from '@/lib/vnd-operational';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES','CLIENT']);if(a.error)return a.error;
 try{
  const body=await req.json();
  if(body.action==='import-ups-accounts')return NextResponse.json({accounts:importFinalUpsAccounts(Number(body.route_id),a.user.id,String(body.request_key)),review_required:true});
  if(body.action==='import'){
   const result=importFinalServiceNet(Number(body.route_id),a.user.id,String(body.request_key));
   return NextResponse.json({id:result.id,kind:result.kind,config_id:result.config_id,review_required:true},{headers:{'Cache-Control':'private, no-store'}});
  }
  if(body.action!=='quote')throw Error('Tác vụ không hợp lệ.');
  const order=db.prepare('SELECT client_user_id FROM orders WHERE id=?').get(Number(body.order_id)) as {client_user_id:number}|undefined;
  if(!order)throw Error('Order không tồn tại.');
  vndAccess(a.user,order.client_user_id);
  const q=automaticVndOrderQuote(Number(body.order_id));
  // Explicit public projection: never expose source rows, Net, UPS accounts or raw snapshots.
  return NextResponse.json({currency:'VND',order_id:Number(body.order_id),total_vnd:q.total_vnd,selling_vnd:q.selling_vnd,surcharges:q.surcharges,config_version_id:q.config_version_id,price_version_id:q.price_version_id},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không xử lý được.'},{status:400});}
}
