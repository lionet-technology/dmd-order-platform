import {NextRequest,NextResponse} from 'next/server';
import {requireAnyRole} from '@/lib/auth';
import {db} from '@/lib/db';
import {PaymentAdjustments} from '@/lib/payment-adjustments';
import {allocateFIFO} from '@/lib/credit';
import {snapshotDebt} from '@/lib/debt-interest';
import {PaymentReconciliation} from '@/lib/payment-reconciliation';
export const runtime='nodejs';
const adjustments=()=>new PaymentAdjustments(db,allocateFIFO,client=>{for(const d of db.prepare('SELECT id FROM credit_debts WHERE client_id=?').all(client) as {id:number}[])snapshotDebt(d.id);});
const roles=['ADMIN','FINANCE','BOD','SALES','CLIENT'] as const;
export async function GET(req:NextRequest){
 const a=requireAnyRole(req,[...roles]);if(a.error)return a.error;
 try{const s=new PaymentReconciliation(db),q=req.nextUrl.searchParams,adjust=adjustments();
  if(q.has('adjustment_ledger_id')){const id=Number(q.get('adjustment_ledger_id'));return NextResponse.json({...adjust.state(a.user,id),items:adjust.history(a.user,id)},{headers:{'Cache-Control':'private, no-store'}});}
  return NextResponse.json(q.has('ledger_id')?{items:s.history(a.user,Number(q.get('ledger_id')))}:{...s.list(a.user,Object.fromEntries(q)),notifications:s.notifications(a.user),adjustment_notifications:adjust.notifications(a.user)},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const error=(e as Error).message;return NextResponse.json({error},{status:error==='Forbidden'?403:400});}
}
export async function POST(req:NextRequest){
 const a=requireAnyRole(req,[...roles]);if(a.error)return a.error;
 try{const b=await req.json(),s=new PaymentReconciliation(db);b.request_key=b.request_key||req.headers.get('Idempotency-Key');
  return NextResponse.json(b.action==='adjust_payment'?adjustments().adjust(a.user,b):b.action==='acknowledge_adjustment'?adjustments().acknowledge(a.user,Number(b.notification_id)):b.action==='acknowledge'?s.acknowledge(a.user,Number(b.notification_id)):b.action==='reconcile'?s.batch(a.user,b):(()=>{throw Error('Action không hỗ trợ.')})(),{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){const error=(e as Error).message;return NextResponse.json({error},{status:error==='Forbidden'?403:400});}
}
