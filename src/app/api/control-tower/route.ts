import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {controlTower} from "@/lib/control-tower";
async function handleGET(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{return NextResponse.json(controlTower(a.user));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}

export const GET=withFinancialPrivacy(handleGET);
