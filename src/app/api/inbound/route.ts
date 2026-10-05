import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {inboundFor,inboundAction} from "@/lib/inbound";
export async function GET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(inboundFor(a.user));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
export async function POST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(inboundAction(a.user,await req.json()));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
