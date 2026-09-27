import { NextRequest, NextResponse } from "next/server";
import { hashPassword, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
export const runtime="nodejs";

type ExistingUser={id:number;role:string;active:number;is_root_admin:number};

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  const id=Number((await params).id); const b=await req.json();
  const existing=db.prepare("SELECT id,role,active,is_root_admin FROM users WHERE id=?").get(id) as ExistingUser|undefined;
  if(!existing)return NextResponse.json({error:"User not found"},{status:404});

  if(existing.is_root_admin){
    if(id!==auth.user.id) return NextResponse.json({error:"Root Admin không thể bị thay đổi bởi tài khoản khác."},{status:403});
    if(b.active===false) return NextResponse.json({error:"Root Admin không thể bị khóa."},{status:400});
    if(b.role && String(b.role).toUpperCase()!=="ADMIN") return NextResponse.json({error:"Root Admin luôn phải giữ role ADMIN."},{status:400});
  }
  if(id===auth.user.id && b.active===false) return NextResponse.json({error:"Không thể tự khóa tài khoản đang đăng nhập."},{status:400});

  if(typeof b.active==="boolean") {
    db.prepare("UPDATE users SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(b.active?1:0,id);
    if(!b.active) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  }
  if(b.role!==undefined){
    const nextRole=String(b.role).toUpperCase();
    if(nextRole!=="ADMIN"&&nextRole!=="SALES") return NextResponse.json({error:"Role phải là ADMIN hoặc SALES."},{status:400});
    db.prepare("UPDATE users SET role=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(nextRole,id);
  }
  if(b.password) {
    if(existing.is_root_admin && id!==auth.user.id) return NextResponse.json({error:"Không thể reset password của Root Admin."},{status:403});
    db.prepare("UPDATE users SET password_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(hashPassword(String(b.password)),id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
  }
  return NextResponse.json(db.prepare("SELECT id,username,display_name,role,active,is_root_admin,created_at,updated_at FROM users WHERE id=?").get(id));
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN"); if(auth.error)return auth.error;
  const id=Number((await params).id);
  const existing=db.prepare("SELECT is_root_admin FROM users WHERE id=?").get(id) as {is_root_admin:number}|undefined;
  if(!existing)return NextResponse.json({error:"User not found"},{status:404});
  if(existing.is_root_admin)return NextResponse.json({error:"Root Admin không thể bị xóa."},{status:403});
  return NextResponse.json({error:"Không hỗ trợ xóa tài khoản. Hãy deactivate để giữ lịch sử dữ liệu."},{status:405});
}
