import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {saveServiceV1Fx,confirmServiceV1Fx,serviceV1FxWorkspace} from '@/lib/service-v1-fx';
export const runtime='nodejs';
export async function GET(req:NextRequest){const auth=requireUser(req,'ADMIN');if(auth.error)return auth.error;try{return NextResponse.json(serviceV1FxWorkspace(auth.user.id));}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
export async function POST(req:NextRequest){const auth=requireUser(req,'ADMIN');if(auth.error)return auth.error;try{const body=await req.json();if(body.action==='SAVE')return NextResponse.json(saveServiceV1Fx(body,auth.user.id));if(body.action==='CONFIRM')return NextResponse.json(confirmServiceV1Fx(body,auth.user.id));throw Error('Tác vụ Rate không hợp lệ.');}catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}}
