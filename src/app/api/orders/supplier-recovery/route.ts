import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {supplierRecoveryWorklist} from '@/lib/vnd-supplier-recovery-worklist';

export function GET(req:NextRequest){
 const auth=requireAnyRole(req,['ADMIN','FINANCE','BOD']);
 if(auth.error)return auth.error;
 return NextResponse.json({items:supplierRecoveryWorklist(auth.user)},{headers:{'Cache-Control':'private, no-store'}});
}
