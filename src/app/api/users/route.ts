import { NextRequest, NextResponse } from "next/server";
import { createUser, requireUser, type UserRole } from "@/lib/auth";
import { queryAll } from "@/lib/db";
export const runtime="nodejs";
export async function GET(req:NextRequest){
  const auth=requireUser(req); if(auth.error)return auth.error;
  const select="SELECT u.id,u.username,u.display_name,u.role,u.sales_user_id,u.active,u.is_root_admin,u.created_at,u.updated_at,s.display_name sales_display_name FROM users u LEFT JOIN users s ON s.id=u.sales_user_id";
  if(auth.user.role==="ADMIN"){
    return NextResponse.json(queryAll(select+" ORDER BY u.is_root_admin DESC,u.role,u.id"));
  }
  if(auth.user.role==="SALES"){
    return NextResponse.json(queryAll(select+" WHERE u.role='CLIENT' AND u.sales_user_id=? ORDER BY u.active DESC,u.display_name,u.id",[auth.user.id]));
  }
  return NextResponse.json(queryAll(select+" WHERE u.id=?",[auth.user.id]));
}
export async function POST(req:NextRequest){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  try{
    const b=await req.json();
    const role=String(b.role||"").toUpperCase();
    if(!["ADMIN","SALES","CLIENT","WAREHOUSE"].includes(role)) return NextResponse.json({error:"Role phải là ADMIN, SALES, CLIENT hoặc WAREHOUSE."},{status:400});
    return NextResponse.json(createUser({
      username:b.username,display_name:b.display_name,password:b.password,
      role:role as UserRole,sales_user_id:b.sales_user_id,created_by_user_id:auth.user.id
    }),{status:201});
  } catch(error){
    const msg=error instanceof Error?error.message:"Không tạo được tài khoản";
    return NextResponse.json({error:msg.includes("UNIQUE")?"Username đã tồn tại.":msg},{status:400});
  }
}
