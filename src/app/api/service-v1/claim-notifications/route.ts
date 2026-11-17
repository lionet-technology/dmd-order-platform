import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndClaimNotifications,acknowledgeVndClaim} from '@/lib/vnd-refunds';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['CLIENT','SALES']);if(a.error)return a.error;
 try{return NextResponse.json({items:vndClaimNotifications(a.user,Number(req.nextUrl.searchParams.get('client_id')))},{headers});}catch{return NextResponse.json({error:'Không đọc được thông báo.'},{status:403,headers});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['CLIENT','SALES']);if(a.error)return a.error;
 try{const b=await req.json();return NextResponse.json(acknowledgeVndClaim(a.user,Number(b.client_id),Number(b.id)),{headers});}catch{return NextResponse.json({error:'Không xác nhận được thông báo.'},{status:403,headers});}
}
