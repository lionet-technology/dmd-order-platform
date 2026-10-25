import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {bodFinanceReport} from '@/lib/bod-finance-report';
import {bodCommercialOverview} from '@/lib/bod-commercial';
import {withFinancialPrivacy} from '@/lib/financial-privacy';
export const runtime='nodejs';
async function handleGET(req:NextRequest){
 const a=requireAnyRole(req,['BOD','FINANCE']);if(a.error)return a.error;
 try{
  const q=req.nextUrl.searchParams;
  if(q.has('month'))return NextResponse.json(bodCommercialOverview(a.user,String(q.get('month')),Number(q.get('months')||6)),{headers:{'Cache-Control':'private, no-store'}});
  return NextResponse.json(bodFinanceReport(a.user,String(q.get('start')||''),String(q.get('end')||'')),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
export const GET=withFinancialPrivacy(handleGET);
