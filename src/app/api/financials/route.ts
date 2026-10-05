import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {accountFinancials,assertClientAccess,financialAction} from "@/lib/credit";
export const runtime="nodejs";
export async function GET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{const id=a.user.role==="CLIENT"?a.user.id:Number(req.nextUrl.searchParams.get("client_id"));assertClientAccess(a.user,id);return NextResponse.json(accountFinancials(id));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
export async function POST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{const b=await req.json();return NextResponse.json(financialAction(a.user,Number(b.client_id),b));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
