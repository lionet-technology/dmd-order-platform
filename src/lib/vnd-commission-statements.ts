import {db} from './db';
import {vndDay} from './vnd-debt';
import {vndCommissionOrderInputs} from './vnd-commission';
import {subtractVnd,sumVnd} from './vnd-money';

type Row=Record<string,unknown>;
type OrderInput=ReturnType<typeof vndCommissionOrderInputs>[number];
type CommissionLine={
 order_id:number;
 sales_user_id:number|null;
 origin_month:string;
 order_commission_vnd:string|null;
 recognized_vnd:string;
 posting_vnd:string|null;
 evidence:{
  ledger:Row[];
  decisions:Row[];
  active_claims:OrderInput['claim_evidence'];
  cancellation_at:unknown;
  freight_vnd:string;
  base_vnd:string|null;
 };
};
type Snapshot={month:string; lines:CommissionLine[]};
type Stored={closed_at:string;snapshot_json:string};

function monthStart(month:string){
 return new Date(`${month}-01T00:00:00+07:00`).toISOString();
}

function adjacentMonth(month:string,offset:number){
 const [year,number]=month.split('-').map(Number);
 return new Date(Date.UTC(year,number-1+offset,1)).toISOString().slice(0,7);
}

function stored(month:string){
 return db.prepare('SELECT closed_at,snapshot_json FROM vnd_commission_statements WHERE month=?').get(month) as Stored|undefined;
}

function buildSnapshot(month:string,cutoff:string):Snapshot{
 const start=monthStart(month);
 const previous=stored(adjacentMonth(month,-1));
 const previousLines=previous?(JSON.parse(previous.snapshot_json) as Snapshot).lines:[];
 const priorByOrder=new Map(previousLines.map(line=>[line.order_id,line]));
 const orders=db.prepare(`
  SELECT o.*, substr(datetime(o.service_purchased_at,'+7 hours'),1,7) origin_month,
   julianday(o.cancelled_at)<julianday(?) cancelled_before_cutoff
  FROM orders o WHERE julianday(o.service_purchased_at)<julianday(?)
   AND EXISTS (SELECT 1 FROM vnd_purchase_requests r WHERE r.order_id=o.id)
  ORDER BY o.id
 `).all(cutoff,cutoff) as Row[];
 const ledger=db.prepare(`
  SELECT id,kind,delta,created_at FROM vnd_ledger WHERE order_id=?
   AND kind IN ('ORDER_CHARGE','ORDER_CORRECTION','CANCELLATION_REFUND')
   AND julianday(created_at)>=julianday(?) AND julianday(created_at)<julianday(?) ORDER BY id
 `);
 const decisions=db.prepare(`
  SELECT e.id,e.claim_id,e.revision,e.category,e.created_at,
   json_extract(a.value,'$.total_vnd') allocated_vnd
  FROM vnd_refund_events e JOIN vnd_claims c ON c.id=e.claim_id
  JOIN json_each(c.orders_json) o ON o.value=?
  LEFT JOIN json_each(e.context_json,'$.allocation') a ON json_extract(a.value,'$.order_id')=o.value
  WHERE e.kind='DECISION' AND julianday(e.created_at)>=julianday(?) AND julianday(e.created_at)<julianday(?)
  ORDER BY e.id
 `);
 const lines=vndCommissionOrderInputs(orders,cutoff).map((input,index):CommissionLine=>{
  const order=orders[index];
  const prior=priorByOrder.get(input.order_id);
  const value=input.live_after_refund.commission_vnd;
  const recognized=prior?.recognized_vnd??'0';
  return {
   order_id:input.order_id,sales_user_id:prior?.sales_user_id??input.sales_user_id,
   origin_month:prior?.origin_month??String(order.origin_month),
   order_commission_vnd:value,recognized_vnd:value??recognized,
   posting_vnd:value===null?null:subtractVnd(value,recognized),
   evidence:{
    ledger:ledger.all(input.order_id,start,cutoff) as Row[],
    decisions:decisions.all(input.order_id,start,cutoff) as Row[],
    active_claims:input.claim_evidence,
    cancellation_at:input.group==='CANCELLATION'?order.cancelled_at:null,
    freight_vnd:input.revenue,base_vnd:input.base_vnd,
   },
  };
 });
 return {month,lines};
}

function nextMonthToClose(){
 const {last}=db.prepare('SELECT MAX(month) last FROM vnd_commission_statements').get() as {last:string|null};
 if(last)return adjacentMonth(last,1);
 const {first}=db.prepare(`
  SELECT MIN(substr(datetime(o.service_purchased_at,'+7 hours'),1,7)) first
  FROM orders o WHERE EXISTS (SELECT 1 FROM vnd_purchase_requests r WHERE r.order_id=o.id)
 `).get() as {first:string|null};
 return first;
}

const closeMonth=db.transaction((current:string,now:Date)=>{
 const month=nextMonthToClose();
 if(!month||month>=current)return false;
 const snapshot=buildSnapshot(month,monthStart(adjacentMonth(month,1)));
 db.prepare('INSERT INTO vnd_commission_statements(month,closed_at,snapshot_json) VALUES (?,?,?)')
  .run(month,now.toISOString(),JSON.stringify(snapshot));
 return true;
});

export function runVndMonthlyCommission(now=new Date()){
 const current=vndDay(now).slice(0,7);
 // Avoid acquiring a write lock on routine ticks. Recheck under the lock before closing.
 const next=nextMonthToClose();
 if(!next||next>=current)return;
 while(closeMonth.immediate(current,now)){
  // One independent atomic transaction per overdue month.
 }
}

export function readVndMonthlyCommission(month:string,salesId?:number,now=new Date()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Tháng commission không hợp lệ.');
 return db.transaction(()=>{
  const current=vndDay(now).slice(0,7);
  const saved=stored(month);
  const next=saved?null:nextMonthToClose();
  if(!saved&&(month!==current||(next&&next<current))){
   return {month,status:month>current?'FUTURE':'PENDING_CLOSE',closed_at:null,lines:[],sales:[]};
  }
  const snapshot=saved?JSON.parse(saved.snapshot_json) as Snapshot:buildSnapshot(month,now.toISOString());
  const lines=snapshot.lines.filter(line=>(salesId===undefined||line.sales_user_id===salesId)&&
   (line.origin_month===month||line.posting_vnd!=='0'||line.evidence.decisions.length||line.evidence.ledger.length))
   .map(line=>salesId===undefined?line:{...line,evidence:{...line.evidence,base_vnd:null}});
  const groups=new Map<number|null,CommissionLine[]>();
  for(const line of lines){
   const group=groups.get(line.sales_user_id)??[];
   group.push(line);
   groups.set(line.sales_user_id,group);
  }
  const sales=Array.from(groups,([sales_user_id,rows])=>({
   sales_user_id,
   base_vnd:sumVnd(rows.filter(row=>row.origin_month===month).map(row=>row.posting_vnd??'0')),
   adjustment_vnd:sumVnd(rows.filter(row=>row.origin_month!==month).map(row=>row.posting_vnd??'0')),
   total_vnd:sumVnd(rows.map(row=>row.posting_vnd??'0')),
   unresolved_orders:rows.filter(row=>row.posting_vnd===null).length,
  }));
  return {month,status:saved?'CLOSED':'OPEN',closed_at:saved?.closed_at??null,lines,sales};
 }).deferred();
}

let timer:NodeJS.Timeout|undefined;
export function startVndMonthlyCommission(){
 if(timer)return;
 const tick=()=>{
  try{runVndMonthlyCommission();}
  catch(error){console.error('Monthly VNĐ Commission close failed',error);}
 };
 tick();
 timer=setInterval(tick,60_000);
 timer.unref();
}
