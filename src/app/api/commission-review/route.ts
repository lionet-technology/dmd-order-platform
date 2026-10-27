import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {commissionMonthlyReport} from '@/lib/commission-report';
import {withFinancialPrivacy} from '@/lib/financial-privacy';
export const runtime='nodejs';
export const GET=withFinancialPrivacy(async(req:NextRequest)=>{
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE']);if(a.error)return a.error;
 try{return NextResponse.json(commissionMonthlyReport(a.user,req.nextUrl.searchParams.get('month')||new Date(Date.now()+7*3600000).toISOString().slice(0,7)),{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
});
export const POST=withFinancialPrivacy(async(req:NextRequest)=>{
 const a=requireAnyRole(req,['ADMIN']);if(a.error)return a.error;
 return NextResponse.json({error:'Đã ngừng duyệt hoa hồng từng Order. Dùng báo cáo Sales/tháng để tính thủ công.'},{status:410});
});
