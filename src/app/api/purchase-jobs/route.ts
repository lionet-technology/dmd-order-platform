import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {purchaseJobAction} from "@/lib/credit";
import {purchaseBatch} from "@/lib/client-bulk-purchase";
import {purchaseService,safePricing} from "@/lib/route-pricing";
import {db} from "@/lib/db";
async function handleGET(req:NextRequest){const a=requireUser(req,'ADMIN');if(a.error)return a.error;return NextResponse.json({items:db.prepare("SELECT * FROM purchase_reserves ORDER BY updated_at DESC LIMIT 1000").all()});}
async function handlePOST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{const b=await req.json();if(b.action==='purchase'){if(a.user.role==='CLIENT')return NextResponse.json(purchaseBatch([Number(b.order_id)],a.user,{[String(b.order_id)]:b.expected_quote_key}));const o=purchaseService(Number(b.order_id),a.user);return NextResponse.json({id:o.id,pricing:safePricing(o,a.user.role)});}return NextResponse.json(purchaseJobAction(a.user,b));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
