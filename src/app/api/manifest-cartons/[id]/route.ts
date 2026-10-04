import {NextRequest,NextResponse} from "next/server";
import {requireAnyRole} from "@/lib/auth";
import {changeManifestStatus,closeManifestCarton,manifestCartonDetail,removeManifestItem} from "@/lib/manifest-cartons";

export const runtime="nodejs";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  try{return NextResponse.json(manifestCartonDetail(Number((await params).id)))}
  catch(error){return NextResponse.json({reason_code:(error as {reason_code?:string}).reason_code,error:error instanceof Error?error.message:"Không thể tải thùng Manifest."},{status:404})}
}

export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  try{
    const id=Number((await params).id);const body=await req.json();
    if(body.action==="remove")return NextResponse.json(removeManifestItem(id,Number(body.item_id||0),auth.user.id));
    if(["pause","resume","reopen"].includes(body.action))return NextResponse.json(changeManifestStatus(id,body.action,auth.user.id));
    if(body.action==="close")return NextResponse.json(closeManifestCarton(id,auth.user.id));
    throw new Error("Thao tác không hợp lệ.");
  }catch(error){return NextResponse.json({reason_code:(error as {reason_code?:string}).reason_code,error:error instanceof Error?error.message:"Không thể cập nhật thùng Manifest."},{status:400})}
}
