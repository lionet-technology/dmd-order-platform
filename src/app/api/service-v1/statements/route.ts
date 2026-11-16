import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndAccess} from '@/lib/vnd-operational';
import {vndStatementHistory,makeVndStatement} from '@/lib/vnd-statements';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES','CLIENT']);if(a.error)return a.error;
 try{const id=Number(req.nextUrl.searchParams.get('client_id'));vndAccess(a.user,id);
  const start=req.nextUrl.searchParams.get('period_start'),end=req.nextUrl.searchParams.get('period_end');
  return NextResponse.json(start&&end?makeVndStatement(id,start,end):{statements:vndStatementHistory(id)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được Statement.'},{status:400});}
}
