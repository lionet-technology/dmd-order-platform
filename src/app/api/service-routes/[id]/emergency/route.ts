import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {emergencyStatus,startEmergencyHold,undoEmergencyHold,exportEmergencyHold} from "@/lib/emergency-hold";
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const id=Number((await params).id),holdId=Number(req.nextUrl.searchParams.get("hold_id"));
 return NextResponse.json(holdId?{orders:exportEmergencyHold(auth.user,id,holdId)}:{holds:emergencyStatus(auth.user,id),replacement_enabled:false});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
export async function POST(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const id=Number((await params).id),body=await req.json();
 if(body.action==="hold")return NextResponse.json(startEmergencyHold(auth.user,id,String(body.reason||"")));
 if(body.action==="undo")return NextResponse.json(undoEmergencyHold(auth.user,id,Number(body.hold_id)));
 return NextResponse.json({error:"Chỉ hỗ trợ Hold/Undo. Huỷ/tạo lại chưa được bật vì cần bảo toàn nghĩa vụ tài chính."},{status:409});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
