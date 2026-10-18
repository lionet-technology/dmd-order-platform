import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
import {casesFor,caseAction} from "@/lib/cases";
async function handleGET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;return NextResponse.json({items:casesFor(a.user),assignables:["ADMIN","SALES"].includes(a.user.role)?db.prepare("SELECT id,display_name,role FROM users WHERE active=1 AND role IN ('ADMIN','SALES') AND (?='ADMIN' OR id=?) ORDER BY display_name").all(a.user.role,a.user.id):[]});}
async function handlePOST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(caseAction(a.user,await req.json()));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
