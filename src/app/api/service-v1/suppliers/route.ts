import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {workbookRows} from '@/lib/importers';
import {vndSupplierView,vndSupplierAction} from '@/lib/vnd-supplier';
export const runtime='nodejs';
async function supplierInput(req:NextRequest){
 if(!req.headers.get('content-type')?.includes('multipart/form-data'))return req.json();
 const form=await req.formData(),file=form.get('file');
 if(!(file instanceof File)||file.size>10*1024*1024)throw Error('Cần Excel tối đa 10 MB.');
 const [header,...rows]=await workbookRows(Buffer.from(await file.arrayBuffer())) as unknown as unknown[][];
 if(form.get('template_id'))return {
  action:'import_workbook',supplier:form.get('supplier'),reason:form.get('reason'),request_key:form.get('request_key'),
  template_id:form.get('template_id'),document:form.get('document'),file_name:file.name,grid:[header,...rows],
 };
 const headings=(header??[]).map(c=>String(c??'').trim());
 if(!['Tracking','Order ID'].includes(headings[0])||headings.slice(1).join('|')!=='Actual Net VNĐ|Cân Supplier kg|Tham chiếu|Lý do')throw Error('Header: Tracking (hoặc Order ID) | Actual Net VNĐ | Cân Supplier kg | Tham chiếu | Lý do.');
 const items=rows.filter(r=>r.some(c=>c!==null&&String(c).trim()!=='')).map(r=>{
  if(typeof r[0]!=='string')throw Error('Tracking/Order ID phải là text để giữ số 0 đầu.');
  return {[headings[0]==='Tracking'?'tracking':'order_code']:r[0],kind:form.get('kind'),amount:String(r[1]??''),supplier_weight:r[2]===null||r[2]===undefined||r[2]===''?null:String(r[2]),reference:r[3],reason:r[4]||form.get('reason')};
 });
 return {action:'import',supplier:form.get('supplier'),reason:form.get('reason'),request_key:form.get('request_key'),items};
}
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 try{return NextResponse.json(vndSupplierView(a.user,req.nextUrl.searchParams.get('supplier')),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được Supplier.'},{status:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 try{return NextResponse.json(vndSupplierAction(a.user,await supplierInput(req)),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không xử lý được Supplier.'},{status:400});}
}
