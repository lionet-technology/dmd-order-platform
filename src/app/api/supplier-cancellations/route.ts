import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {supplierCancellationQueue,updateSupplierCancellation,supplierVoidQueue,submitSupplierVoid} from '@/lib/supplier-cancellation';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 if(!['ADMIN','FINANCE','BOD'].includes(a.user.role))return NextResponse.json({error:'Forbidden'},{status:403});
 try{
 const supplier=req.nextUrl.searchParams.get('supplier')||undefined,status=req.nextUrl.searchParams.get('status')||undefined;
 const incidentRaw=req.nextUrl.searchParams.get('incident');
 const incident=incidentRaw===null?undefined:Number(incidentRaw);
 if(incident!==undefined&&(!Number.isSafeInteger(incident)||incident<=0))throw Error('Incident ID không hợp lệ.');
 const voidCases=supplierVoidQueue(a.user,{supplier,status,incident});
 const items=incident===undefined&&!['CONFIRMED','DENIED','EXPIRED'].includes(status??'')?supplierCancellationQueue(a.user,{supplier,status}):[];
 return NextResponse.json({items,void_cases:voidCases},{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 if(!['ADMIN','FINANCE','BOD'].includes(a.user.role))return NextResponse.json({error:'Forbidden'},{status:403});
 try{
 const body=await req.json();
 return NextResponse.json(body.action===undefined?updateSupplierCancellation(a.user,body):submitSupplierVoid(a.user,body));
 }
 catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
