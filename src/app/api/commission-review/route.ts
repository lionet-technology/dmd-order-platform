import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole,requireUser} from '@/lib/auth';
import {commissionReviewQueue,decideCommissionReview} from '@/lib/commission-review';
import {withFinancialPrivacy} from '@/lib/financial-privacy';
export const runtime='nodejs';
export const GET=withFinancialPrivacy(async(req:NextRequest)=>{
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE']);if(a.error)return a.error;
 try{return NextResponse.json({items:commissionReviewQueue(a.user)},{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
});
export const POST=withFinancialPrivacy(async(req:NextRequest)=>{
 const a=requireUser(req,'ADMIN');if(a.error)return a.error;
 try{const b=await req.json();return NextResponse.json(decideCommissionReview(a.user,b));}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
});
