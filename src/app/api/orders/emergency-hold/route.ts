import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {emergencyOrdersWorkspace,startEmergencyHold,startSubServiceEmergencyHold} from "@/lib/emergency-hold";

export function GET(req:NextRequest){
 const auth=requireUser(req,"ADMIN");
 if(auth.error)return auth.error;
 return NextResponse.json(emergencyOrdersWorkspace(auth.user),{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req:NextRequest){
 const auth=requireUser(req,"ADMIN");
 if(auth.error)return auth.error;
 try{
  const {route_id,scope,reason}=await req.json();
  if(!Number.isSafeInteger(route_id)||route_id<1||typeof reason!=="string"||!reason.trim()||reason.length>2000)
   throw Error("Cần chọn Route và nhập lý do hợp lệ.");
  if(scope==="SUB_SERVICE")return NextResponse.json(startSubServiceEmergencyHold(auth.user,route_id,reason));
  if(scope==="ROUTE")return NextResponse.json(startEmergencyHold(auth.user,route_id,reason));
  throw Error("Phạm vi Emergency Hold không hợp lệ.");
 }catch(e){
  return NextResponse.json({error:(e as Error).message},{status:409});
 }
}
