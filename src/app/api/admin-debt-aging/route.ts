import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {accountFinancials,localDay,validDay} from '@/lib/credit';
export const runtime='nodejs';
export async function POST(req:NextRequest){
 const auth=requireUser(req);if(auth.error)return auth.error;
 if(auth.user.role!=='ADMIN')return NextResponse.json({error:'Chỉ Admin được xác nhận mốc mở sổ tuổi nợ.'},{status:403});
 try{
  const b=await req.json(),client=Number(b.client_id),amount=Number(b.amount);
  const day=validDay(b.reference_day),reason=String(b.reason||'').trim();
  if(!Number.isSafeInteger(client)||client<1||!Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(Math.round(amount*100))||Math.abs(amount*100-Math.round(amount*100))>0.000001||!reason||reason.length<8||day>localDay())throw Error('Ngày, số tiền hoặc chứng từ mở sổ không hợp lệ.');
  const result=db.transaction(()=>{
   const target=db.prepare("SELECT id FROM users WHERE id=? AND role='CLIENT'").get(client);if(!target)throw Error('Client không tồn tại.');
   const previous=db.prepare('SELECT * FROM debt_aging_openings WHERE client_id=?').get(client) as Record<string,unknown>|undefined;
   const cents=Math.round(amount*100);
   if(previous){if(previous.amount_cents===cents&&previous.reference_day===day&&previous.reason===reason)return {ok:true,replayed:true};throw Error('Mốc mở sổ đã được xác nhận; không được ghi đè.');}
   const first=db.prepare('SELECT MIN(period_start) as start FROM statement_v2_snapshots WHERE client_id=?').get(client) as {start:string|null};
   if(first.start&&day>first.start)throw Error('Ngày mở sổ phải trước hoặc bằng kỳ Statement V2 đầu tiên; không được tạo mốc nợ mới để lùi hạn.');
   const f=accountFinancials(client,{readOnly:true,includeDetails:false,includeTransactions:false});
   if(f.debt_age.status!=='REVIEW'||!f.debt_age.warnings.some(w=>w.includes('exceeds frozen')||w.includes('legacy opening')))throw Error('Chỉ cho phép nhập opening khi thiếu coverage công nợ lịch sử.');
   if(cents!==f.debt_age.uncovered_cents)throw Error('Số tiền mở sổ phải bằng đúng phần công nợ chưa có nguồn: '+(f.debt_age.uncovered_cents/100).toFixed(2)+' USD.');
   db.prepare('INSERT INTO debt_aging_openings(client_id,amount_cents,reference_day,reason,actor_id) VALUES (?,?,?,?,?)').run(client,cents,day,reason,auth.user.id);
   db.prepare("INSERT INTO financial_audit(client_id,actor_id,event,data_json) VALUES (?,?,'DEBT_AGING_OPENING',?)").run(client,auth.user.id,JSON.stringify({amount_cents:cents,reference_day:day,reason}));
   return {ok:true,replayed:false};
  }).immediate();
  return NextResponse.json(result);
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
