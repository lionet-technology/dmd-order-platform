import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {claimAction,recoveriesFor} from "@/lib/claims";
export async function GET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json({items:recoveriesFor(a.user)});}catch(e){return NextResponse.json({error:(e as Error).message},{status:403});}}
export async function POST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(claimAction(a.user,await req.json()));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
