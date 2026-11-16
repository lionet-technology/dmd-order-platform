import {withFinancialPrivacy} from '@/lib/financial-privacy';
import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndAction,vndView} from '@/lib/vnd-operational';
export const runtime='nodejs';
export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
async function handleGET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES','CLIENT']);if(a.error)return a.error;
 try{return NextResponse.json(vndView(Number(req.nextUrl.searchParams.get('client_id')),a.user));}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không thể đọc tài khoản.'},{status:400});}
}
async function handlePOST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES','CLIENT']);if(a.error)return a.error;
 try{return NextResponse.json(vndAction(a.user,await req.json()));}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không thể xử lý.'},{status:400});}
}
