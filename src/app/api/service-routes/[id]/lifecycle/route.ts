import {NextRequest,NextResponse} from "next/server";
import {requireUser} from "@/lib/auth";
import {setRouteState,routeState,type RouteState} from "@/lib/route-lifecycle";
type Context={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{return NextResponse.json({state:routeState(Number((await params).id))});}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
export async function POST(req:NextRequest,{params}:Context){
 const auth=requireUser(req,"ADMIN");if(auth.error)return auth.error;
 try{const body=await req.json();return NextResponse.json(setRouteState(auth.user,Number((await params).id),String(body.state||"") as RouteState,String(body.reason||"")));}
 catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}
}
