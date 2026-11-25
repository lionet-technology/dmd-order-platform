import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {previewSupplierAdjustments} from '@/lib/vnd-supplier-import';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {workbookRows} from '@/lib/importers';
import {vndSupplierView,vndSupplierAction,supplierWorkbookFile} from '@/lib/vnd-supplier';
export const runtime='nodejs';
async function supplierInput(req:NextRequest){
 if(!req.headers.get('content-type')?.includes('multipart/form-data'))return {input:await req.json()};
 const form=await req.formData(),file=form.get('file');
 if(!(file instanceof File)||file.size>10*1024*1024)throw Error('Cần Excel tối đa 10 MB.');
 const bytes=Buffer.from(await file.arrayBuffer());
 await validateSupplierWorkbook(bytes);
 const workbook={name:file.name,bytes,sha256:createHash('sha256').update(bytes).digest('hex')};
 if(form.get('adjustment_mode')){
  const sheet=await parseAdjustments(bytes);
  const input={action:'stage_import_adjustments',supplier:form.get('supplier'),reason:form.get('reason'),request_key:form.get('request_key'),adjustments:sheet};
  return {workbook,input,preview:form.get('adjustment_mode')==='preview'};
 }
 const [header,...rows]=await workbookRows(bytes);
 if(form.get('template_id'))return {workbook,input:{
  action:'import_workbook',supplier:form.get('supplier'),reason:form.get('reason'),request_key:form.get('request_key'),
  template_id:form.get('template_id'),document:form.get('document'),file_name:file.name,grid:[header,...rows],
 }};
 const headings=(header??[]).map(c=>String(c??'').trim());
 const hasLabel=headings[0]==='Tracking'&&headings.length===6&&headings[5]==='URL Label';
 if(!['Tracking','Order ID'].includes(headings[0])||headings.slice(1,hasLabel?5:undefined).join('|')!=='Actual Net VNĐ|Cân Supplier kg|Tham chiếu|Lý do')throw Error('Header: Tracking (hoặc Order ID) | Actual Net VNĐ | Cân Supplier kg | Tham chiếu | Lý do.');
 const populated=rows.map((cells,index)=>({cells,position:index+2})).filter(({cells})=>cells.some(c=>c!==null&&String(c).trim()!==''));
 const items=populated.map(({cells:r}: {cells:unknown[];position:number})=>{
  if(typeof r[0]!=='string')throw Error('Tracking/Order ID phải là text để giữ số 0 đầu.');
  if(hasLabel&&r[5]!=null&&typeof r[5]!=='string')throw Error('URL Label phải là text.');
  return {[headings[0]==='Tracking'?'tracking':'order_code']:r[0],label_url:hasLabel?r[5]:null,kind:form.get('kind'),amount:String(r[1]??''),supplier_weight:r[2]===null||r[2]===undefined||r[2]===''?null:String(r[2]),reference:r[3],reason:r[4]||form.get('reason')};
 });
 return {workbook,input:{action:'import',supplier:form.get('supplier'),reason:form.get('reason'),request_key:form.get('request_key'),items,excel_rows:populated.map(row=>row.position)}};
}
async function validateSupplierWorkbook(bytes:Buffer){
 const zip=await JSZip.loadAsync(bytes);
 const entries=Object.values(zip.files).filter(entry=>!entry.dir);
 if(entries.length>256||!zip.file('xl/workbook.xml'))throw Error('Cấu trúc Excel không hợp lệ.');
 let expanded=0;
 for(const entry of entries){
  if(entry.name.startsWith('xl/externalLinks/')||/vbaProject\.bin$/i.test(entry.name))throw Error('Excel không được có macro hoặc liên kết workbook ngoài.');
  const sheet=/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name);
  const chunks:Buffer[]=[];
  const stream=new Readable().wrap(entry.nodeStream());
  for await(const chunk of stream){
   const buffer=typeof chunk==='string'?Buffer.from(chunk):chunk;
   expanded+=buffer.length;
   if(expanded>32*1024*1024)throw Error('Dữ liệu giải nén Excel vượt giới hạn.');
   if(sheet)chunks.push(buffer);
  }
  if(sheet){
   const xml=Buffer.concat(chunks).toString('utf8');
   if(/<(?:[\w.-]+:)?f(?=[\s/>])/.test(xml))throw Error('Excel chỉ nhận giá trị tĩnh. Hãy dán Values trước khi tải lên.');
   for(const match of xml.matchAll(/<(?:[\w.-]+:)?(?:row|c)\b[^>]*\br=["']([A-Z]*)([0-9]+)["']/g)){
    const col=[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
    if(col>256||Number(match[2])>12001)throw Error('Excel có ô nằm ngoài giới hạn hàng hoặc cột.');
   }
  }
 }
}
const columns=['Batch','Queue Row','Review Token','Tracking','Component ID','Group','Approved VNĐ','Supplier VNĐ','Proposed VNĐ'];
async function parseAdjustments(bytes:Buffer){
 const book=new ExcelJS.Workbook();
 await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0],{ignoreNodes:['mergeCells','dataValidations','conditionalFormatting','drawing','extLst']});
 const sheet=book.getWorksheet('Exception Queue');
 if(!sheet||book.worksheets.length!==1||sheet.columnCount!==columns.length||sheet.rowCount>12001||
  columns.some((value,i)=>sheet.getRow(1).getCell(i+1).value!==value))throw Error('Sai cấu trúc Excel Exception Queue.');
 const entries=new Map<number,{id:number;batch:string;token:string;tracking:string;groups:Record<string,string>;values:Record<string,string|null>}>();
 for(let i=2;i<=sheet.rowCount;i++){
  const row=sheet.getRow(i);
  if(!row.hasValues)continue;
  for(let j=1;j<=columns.length;j++){
   const v=row.getCell(j).value;
   if(v!==null&&typeof v!=='string'&&typeof v!=='number')throw Error('Chỉ dùng ô text hoặc số, không dùng công thức.');
  }
  const batch=row.getCell(1).value,id=Number(row.getCell(2).value),token=row.getCell(3).value;
  const tracking=row.getCell(4).value??'',component=row.getCell(5).value,group=row.getCell(6).value,amount=row.getCell(9).value;
  if(typeof batch!=='string'||!Number.isSafeInteger(id)||id<1||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||typeof component!=='string'||typeof tracking!=='string'||typeof group!=='string')throw Error('Mã dòng Excel không hợp lệ.');
  const entry=entries.get(id)??{id,batch,token,tracking,groups:Object.create(null) as Record<string,string>,values:Object.create(null) as Record<string,string|null>};
  if(entry.batch!==batch||entry.token!==token||entry.tracking!==tracking||Object.hasOwn(entry.values,component))throw Error('Dòng Excel trùng hoặc không khớp batch.');
  entry.groups[component]=group;
  entry.values[component]=amount===null||amount===''?null:String(amount);
  entries.set(id,entry);
 }
 return Array.from(entries.values());
}
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 try{
  const supplier=req.nextUrl.searchParams.get('supplier'),batch=req.nextUrl.searchParams.get('original_batch');
  if(batch!==null){
   const file=supplierWorkbookFile(a.user,supplier,batch);
   if(!file)return NextResponse.json({error:'Không tìm thấy file gốc.'},{status:404});
   return new NextResponse(new Uint8Array(file.workbook),{headers:{
    'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="supplier-quotation.xlsx"',
    'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store',
   }});
  }
  const view=vndSupplierView(a.user,supplier);
  if(req.nextUrl.searchParams.get('export_exceptions')==='1'){
   const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Exception Queue');
   sheet.addRow(columns);
   const pending=view.import_rows.filter(r=>!r.decision&&r.comparison&&!(r.data.parse_errors as unknown[]|undefined)?.length);
   const selected=req.nextUrl.searchParams.get('rows')?.split(',').map(Number);
   const rows=selected?pending.filter(r=>selected.includes(Number(r.id))):pending;
   if(rows.length>200)throw Error('Chọn tối đa 200 dòng cần xuất.');
   for(const r of rows)for(const component of r.data.components as {id:string;group:string;amount:string|null}[]){
    const old=r.comparison?.lines.find(line=>line.id===component.id)?.old??null;
    sheet.addRow([String(r.batch_key),String(r.id),r.token,String(r.data.tracking??''),component.id,component.group,old,r.supplier_components?.find(quoted=>quoted.id===component.id)?.amount??null,component.amount]);
   }
   if(sheet.rowCount===1)throw Error('Không có dòng thành phần để xuất.');
   const bytes=await book.xlsx.writeBuffer();
   return new NextResponse(new Uint8Array(bytes),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="supplier-exceptions.xlsx"','Cache-Control':'private, no-store'}});
  }
  return NextResponse.json(view,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được Supplier.'},{status:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','FINANCE','BOD']);if(a.error)return a.error;
 try{const {input,workbook,preview}=await supplierInput(req);
 if(preview){
  const view=vndSupplierView(a.user,input.supplier);
  return NextResponse.json({adjustments:previewSupplierAdjustments(view.supplier,input.adjustments)},{headers:{'Cache-Control':'private, no-store'}});
 }
 return NextResponse.json(vndSupplierAction(a.user,input,workbook),{headers:{'Cache-Control':'private, no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không xử lý được Supplier.'},{status:400});}
}
