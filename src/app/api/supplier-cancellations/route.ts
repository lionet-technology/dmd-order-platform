import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {supplierCancellationQueue,updateSupplierCancellation} from '@/lib/supplier-cancellation';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 if(!['ADMIN','FINANCE','BOD'].includes(a.user.role))return NextResponse.json({error:'Forbidden'},{status:403});
 try{return NextResponse.json({items:supplierCancellationQueue(a.user,{supplier:req.nextUrl.searchParams.get('supplier')||undefined,status:req.nextUrl.searchParams.get('status')||undefined})},{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 if(!['ADMIN','FINANCE','BOD'].includes(a.user.role))return NextResponse.json({error:'Forbidden'},{status:403});
 try{return NextResponse.json(updateSupplierCancellation(a.user,await req.json()));}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
