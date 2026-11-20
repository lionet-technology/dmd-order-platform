import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {readVndMonthlyCommission} from '@/lib/vnd-commission-statements';
import {vndMonthlyCommissionExcel} from '@/lib/vnd-commission-export';

export const runtime='nodejs';

export async function GET(req:NextRequest){
 const auth=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES']);
 if(auth.error)return auth.error;
 try{
  const month=req.nextUrl.searchParams.get('month')??'';
  const statement=readVndMonthlyCommission(month,auth.user.role==='SALES'?auth.user.id:undefined);
  const headers={'Cache-Control':'private, no-store'};
  if(req.nextUrl.searchParams.get('format')==='xlsx'){
   return new NextResponse(await vndMonthlyCommissionExcel(statement),{headers:{
    ...headers,
    'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition':`attachment; filename="commission-statement-${month}.xlsx"`,
   }});
  }
  return NextResponse.json(statement,{headers});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'Không đọc được kỳ commission.'},{status:400});
 }
}
