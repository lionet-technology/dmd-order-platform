import {withFinancialPrivacy} from "@/lib/financial-privacy";
import {NextRequest,NextResponse} from "next/server";
import {requireAnyRole} from "@/lib/auth";
import {addManifestIdentifier,listManifestCartons,removeManifestIdentifier,createManifestCarton} from "@/lib/manifest-cartons";

export const runtime="nodejs";

async function handleGET(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  const limit=Number(req.nextUrl.searchParams.get("limit")||30);
  return NextResponse.json({cartons:listManifestCartons(limit)});
}

async function handlePOST(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  try{
    const body=await req.json();
    if(body.action==="create")return NextResponse.json(createManifestCarton(Number(body.route_config_id),body.segment_key?String(body.segment_key):undefined,auth.user.id),{status:201});
    if(body.mode && !["ADD","REMOVE"].includes(body.mode))throw new Error("Scan mode không hợp lệ.");
    const identifier=String(body.identifier||"");
    const cartonId=Number(body.manifest_carton_id||0)||undefined;
    if(body.mode==="REMOVE"){
      if(!cartonId)throw new Error("Chọn thùng để bốc hàng.");
      return NextResponse.json(removeManifestIdentifier(identifier,cartonId,auth.user.id));
    }
    return NextResponse.json(addManifestIdentifier(identifier,cartonId,auth.user.id),{status:201});
  }catch(error){
    return NextResponse.json({reason_code:(error as {reason_code?:string}).reason_code,error:error instanceof Error?error.message:"Không thể thêm Order vào thùng Manifest."},{status:400});
  }
}

export const GET=withFinancialPrivacy(handleGET);
export const POST=withFinancialPrivacy(handlePOST);
