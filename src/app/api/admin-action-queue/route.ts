import {NextRequest,NextResponse} from 'next/server';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {accountFinancials,localDay,shiftDay} from '@/lib/credit';
import {hasPartialLabelOverride} from '@/lib/partial-label';
export const runtime='nodejs';
/** Admin's read-only action queue: never creates pricing, charges or financial allocations. */
export async function GET(req:NextRequest){
 const auth=requireUser(req);if(auth.error)return auth.error;
 if(auth.user.role!=='ADMIN')return NextResponse.json({error:'Chỉ Admin có quyền.'},{status:403});
 try{
  const orders=db.prepare(`SELECT o.id,o.order_id,o.system_order_code,o.service,o.carton_count,o.client_user_id,o.service_purchased_at,
    (SELECT COUNT(*) FROM order_trackings t WHERE t.order_id=o.id AND t.status='ACTIVE' AND trim(coalesce(t.label_url,''))<>'') labels
    FROM orders o WHERE o.service_purchased_at IS NOT NULL AND lower(trim(o.service)) IN ('ups','chuyên tuyến')
    AND o.workflow_status<>'CANCELLED'
    AND (coalesce(o.pricing_snapshot_json,'')='' OR json_valid(o.pricing_snapshot_json)=0 OR o.total_due<=0)
    ORDER BY CASE WHEN date(o.service_purchased_at,'+7 hours')<date('now','+7 hours') THEN 0 ELSE 1 END, o.service_purchased_at,o.id LIMIT 100`).all() as Record<string,unknown>[];
  const partial=db.prepare(`SELECT o.id,o.order_id,o.system_order_code,o.service,o.carton_count,
    (SELECT COUNT(DISTINCT t.carton_id) FROM order_trackings t WHERE t.order_id=o.id AND t.status='ACTIVE' AND trim(coalesce(t.label_url,''))<>'') labelled
    FROM orders o WHERE o.carton_count>1 AND o.workflow_status<>'CANCELLED'
    AND EXISTS(SELECT 1 FROM order_trackings t WHERE t.order_id=o.id AND t.status='ACTIVE')
    ORDER BY o.id DESC LIMIT 100`).all() as Record<string,unknown>[];
  const review:Record<string,unknown>[]=[];
  const clients=db.prepare("SELECT id,display_name FROM users WHERE role='CLIENT' AND active=1 ORDER BY id").all() as {id:number;display_name:string}[];
  for(const c of clients){
   const f=accountFinancials(c.id,{readOnly:true,includeDetails:false,includeTransactions:false});
   if(f.debt_age.status==='REVIEW')review.push({client_id:c.id,client:c.display_name,warnings:f.debt_age.warnings});
  }
  const now=localDay();
  const prioritized=orders.map(o=>{
   const entered=new Date(String(o.service_purchased_at));
   const day=Number.isNaN(entered.getTime())?null:localDay(entered);
   const weekday=day?new Date(day+'T00:00:00Z').getUTCDay():null;
   const periodEnd=day&&weekday!==null?shiftDay(day,6-((weekday+6)%7)):null;
   return {...o,period_end:periodEnd,priority:!periodEnd||periodEnd<now?'BLOCKS_STATEMENT':'PENDING_PRICE'};
  }).sort((a,b)=>(a.priority==='BLOCKS_STATEMENT'?0:1)-(b.priority==='BLOCKS_STATEMENT'?0:1));
  return NextResponse.json({unpriced:prioritized,blocked_statement_count:prioritized.filter(o=>o.priority==='BLOCKS_STATEMENT').length,partial_labels:partial.filter(o=>Number(o.labelled)<Number(o.carton_count)&&!hasPartialLabelOverride(Number(o.id))),age_review:review,as_of:new Date().toISOString()});
 }catch(e){return NextResponse.json({error:(e as Error).message},{status:400});}
}
