import { NextRequest,NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { lookupManifestTracking } from "@/lib/purchase-templates";
export const runtime="nodejs";
export async function POST(req:NextRequest){
  const auth=requireAnyRole(req,["ADMIN","WAREHOUSE"]);if(auth.error)return auth.error;
  try{const body=await req.json();return NextResponse.json({item:lookupManifestTracking(String(body.tracking||""))})}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Không thể scan Tracking"},{status:400})}
}
