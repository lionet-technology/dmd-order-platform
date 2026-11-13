import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {confirmedUpsV1Globals,saveUpsV1Globals,confirmUpsV1Globals} from "@/lib/ups-v1-globals";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý UPS globals."},{status:403});
 return NextResponse.json({staged:true,operational_cutover:false,confirmed:confirmedUpsV1Globals(auth.user.id)??null});
}
export async function POST(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý UPS globals."},{status:403});
 try{
  const body=await req.json();let result;
  if(body.action==="SAVE")result=saveUpsV1Globals(body,auth.user.id);
  else if(body.action==="CONFIRM")result=confirmUpsV1Globals(body,auth.user.id);
  else throw Error("Tác vụ global không hợp lệ.");
  return NextResponse.json({staged:true,operational_cutover:false,result});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"UPS globals lỗi."},{status:400});}
}
