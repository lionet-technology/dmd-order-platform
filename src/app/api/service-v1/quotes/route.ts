import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {createServiceV1Quote,serviceV1QuoteHistory} from "@/lib/service-v1-quote";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
 const auth=requireUser(req);if(auth.error)return auth.error;
 try{return NextResponse.json(serviceV1QuoteHistory(Number(req.nextUrl.searchParams.get("client_id")),auth.user.id));}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Báo giá lỗi."},{status:400});}
}
export async function POST(req:NextRequest) {
 const auth=requireUser(req);if(auth.error)return auth.error;
 try{return NextResponse.json(createServiceV1Quote(await req.json(),auth.user.id));}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Báo giá lỗi."},{status:400});}
}
