import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {casesFor,caseAction} from "@/lib/cases";
export async function GET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;return NextResponse.json({items:casesFor(a.user)});}
export async function POST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(caseAction(a.user,await req.json()));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
