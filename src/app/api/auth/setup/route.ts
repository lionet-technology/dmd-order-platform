import { NextRequest, NextResponse } from "next/server";
import { createSession, createUser, setSessionCookie, userCount } from "@/lib/auth";
export const runtime="nodejs";
export async function POST(req: NextRequest) {
  try {
    if (userCount()>0) return NextResponse.json({error:"Setup đã hoàn tất."},{status:409});
    const body=await req.json();
    const user=createUser({username:body.username,display_name:body.display_name,password:body.password,role:"ADMIN"}) as {id:number};
    const session=createSession(user.id);
    const res=NextResponse.json({ok:true,user},{status:201});
    setSessionCookie(res,session.token,session.expires);
    return res;
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Setup failed"},{status:400});
  }
}
