import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {guardManualOrderRows} from '@/lib/manual-order-limit';
import {POST as saveOrder} from '../route';
export const runtime='nodejs';
// Preserve existing per-row validation/authorization and partial-success semantics.
export async function POST(req:NextRequest) {
 const auth=requireUser(req);if(auth.error)return auth.error;
 if(!['ADMIN','SALES'].includes(auth.user.role))return NextResponse.json({error:'Forbidden'},{status:403});
 try {
  const body=await req.json();
  if(!Array.isArray(body.rows)||!body.rows.length)throw Error('Nhập ít nhất 1 dòng Order.');
  guardManualOrderRows(body.rows);
  const results=[];
  for(const [index,row] of body.rows.entries()){
   const response=await saveOrder(new NextRequest(new URL('/api/orders',req.url),{method:'POST',headers:req.headers,body:JSON.stringify(row)}));
   const data=await response.json();
   results.push(response.ok?{index,ok:true}:{index,ok:false,error:data.error||'Không thể lưu'});
  }
  return NextResponse.json({results});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Không thể lưu'},{status:400})}
}
