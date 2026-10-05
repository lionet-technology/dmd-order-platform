import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {purchaseJobAction} from "@/lib/credit";
import {purchaseService,safePricing} from "@/lib/route-pricing";
import {db} from "@/lib/db";
export async function GET(req:NextRequest){const a=requireUser(req,'ADMIN');if(a.error)return a.error;return NextResponse.json({items:db.prepare("SELECT * FROM purchase_reserves ORDER BY updated_at DESC LIMIT 1000").all()});}
export async function POST(req:NextRequest){const a=requireUser(req);if(a.error)return a.error;try{const b=await req.json();if(b.action==='purchase'){const o=purchaseService(Number(b.order_id),a.user);return NextResponse.json({id:o.id,pricing:safePricing(o,a.user.role)});}return NextResponse.json(purchaseJobAction(a.user,b));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
