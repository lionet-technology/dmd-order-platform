import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {applySupplierAddon,readSupplierAddons} from '@/lib/vnd-supplier-addons';

export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export function GET(req:NextRequest){
 const auth=requireAnyRole(req,['ADMIN','FINANCE','BOD']);
 if(auth.error)return auth.error;
 try{
  return NextResponse.json(readSupplierAddons(auth.user,req.nextUrl.searchParams.get('month')??undefined),{headers});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'Không tải được Supplier Add-on.'},{status:400,headers});
 }
}
export async function POST(req:NextRequest){
 const auth=requireAnyRole(req,['ADMIN','FINANCE','BOD']);
 if(auth.error)return auth.error;
 try{
  return NextResponse.json(applySupplierAddon(auth.user,await req.json()),{headers});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'Không ghi được Supplier Add-on.'},{status:400,headers});
 }
}
