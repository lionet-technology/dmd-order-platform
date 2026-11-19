import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndBusinessReport} from '@/lib/vnd-reporting';
import {vndCommissionExcel} from '@/lib/vnd-commission-export';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['BOD']);if(a.error)return a.error;
 try{
  const month=String(req.nextUrl.searchParams.get('month'));
  if(req.nextUrl.searchParams.get('format')==='xlsx'){
   return new NextResponse(await vndCommissionExcel(month),{headers:{
    'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition':'attachment; filename="commission-vnd-'+month+'.xlsx"',
    'Cache-Control':'private, no-store',
   }});
  }
  return NextResponse.json(vndBusinessReport(month),{headers:{'Cache-Control':'private, no-store'}});
 }
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được báo cáo.'},{status:400});}
}
