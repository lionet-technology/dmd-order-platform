import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {createServiceV1Net,createServiceV1Proposal,serviceV1PriceEvent,serviceV1PriceWorkspace} from "@/lib/service-v1-pricing";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý pricing V1."},{status:403});
 try{return NextResponse.json(serviceV1PriceWorkspace(Number(req.nextUrl.searchParams.get("route_id")),auth.user.id));}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pricing V1 lỗi."},{status:400});}
}
export async function POST(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý pricing V1."},{status:403});
 try{
  const body=await req.json();let result;
  if(body.action==="CREATE_NET")result=createServiceV1Net(body,auth.user.id);
  else if(body.action==="CREATE_PROPOSAL")result=createServiceV1Proposal(body,auth.user.id);
  else if(body.action==="REVIEW"||body.action==="PUBLISH")result=serviceV1PriceEvent(body,auth.user.id);
  else throw Error("Tác vụ V1 không hợp lệ.");
  return NextResponse.json({staged:true,operational_cutover:false,result});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Pricing V1 lỗi."},{status:400});}
}
