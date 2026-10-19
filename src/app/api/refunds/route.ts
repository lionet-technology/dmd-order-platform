import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {db} from '@/lib/db';
import '@/lib/cases'; // Initialize the referenced Claim schema on a fresh installation.
import {RefundService} from '@/lib/refunds';
export const runtime='nodejs';
const roles=['ADMIN','SALES','CLIENT','FINANCE','BOD'] as const;
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,[...roles]);if(a.error)return a.error;
 try{const service=new RefundService(db),q=req.nextUrl.searchParams;
 const data=q.get('view')==='report'?service.report(a.user,String(q.get('start')),String(q.get('end'))):q.has('client_id')?{items:service.history(a.user,Number(q.get('client_id')))}:{items:service.overview(a.user),notifications:service.notifications(a.user)};
 return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const error=(e as Error).message;return NextResponse.json({error},{status:error==='Forbidden'?403:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,[...roles]);if(a.error)return a.error;
 try{const b=await req.json();b.request_key=b.request_key||req.headers.get('Idempotency-Key');const service=new RefundService(db);
 const data=b.action==='acknowledge'?service.acknowledge(a.user,Number(b.notification_id)):b.action==='batch'?service.batch(a.user,b):service.execute(a.user,b);
 return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const error=(e as Error).message;return NextResponse.json({error},{status:error==='Forbidden'?403:400});}
}
