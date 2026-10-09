import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole,canAccessClient,getClientAccount} from '@/lib/auth';
import {listDrafts,deleteDrafts,saveDrafts,submitDrafts,draftView} from '@/lib/client-drafts';
import {CLIENT_FIELDS,parseClientFile} from '@/lib/client-order-import';
import {db} from '@/lib/db';
export const runtime='nodejs';
type Row=Record<string,unknown>;
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','SALES','CLIENT']);if(a.error)return a.error;
 try{
 const clientId=Number(req.nextUrl.searchParams.get('clientId')||0);
 let items=listDrafts(a.user,clientId||undefined);
 const state=req.nextUrl.searchParams.get('draftState'),group=req.nextUrl.searchParams.get('errorGroup'),route=req.nextUrl.searchParams.get('routeId');
 if(state)items=items.filter(d=>d.draft_state===state);
 if(group)items=items.filter(d=>d.error_group===group);
 if(route)items=items.filter(d=>Number(d.route_id)===Number(route));
 const q=(req.nextUrl.searchParams.get('q')||'').toLowerCase();
 if(q)items=items.filter(d=>String(d.order_id||'').toLowerCase().includes(q)||String(d.system_order_code||'').toLowerCase().includes(q));
 const page=Math.max(1,Number(req.nextUrl.searchParams.get('page'))||1),pageSize=req.nextUrl.searchParams.get('all')==='1'?Math.max(1,items.length):Math.min(1000,Math.max(1,Number(req.nextUrl.searchParams.get('pageSize'))||20));
 return NextResponse.json({items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize,totalPages:Math.ceil(items.length/pageSize)});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400})}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','SALES','CLIENT']);if(a.error)return a.error;
 try{
 let b:Row;
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
 const form=await req.formData(),file=form.get('file');
 if(!(file instanceof File)||file.size>5*1024*1024||!/[.](csv|xlsx)$/i.test(file.name))throw Error('Chọn CSV/XLSX tối đa 5 MB.');
 b={action:'preview',client_id:Number(form.get('client_id')),route_id:Number(form.get('route_id')),rows:await parseClientFile(Buffer.from(await file.arrayBuffer()),file.name)};
 }else b=await req.json();
 const clientId=a.user.role==='CLIENT'?a.user.id:Number(b.client_id),client=getClientAccount(clientId,true);
 if(!client||!canAccessClient(a.user,client))throw Error('Chọn Client hợp lệ trong phạm vi quyền.');
 if(b.action==='delete')return NextResponse.json(deleteDrafts(a.user,clientId,b.all?null:(Array.isArray(b.ids)?b.ids:[]).map(Number)));
 if(b.action==='purchase'){
 const ids=[...new Set((Array.isArray(b.ids)?b.ids:[]).map(Number))];
 for(const id of ids){const d=db.prepare('SELECT client_id FROM client_order_drafts WHERE id=? AND deleted_at IS NULL').get(id) as Row|undefined;if(!d||Number(d.client_id)!==clientId)throw Error('Không có quyền đặt Draft này.');}
 return NextResponse.json(submitDrafts(a.user,ids));
 }
 const rows=Array.isArray(b.rows)?b.rows as Row[]:[];if(!rows.length||rows.length>1000)throw Error('Nhập 1–1000 Draft.');
 if(b.action==='save')return NextResponse.json({orders:db.transaction(()=>rows.flatMap(row=>saveDrafts(a.user,clientId,Number(row.route_id||b.route_id),[row]))).immediate()});
 if(b.action==='preview'){
 const counts=new Map<string,number>();for(const row of rows){const key=String(row.order_id||'').trim();if(key)counts.set(key,(counts.get(key)||0)+1);}
 return NextResponse.json({rows:rows.map((row,index)=>{
 const id=Number(row.draft_id||0),old=id?db.prepare('SELECT * FROM client_order_drafts WHERE id=? AND client_id=? AND deleted_at IS NULL').get(id,clientId) as Row|undefined:undefined;
 if(id&&!old)throw Error('Không có quyền xem Draft.');
 const clean=Object.fromEntries(CLIENT_FIELDS.map(k=>[k,row[k]??'']));
 const d={...old,id:id||0,client_id:clientId,route_id:Number(row.route_id||b.route_id),input_json:JSON.stringify(clean),failure_reason:Object.hasOwn(row,"failure_reason")?row.failure_reason:old?.failure_reason};
 const v=draftView(d,a.user.role);
 if((counts.get(String(row.order_id||'').trim())||0)>1){v.reasons=[...(v.reasons||[]),'Client Order ID trùng trong batch.'];v.draft_state='needs_fix';v.error_group='DATA';if(v.pricing){v.pricing.reasons=v.reasons;v.pricing.eligible=false;}}
 return {row_number:index+1,input:clean,...v};
 })});
 }
 throw Error('Thao tác không hợp lệ.');
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400})}
}
