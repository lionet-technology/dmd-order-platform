import { NextRequest, NextResponse } from "next/server";
import { hashPassword, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  const id=Number((await params).id); const b=await req.json();
  if(id===auth.user.id && b.active===false) return NextResponse.json({error:"Không thể tự khóa tài khoản đang đăng nhập."},{status:400});
  const existing=db.prepare("SELECT id FROM users WHERE id=?").get(id);
  if(!existing)return NextResponse.json({error:"User not found"},{status:404});
  if(typeof b.active==="boolean") {
    db.prepare("UPDATE users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(b.active?1:0,id);
    if(!b.active) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  }
  if(b.password) {
    db.prepare("UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(hashPassword(String(b.password)),id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  }
  return NextResponse.json(db.prepare("SELECT id,username,display_name,role,active,created_at,updated_at FROM users WHERE id=?").get(id));
}
