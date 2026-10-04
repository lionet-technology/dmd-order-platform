import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {db} from "@/lib/db";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const body=await req.json();if(typeof body.hold!=="boolean")throw new Error("hold phải là boolean.");
 const id=Number((await params).id);
 const result=db.prepare("UPDATE service_route_configs SET warehouse_hold=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(body.hold?1:0,auth.user.id,id);
 if(!result.changes)return NextResponse.json({error:"Không tìm thấy route."},{status:404});
 return NextResponse.json({route_config_id:id,hold:body.hold});
 }catch(error){return NextResponse.json({error:(error as Error).message},{status:400})}
}
