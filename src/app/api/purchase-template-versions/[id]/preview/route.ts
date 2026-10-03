import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { generatePreview } from "@/lib/purchase-templates";

export const runtime="nodejs";

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const versionId=Number((await params).id);
    const body=await req.json();
    const orderId=Number(body.order_id||0);
    if(!orderId)throw new Error("Chọn Order mẫu để tạo preview.");
    const result=await generatePreview(versionId,orderId);
    return new NextResponse(new Uint8Array(result.buffer),{headers:{
      "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":'attachment; filename="'+result.filename+'"',
    }});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể tạo preview."},{status:400});
  }
}
