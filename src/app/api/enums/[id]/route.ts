import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { updateEnumValue } from "@/lib/enums";

export const runtime="nodejs";

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  try{
    const {id}=await params;
    const body=await req.json();
    return NextResponse.json(updateEnumValue(Number(id),body,auth.user.id));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể cập nhật enum."},{status:400});
  }
}
