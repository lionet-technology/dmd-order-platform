import {withFinancialPrivacy} from "@/lib/financial-privacy";
import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cancelOrder,CancellationError } from "@/lib/order-cancellation";
export const runtime="nodejs";
async function handlePOST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req);if(auth.error)return auth.error;
  const id=Number((await params).id);
  if(!Number.isSafeInteger(id)||id<=0)return NextResponse.json({error:"Order ID không hợp lệ."},{status:400});
  try{
    return NextResponse.json(cancelOrder(id,auth.user));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể huỷ đơn."},{status:error instanceof CancellationError?error.status:400});
  }
}

export const POST=withFinancialPrivacy(handlePOST);
