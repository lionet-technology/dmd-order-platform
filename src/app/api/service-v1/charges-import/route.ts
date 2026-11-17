import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {vndView} from '@/lib/vnd-operational';
import {workbookRows} from '@/lib/importers';
import {vnd,compareVnd} from '@/lib/vnd-money';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,['ADMIN','SALES']);if(a.error)return a.error;
 try{
  const form=await req.formData(),clientId=Number(form.get('client_id'));vndView(clientId,a.user);
  const file=form.get('file');if(!(file instanceof File)||file.size>10*1024*1024)throw Error('Cần Excel tối đa 10 MB.');
  const [header,...rows]=await workbookRows(Buffer.from(await file.arrayBuffer())) as unknown as unknown[][];
  if((header??[]).map(c=>String(c??'').trim()).join('|')!=='Order ID|Loại|Số tiền VNĐ|Tham chiếu|Lý do')throw Error('Header: Order ID | Loại | Số tiền VNĐ | Tham chiếu | Lý do.');
  const items=rows.filter(r=>r.some(c=>c!==null&&String(c).trim()!=='')).map(r=>{
   if(typeof r[0]!=='string'||!r[0].trim())throw Error('Order ID phải là text.');
   const kind=String(r[1]??'').trim().toLowerCase(),amount=vnd(String(r[2]??''));
   if(!['surcharge','tax'].includes(kind)||compareVnd(amount,'0')<=0)throw Error('Loại surcharge/tax, số tiền dương.');
   return {order_code:r[0].trim(),kind,amount,reference:String(r[3]??'').trim(),reason:String(r[4]??'').trim()};
  });
  if(!items.length||items.length>200)throw Error('Import 1–200 dòng.');
  return NextResponse.json({client_id:clientId,items},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không đọc được file.'},{status:400});}
}
