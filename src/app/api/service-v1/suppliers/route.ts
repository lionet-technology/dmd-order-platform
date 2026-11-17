import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndSupplierView,vndSupplierAction} from '@/lib/vnd-supplier';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 try{return NextResponse.json(vndSupplierView(a.user,req.nextUrl.searchParams.get('supplier')),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được Supplier.'},{status:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 try{return NextResponse.json(vndSupplierAction(a.user,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không xử lý được Supplier.'},{status:400});}
}
