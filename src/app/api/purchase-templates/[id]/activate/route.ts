import { NextRequest,NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime="nodejs";

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  try{
    const templateId=Number((await params).id);
    const body=await req.json();
    const versionId=Number(body.version_id||0);
    const version=db.prepare("SELECT * FROM purchase_template_versions WHERE id=? AND template_id=?").get(versionId,templateId) as Record<string,unknown>|undefined;
    if(!version)throw new Error("Version không thuộc Purchase Template.");
    const validation=JSON.parse(String(version.validation_json||"{}")) as {errors?:string[]};
    if(validation.errors?.length)throw new Error("Không thể activate template đang có lỗi validation.");
    db.transaction(()=>{
      db.prepare("UPDATE purchase_template_versions SET status='ARCHIVED' WHERE template_id=? AND status='ACTIVE'").run(templateId);
      db.prepare("UPDATE purchase_template_versions SET status='ACTIVE',activated_at=CURRENT_TIMESTAMP WHERE id=?").run(versionId);
      db.prepare("UPDATE purchase_templates SET active=1,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(auth.user.id,templateId);
    }).immediate();
    return NextResponse.json(db.prepare("SELECT * FROM purchase_template_versions WHERE id=?").get(versionId));
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể activate template."},{status:400});
  }
}
