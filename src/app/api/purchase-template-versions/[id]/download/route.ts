import { NextRequest,NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime="nodejs";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
  const versionId=Number((await params).id);
  if(!Number.isSafeInteger(versionId)||versionId<1)return NextResponse.json({error:"Version không hợp lệ."},{status:400});
  const version=db.prepare(
    "SELECT pv.stored_path,pv.original_filename FROM purchase_template_versions pv JOIN purchase_templates pt ON pt.id=pv.template_id WHERE pv.id=? AND pv.status='ACTIVE' AND pt.active=1"
  ).get(versionId) as {stored_path:string;original_filename:string}|undefined;
  if(!version)return NextResponse.json({error:"Không tìm thấy template đang active."},{status:404});
  try{
    const buffer=await fs.readFile(version.stored_path);
    const filename=path.basename(version.original_filename).replace(/[\r\n"\\]/g,"_");
    return new NextResponse(new Uint8Array(buffer),{headers:{
      "content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":"attachment; filename=\"template.xlsx\"; filename*=UTF-8''"+encodeURIComponent(filename),
      "cache-control":"private, no-store",
      "x-content-type-options":"nosniff",
    }});
  }catch{
    return NextResponse.json({error:"Không thể đọc workbook template đang dùng."},{status:404});
  }
}
