import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndBusinessReport} from '@/lib/vnd-reporting';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['BOD']);if(a.error)return a.error;
 try{return NextResponse.json(vndBusinessReport(String(req.nextUrl.searchParams.get('month'))),{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được báo cáo.'},{status:400});}
}
