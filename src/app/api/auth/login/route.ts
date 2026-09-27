import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
export const runtime="nodejs";
export async function POST(req: NextRequest) {
  const body=await req.json();
  const user=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1").get(String(body.username||"").trim()) as {id:number;password_hash:string;username:string;display_name:string;role:string}|undefined;
  if(!user || !verifyPassword(String(body.password||""),user.password_hash)) return NextResponse.json({error:"Sai tài khoản hoặc mật khẩu."},{status:401});
  const session=createSession(user.id);
  const res=NextResponse.json({ok:true,user:{id:user.id,username:user.username,display_name:user.display_name,role:user.role}});
  setSessionCookie(res,session.token,session.expires);
  return res;
}
