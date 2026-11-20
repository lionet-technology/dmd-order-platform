import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {isVndClient,vndAccess} from '@/lib/vnd-operational';
import {db} from '@/lib/db';
import {vndStatementHistory,makeVndStatement,vndCreditStatus} from '@/lib/vnd-statements';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES','CLIENT']);if(a.error)return a.error;
 try{const id=Number(req.nextUrl.searchParams.get('client_id'));vndAccess(a.user,id);
  if(req.nextUrl.searchParams.get('credit_status')==='1'){
   const credit_term=db.transaction(()=>isVndClient(id)?vndCreditStatus(id):null).deferred();
   return NextResponse.json({credit_term},{headers:{'Cache-Control':'private, no-store'}});
  }
  const start=req.nextUrl.searchParams.get('period_start'),end=req.nextUrl.searchParams.get('period_end');
  return NextResponse.json(start&&end?makeVndStatement(id,start,end):{statements:vndStatementHistory(id)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được Statement.'},{status:400});}
}
