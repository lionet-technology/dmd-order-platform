import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {db} from '@/lib/db';
import {vndAccess,vndAction} from '@/lib/vnd-operational';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','FINANCE','SALES','CLIENT']);if(a.error)return a.error;
 try{
  const client=Number(req.nextUrl.searchParams.get('client_id'));vndAccess(a.user,client);
  const rows=db.prepare('SELECT * FROM vnd_addons WHERE client_id=? ORDER BY id DESC').all(client) as Array<Record<string,unknown>>;
  return NextResponse.json({addons:rows.map(r=>a.user.role==='CLIENT'?{id:r.id,name:r.name,revenue:r.revenue,revision:r.revision,created_at:r.created_at}:r),history:a.user.role==='CLIENT'?[]:db.prepare('SELECT h.* FROM vnd_addon_history h JOIN vnd_addons a ON a.id=h.addon_id WHERE a.client_id=? ORDER BY h.id').all(client)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được Add-on.'},{status:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','BOD','SALES']);if(a.error)return a.error;
 try{const body=await req.json();if(!['addon','addon_edit'].includes(body.action))throw Error('Tác vụ Add-on không hợp lệ.');vndAction(a.user,body);return NextResponse.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không ghi được Add-on.'},{status:400});}
}
