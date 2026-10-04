import {NextRequest,NextResponse} from "next/server";
import {requireAnyRole} from "@/lib/auth";
import {addManifestIdentifier,listManifestCartons} from "@/lib/manifest-cartons";

export const runtime="nodejs";

export async function GET(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  const limit=Number(req.nextUrl.searchParams.get("limit")||30);
  return NextResponse.json({cartons:listManifestCartons(limit)});
}

export async function POST(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const identifier=String(body.identifier||"");
    const cartonId=Number(body.manifest_carton_id||0)||undefined;
    return NextResponse.json(addManifestIdentifier(identifier,cartonId,auth.user.id),{status:201});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không thể thêm Order vào thùng Manifest."},{status:400});
  }
}
