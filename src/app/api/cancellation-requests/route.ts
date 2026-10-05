import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
import {cancelOrder} from "@/lib/order-cancellation";
export async function GET(req:NextRequest){const a=requireUser(req,'ADMIN');if(a.error)return a.error;return NextResponse.json({items:db.prepare("SELECT * FROM cancellation_requests WHERE status='PENDING'").all()});}
export async function POST(req:NextRequest){const a=requireUser(req,'ADMIN');if(a.error)return a.error;try{const b=await req.json();return NextResponse.json(cancelOrder(Number(b.order_id),a.user));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
