import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {proposeRouteChange,confirmRouteChange,routeChangeProposals} from '@/lib/order-route-changes';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(routeChangeProposals(a.user,Number((await params).id)))}catch(e){return NextResponse.json({error:(e as Error).message},{status:400})}}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){const a=requireUser(req);if(a.error)return a.error;try{const b=await req.json(),id=Number((await params).id);return NextResponse.json(b.action==='confirm'?confirmRouteChange(a.user,id,Number(b.proposal_id)):proposeRouteChange(a.user,id,Number(b.route_id),String(b.reason||'')))}catch(e){return NextResponse.json({error:(e as Error).message},{status:400})}}
