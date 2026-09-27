import { NextRequest, NextResponse } from "next/server";
import { createUser, requireUser } from "@/lib/auth";
import { queryAll } from "@/lib/db";
export const runtime="nodejs";
export async function GET(req:NextRequest){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  return NextResponse.json(queryAll("SELECT id,username,display_name,role,active,created_at,updated_at FROM users ORDER BY role,id"));
}
export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  try{
    const b=await req.json();
    return NextResponse.json(createUser({
      username:b.username,display_name:b.display_name,password:b.password,
      role:b.role==="ADMIN"?"ADMIN":"SALES",created_by_user_id:auth.user.id
    }),{status:201});
  } catch(error){
    const msg=error instanceof Error?error.message:"Không tạo được tài khoản";
    return NextResponse.json({error:msg.includes("UNIQUE")?"Username đã tồn tại.":msg},{status:400});
  }
}
