import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {readServiceV1Config,saveServiceV1Config} from "@/lib/service-v1-config";
export const runtime="nodejs";
export async function GET(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý Service V1."},{status:403});
 try {return NextResponse.json({staged:true,operational_cutover:false,configuration:readServiceV1Config(Number(req.nextUrl.searchParams.get("route_id")),auth.user.id)??null});}
 catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"Không đọc được cấu hình."},{status:400});}
}
export async function POST(req:NextRequest) {
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 if(!auth.user.is_root_admin)return NextResponse.json({error:"Chỉ Owner quản lý Service V1."},{status:403});
 try {return NextResponse.json({staged:true,operational_cutover:false,configuration:saveServiceV1Config(await req.json(),auth.user.id)});}
 catch(error) {return NextResponse.json({error:error instanceof Error?error.message:"Không lưu được cấu hình."},{status:400});}
}
