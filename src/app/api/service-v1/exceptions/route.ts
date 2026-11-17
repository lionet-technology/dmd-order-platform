import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndExceptions} from '@/lib/vnd-exceptions';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD','SALES','CLIENT']);if(a.error)return a.error;
 try{return NextResponse.json(vndExceptions(a.user),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được ngoại lệ.'},{status:400});}
}
