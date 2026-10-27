import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {db} from '@/lib/db';
import {InternalExpenses} from '@/lib/internal-expenses';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest){const a=requireAnyRole(req,['BOD','FINANCE']);if(a.error)return a.error;
 try{const service=new InternalExpenses(db),month=req.nextUrl.searchParams.get('month')||new Date(Date.now()+7*3600000).toISOString().slice(0,7);return NextResponse.json(db.transaction(()=>({items:service.list(a.user),report:service.report(a.user,month)})).deferred(),{headers});}catch(e){return NextResponse.json({error:(e as Error).message},{status:400,headers});}}
export async function POST(req:NextRequest){const a=requireAnyRole(req,['BOD','FINANCE']);if(a.error)return a.error;
 try{const body=await req.json();body.request_key=body.request_key||req.headers.get('Idempotency-Key');return NextResponse.json(new InternalExpenses(db).command(a.user,body),{headers});}catch(e){return NextResponse.json({error:(e as Error).message},{status:400,headers});}}
