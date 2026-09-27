import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createEnumValue, enumRows } from "@/lib/enums";

export const runtime="nodejs";

export async function GET(req:NextRequest){
  const auth=requireUser(req); if(auth.error)return auth.error;
  const all=req.nextUrl.searchParams.get("all")==="1";
  if(all&&auth.user.role!=="ADMIN")return NextResponse.json({error:"Admin only."},{status:403});
  return NextResponse.json(enumRows(!all));
}

export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  try{
    const body=await req.json();
    return NextResponse.json(createEnumValue(body,auth.user.id),{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể tạo enum."},{status:400});
  }
}
