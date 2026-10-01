import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cancelOrder,CancellationError } from "@/lib/order-cancellation";
export const runtime="nodejs";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Order ID không hợp lệ."},{status:400});
  try{
    const body=await req.json();
    return NextResponse.json(cancelOrder(id,auth.user,body.reason));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể huỷ đơn."},{status:error instanceof CancellationError?error.status:400});
  }
}
