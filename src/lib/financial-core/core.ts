import {createHash} from 'node:crypto';
import type Database from 'better-sqlite3';
import {initializeFinancialCore} from './schema';

type Actor = {id:number; role:'ADMIN'|'SALES'|'FINANCE'|'CLIENT'|'BOD'|'WAREHOUSE'};
type Client = {client_id:number; sales_id:number; credit_limit_cents:number; purchase_hold:number};
type Totals = {balance_cents:number; principal_cents:number; interest_cents:number; refund_cents:number; reserve_cents:number};
type Event = Totals & {id:number; kind:string; source:string; posted_at:string; data_json:string; cash_out_cents:number};
type Terms = {deadline:string; rate_ppm:number; effective_at:string};
type Base = {client_id:number; request_key:string; reason:string};
export type FinancialCommand = Base & (
  | {action:'convert_debt'; amount_cents:number; deadline:string; rate_ppm?:number}
  | {action:'debt_terms'; deadline:string; rate_ppm:number}
  | {action:'payment'; amount_cents:number; reference:string}
  | {action:'adjust_payment'; payment_id:number; actual_cents:number}
  | {action:'reconcile'; payment_ids:number[]; status:'CONFIRMED'|'DISCREPANCY'}
  | {action:'claim_decision'; claim_id:string; category:'LOST'|'DELAYED'|'PARAMETER_ADJUSTMENT'|'OTHER'; obligation_cents:number}
  | {action:'refund_balance'; amount_cents:number; reference:string}
  | {action:'refund_bank'; amount_cents:number; reference:string; from_account:string; to_account:string; paid_date:string; proof:string}
  | {action:'recover_refund'; amount_cents:number}
  | {action:'reserve'|'release_reserve'|'charge'; order_ref:string; amount_cents:number}
);

const DAY=86400000;
export function vietnamDay(now:Date) {return new Date(now.getTime()+7*3600000).toISOString().slice(0,10);}
function day(value:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Invalid date');
  return value;
}
function integer(value:number,zero=false) {
  if(!Number.isSafeInteger(value)||value<(zero?0:1)||value>100_000_000_000)throw Error('Expected integer cents within supported range');
  return value;
}
function text(value:string) {if(typeof value!=='string'||!value.trim()||value.length>2000)throw Error('Required text');return value.trim();}
function rate(value:number) {if(!Number.isInteger(value)||value<0||value>1_000_000)throw Error('Invalid daily rate');return value;}
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}

/** Owner's replacement domain. Callers supply an isolated DB until migration/integration is accepted. */
export class FinancialCore {
  constructor(private db:Database.Database,private clock:()=>Date=()=>new Date()) {initializeFinancialCore(db);}

  private client(actor:Actor,id:number,write=false) {
    const c=this.db.prepare('SELECT * FROM fc_clients WHERE client_id=?').get(id) as Client|undefined;
    if(!c||!Number.isSafeInteger(actor.id)||actor.id<=0||!['ADMIN','SALES','FINANCE','CLIENT','BOD','WAREHOUSE'].includes(actor.role))throw Error('Client unavailable');
    if(actor.role==='WAREHOUSE'||(actor.role==='CLIENT'&&(write||actor.id!==id))||
      (actor.role==='SALES'&&actor.id!==c.sales_id)||(actor.role==='BOD'&&write))throw Error('Forbidden');
    return c;
  }
  private terms(id:number) {return this.db.prepare('SELECT * FROM fc_debt_terms WHERE client_id=? ORDER BY id DESC LIMIT 1').get(id) as Terms|undefined;}
  private totals(id:number,until?:string):Totals {
    return this.db.prepare(`SELECT COALESCE(SUM(balance_cents),0) balance_cents,
      COALESCE(SUM(principal_cents),0) principal_cents,COALESCE(SUM(interest_cents),0) interest_cents,
      COALESCE(SUM(refund_cents),0) refund_cents,COALESCE(SUM(reserve_cents),0) reserve_cents
      FROM fc_events WHERE client_id=? AND (? IS NULL OR posted_at<?)`).get(id,until??null,until??null) as Totals;
  }
  private emit(c:Client,actor:Actor,kind:string,source:string,reason:string,at:string,
    changes:Partial<Totals & {cash_out_cents:number}>={},data:unknown={},notify=false) {
    const id=Number(this.db.prepare(`INSERT INTO fc_events(client_id,kind,balance_cents,principal_cents,interest_cents,refund_cents,
      reserve_cents,cash_out_cents,source,actor_id,reason,posted_at,data_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(c.client_id,kind,changes.balance_cents??0,changes.principal_cents??0,changes.interest_cents??0,
        changes.refund_cents??0,changes.reserve_cents??0,changes.cash_out_cents??0,source,actor.id,reason,at,JSON.stringify(data)).lastInsertRowid);
    const totals=this.totals(c.client_id);
    if(Object.values(totals).some(v=>!Number.isSafeInteger(v))||totals.principal_cents<0||totals.interest_cents<0||totals.reserve_cents<0)throw Error('Financial invariant failed');
    if(notify)for(const recipient of new Set([c.client_id,c.sales_id]))this.db.prepare('INSERT INTO fc_outbox(recipient_id,event_id,payload_json) VALUES (?,?,?)').run(recipient,id,JSON.stringify({kind,client_id:c.client_id,source,data}));
    return id;
  }

  /** Round once per Vietnam calendar day, with no repricing of elapsed time.
   * BigInt retains exact sub-cent exposure across intraday principal/rate changes. */
  private accrue(c:Client,at:string) {
    const terms=this.db.prepare('SELECT * FROM fc_debt_terms WHERE client_id=? ORDER BY effective_at,id').all(c.client_id) as Terms[];
    if(!terms.length)return;
    const events=this.db.prepare('SELECT principal_cents,posted_at FROM fc_events WHERE client_id=? AND principal_cents!=0 ORDER BY posted_at,id').all(c.client_id) as {principal_cents:number;posted_at:string}[];
    const todayStart=Date.parse(vietnamDay(new Date(at))+'T00:00:00+07:00');
    const firstStart=Date.parse(vietnamDay(new Date(terms[0].effective_at))+'T00:00:00+07:00');
    const last=this.db.prepare('SELECT MAX(day) day FROM fc_interest_days WHERE client_id=?').get(c.client_id) as {day:string|null};
    const start=last.day?Date.parse(last.day+'T00:00:00+07:00')+DAY:firstStart;
    for(let from=start;from<todayStart;from+=DAY) {
      const to=from+DAY;
      const boundaries=[...new Set([from,to,...terms.map(t=>Date.parse(t.effective_at)),...events.map(e=>Date.parse(e.posted_at))].filter(t=>t>=from&&t<=to))].sort((a,b)=>a-b);
      let numerator=BigInt(0);
      for(let i=0;i<boundaries.length-1;i++) {
        const t=boundaries[i],principal=events.filter(e=>Date.parse(e.posted_at)<=t).reduce((n,e)=>n+e.principal_cents,0);
        const dailyRate=terms.filter(e=>Date.parse(e.effective_at)<=t).at(-1)?.rate_ppm??0;
        numerator+=BigInt(principal)*BigInt(dailyRate)*BigInt(boundaries[i+1]-t);
      }
      const denominator=BigInt(1_000_000)*BigInt(DAY);
      const amount=Number((numerator+denominator/BigInt(2))/denominator);
      const label=vietnamDay(new Date(from));
      const event=this.emit(c,{id:c.client_id,role:'CLIENT'},'DEBT_INTEREST',label,'Daily interest',new Date(to-1).toISOString(),{interest_cents:amount},{day:label});
      this.db.prepare('INSERT INTO fc_interest_days(client_id,day,event_id) VALUES (?,?,?)').run(c.client_id,label,event);
    }
  }

  account(actor:Actor,id:number) {return this.db.transaction(()=>{
    const c=this.client(actor,id),at=this.clock().toISOString();this.accrue(c,at);
    const totals=this.totals(id),terms=this.terms(id),overdue=!!terms&&totals.principal_cents+totals.interest_cents>0&&terms.deadline<vietnamDay(new Date(at));
    return {...totals,credit_limit_cents:c.credit_limit_cents,available_to_buy_cents:Math.max(0,totals.balance_cents+c.credit_limit_cents-totals.reserve_cents),
      purchase_blocked:!!c.purchase_hold||overdue,overdue,terms:terms??null};
  }).immediate();}

  execute(actor:Actor,b:FinancialCommand):Record<string,unknown> {return this.db.transaction(()=>{
    const c=this.client(actor,b.client_id,b.action!=='reserve'),key=text(b.request_key),reason=text(b.reason);
    const admin=['convert_debt','debt_terms','recover_refund','claim_decision','charge','release_reserve'];
    const finance=['adjust_payment','reconcile','refund_balance','refund_bank'];
    if((admin.includes(b.action)&&actor.role!=='ADMIN')||(finance.includes(b.action)&&actor.role!=='FINANCE')||
      (b.action==='payment'&&!['ADMIN','SALES'].includes(actor.role))||
      (b.action==='reserve'&&!['ADMIN','SALES','CLIENT'].includes(actor.role)))throw Error('Forbidden');
    const hash=createHash('sha256').update(JSON.stringify(canonical(b))).digest('hex');
    const receipt=this.db.prepare('SELECT * FROM fc_receipts WHERE actor_id=? AND request_key=?').get(actor.id,key) as {payload_hash:string;result_json:string}|undefined;
    if(receipt) {if(receipt.payload_hash!==hash)throw Error('Request key payload conflict');return JSON.parse(receipt.result_json);}
    const at=this.clock().toISOString();this.accrue(c,at);
    const totals=this.totals(c.client_id);
    let result:Record<string,unknown>;
    if(b.action==='convert_debt'||b.action==='debt_terms') {
      const old=this.terms(c.client_id),deadline=day(b.deadline),dailyRate=rate(b.rate_ppm??old?.rate_ppm??0);
      if(deadline<vietnamDay(new Date(at))||(old&&deadline<old.deadline))throw Error('Deadline must not move backwards');
      if(b.action==='convert_debt') {
        const amount=integer(b.amount_cents);
        if(amount>Math.max(0,-totals.balance_cents))throw Error('Conversion exceeds negative Balance');
        this.emit(c,actor,'DEBT_CONVERSION','CLIENT:'+c.client_id,reason,at,{balance_cents:amount,principal_cents:amount});
      } else if(!old||totals.principal_cents+totals.interest_cents===0)throw Error('No unpaid Debt');
      this.db.prepare('INSERT INTO fc_debt_terms(client_id,deadline,rate_ppm,effective_at,actor_id,reason) VALUES (?,?,?,?,?,?)').run(c.client_id,deadline,dailyRate,at,actor.id,reason);
      result={event_id:this.emit(c,actor,'DEBT_TERMS','CLIENT:'+c.client_id,reason,at,{}, {old:old??null,next:{deadline,rate_ppm:dailyRate,effective_at:at}})};
    } else if(b.action==='payment') {
      const amount=integer(b.amount_cents),interest=Math.min(amount,totals.interest_cents),principal=Math.min(amount-interest,totals.principal_cents);
      const event=this.emit(c,actor,'PAYMENT',text(b.reference),reason,at,{balance_cents:amount-interest-principal,interest_cents:-interest,principal_cents:-principal},{amount_cents:amount},true);
      result={payment_id:Number(this.db.prepare('INSERT INTO fc_payments(client_id,amount_cents,event_id) VALUES (?,?,?)').run(c.client_id,amount,event).lastInsertRowid),event_id:event};
    } else if(b.action==='adjust_payment') {
      const actual=integer(b.actual_cents,true);
      const payment=this.db.prepare('SELECT * FROM fc_payments WHERE id=? AND client_id=?').get(b.payment_id,c.client_id) as {id:number;amount_cents:number;event_id:number}|undefined;
      if(!payment)throw Error('Payment unavailable');
      const prior=this.db.prepare('SELECT COALESCE(SUM(amount_cents),0) amount FROM fc_payment_adjustments WHERE payment_id=?').get(payment.id) as {amount:number};
      const delta=actual-payment.amount_cents-prior.amount;
      if(delta===0)throw Error('Payment already equals actual');
      let balance:number,principal:number,interest:number;
      if(delta>0) {interest=-Math.min(delta,totals.interest_cents);principal=-Math.min(delta+interest,totals.principal_cents);balance=delta+interest+principal;}
      else {
        const allocated=this.db.prepare(`SELECT SUM(e.balance_cents) balance,SUM(e.principal_cents) principal,SUM(e.interest_cents) interest
          FROM fc_events e WHERE e.id=? OR e.id IN (SELECT event_id FROM fc_payment_adjustments WHERE payment_id=?)`).get(payment.event_id,payment.id) as {balance:number;principal:number;interest:number};
        balance=-Math.min(-delta,allocated.balance);const remainder=-delta+balance;
        principal=Math.min(remainder,-allocated.principal);interest=remainder-principal;
        if(interest>-allocated.interest)throw Error('Payment reversal invariant');
      }
      const event=this.emit(c,actor,'PAYMENT_ADJUSTMENT','PAYMENT:'+payment.id,reason,at,{balance_cents:balance,principal_cents:principal,interest_cents:interest},{payment_id:payment.id,delta_cents:delta,actual_cents:actual},true);
      this.db.prepare('INSERT INTO fc_payment_adjustments(payment_id,amount_cents,event_id) VALUES (?,?,?)').run(payment.id,delta,event);
      result={event_id:event};
    } else if(b.action==='reconcile') {
      if(!['CONFIRMED','DISCREPANCY'].includes(b.status)||!Array.isArray(b.payment_ids)||!b.payment_ids.length||b.payment_ids.length>200||new Set(b.payment_ids).size!==b.payment_ids.length)throw Error('Invalid reconciliation batch');
      for(const id of b.payment_ids) {
        if(!this.db.prepare('SELECT id FROM fc_payments WHERE id=? AND client_id=?').get(id,c.client_id))throw Error('Payment unavailable');
        this.db.prepare('INSERT INTO fc_reconciliation(payment_id,status,actor_id,reason,posted_at) VALUES (?,?,?,?,?)').run(id,b.status,actor.id,reason,at);
        this.emit(c,actor,'PAYMENT_RECONCILIATION','PAYMENT:'+id,reason,at,{}, {status:b.status},b.status==='DISCREPANCY');
      }
      result={confirmed:b.payment_ids.length};
    } else if(b.action==='claim_decision') {
      const claim=text(b.claim_id),obligation=integer(b.obligation_cents,true);
      if(!['LOST','DELAYED','PARAMETER_ADJUSTMENT','OTHER'].includes(b.category))throw Error('Invalid claim category');
      const previous=this.db.prepare('SELECT obligation_cents FROM fc_claim_decisions WHERE client_id=? AND claim_id=? ORDER BY id DESC LIMIT 1').get(c.client_id,claim) as {obligation_cents:number}|undefined;
      const event=this.emit(c,actor,'CLAIM_DECISION',claim,reason,at,{refund_cents:obligation-(previous?.obligation_cents??0)},{category:b.category,old_obligation_cents:previous?.obligation_cents??0,obligation_cents:obligation},true);
      this.db.prepare('INSERT INTO fc_claim_decisions(client_id,claim_id,category,obligation_cents,event_id) VALUES (?,?,?,?,?)').run(c.client_id,claim,b.category,obligation,event);
      result={event_id:event};
    } else if(b.action==='refund_balance'||b.action==='refund_bank'||b.action==='recover_refund') {
      const amount=integer(b.amount_cents),recovery=b.action==='recover_refund';
      if(recovery&&amount>Math.max(0,-totals.refund_cents))throw Error('Recovery exceeds over-refund');
      if(b.action==='refund_bank') {text(b.from_account);text(b.to_account);text(b.proof);if(day(b.paid_date)>vietnamDay(new Date(at)))throw Error('Payout is not yet executed');}
      const warnings=!recovery&&amount>totals.refund_cents?['Refund exceeds current obligation']:[];
      const event=this.emit(c,actor,recovery?'REFUND_RECOVERY':b.action==='refund_bank'?'REFUND_TO_BANK':'REFUND_TO_BALANCE',recovery?'CLIENT:'+c.client_id:text(b.reference),reason,at,
        {refund_cents:recovery?amount:-amount,balance_cents:recovery?-amount:b.action==='refund_balance'?amount:0,cash_out_cents:b.action==='refund_bank'?amount:0},
        b.action==='refund_bank'?{from_account:b.from_account,to_account:b.to_account,paid_date:b.paid_date,proof:b.proof,warnings}:{warnings},true);
      result={event_id:event,warnings};
    } else if(b.action==='reserve'||b.action==='release_reserve'||b.action==='charge') {
      const source=text(b.order_ref),amount=integer(b.amount_cents);
      const reserved=Number((this.db.prepare('SELECT COALESCE(SUM(reserve_cents),0) amount FROM fc_events WHERE client_id=? AND source=?').get(c.client_id,source) as {amount:number}).amount);
      if(b.action==='reserve') {
        const account=this.account(actor,c.client_id);
        if(reserved||this.db.prepare("SELECT id FROM fc_events WHERE source=? AND kind='SERVICE_CHARGE'").get(source)||account.purchase_blocked||account.available_to_buy_cents<amount)throw Error('Purchase unavailable');
        result={event_id:this.emit(c,actor,'RESERVE',source,reason,at,{reserve_cents:amount})};
      } else {
        if(reserved!==amount)throw Error('Valid matching reserve required');
        if(b.action==='charge'&&c.purchase_hold)throw Error('Purchase is on Hold');
        result={event_id:this.emit(c,actor,b.action==='charge'?'SERVICE_CHARGE':'RESERVE_RELEASE',source,reason,at,{reserve_cents:-reserved,balance_cents:b.action==='charge'?-amount:0})};
      }
    } else throw Error('Unknown financial action');
    this.db.prepare('INSERT INTO fc_receipts(actor_id,request_key,payload_hash,result_json) VALUES (?,?,?,?)').run(actor.id,key,hash,JSON.stringify(result));
    return result;
  }).immediate();}

  finalizeStatement(actor:Actor,id:number,start:string,end:string,key:string) {return this.db.transaction(()=>{
    const c=this.client(actor,id,true);if(actor.role!=='FINANCE')throw Error('Forbidden');
    day(start);day(end);text(key);const at=this.clock().toISOString();
    const hash=createHash('sha256').update(JSON.stringify({action:'finalize_statement',client_id:id,start,end})).digest('hex');
    const receipt=this.db.prepare('SELECT * FROM fc_receipts WHERE actor_id=? AND request_key=?').get(actor.id,key) as {payload_hash:string;result_json:string}|undefined;
    if(receipt) {if(receipt.payload_hash!==hash)throw Error('Request key payload conflict');return JSON.parse(receipt.result_json);}
    const save=(snapshot:unknown)=>{this.db.prepare('INSERT INTO fc_receipts(actor_id,request_key,payload_hash,result_json) VALUES (?,?,?,?)').run(actor.id,key,hash,JSON.stringify(snapshot));return snapshot;};
    if(start>end||end>=vietnamDay(new Date(at)))throw Error('Only completed periods can finalize');
    const previous=this.db.prepare('SELECT * FROM fc_statements WHERE client_id=? AND period_start=? AND period_end=?').get(id,start,end) as {snapshot_json:string}|undefined;
    if(previous)return save(JSON.parse(previous.snapshot_json));
    if(this.db.prepare('SELECT id FROM fc_statements WHERE client_id=? AND period_start<=? AND period_end>=?').get(id,end,start))throw Error('Statement periods overlap');
    this.accrue(c,at);
    const from=new Date(start+'T00:00:00+07:00').toISOString(),until=new Date(Date.parse(end+'T00:00:00+07:00')+DAY).toISOString();
    const events=this.db.prepare('SELECT * FROM fc_events WHERE client_id=? AND posted_at>=? AND posted_at<? ORDER BY id').all(id,from,until) as Event[];
    const snapshot={lifecycle:'FINALIZED',period_start:start,period_end:end,opening:this.totals(id,from),closing:this.totals(id,until),
      service_fees:events.filter(e=>e.kind==='SERVICE_CHARGE'),financial_activity:events.filter(e=>e.kind!=='SERVICE_CHARGE'),
      reference:{credit_limit_cents:c.credit_limit_cents},finalized_at:at};
    this.db.prepare('INSERT INTO fc_statements(client_id,period_start,period_end,finalized_at,snapshot_json) VALUES (?,?,?,?,?)').run(id,start,end,at,JSON.stringify(snapshot));
    return save(snapshot);
  }).immediate();}

  /** Read projection with per-client exposures kept separate; never net away overpaid clients. */
  refundReport(actor:Actor,start:string,end:string) {return this.db.transaction(()=>{
    if(!['FINANCE','BOD'].includes(actor.role))throw Error('Forbidden');
    day(start);day(end);if(start>end)throw Error('Invalid report period');
    const from=new Date(start+'T00:00:00+07:00').toISOString(),until=new Date(Date.parse(end+'T00:00:00+07:00')+DAY).toISOString();
    const clients=(this.db.prepare('SELECT * FROM fc_clients ORDER BY client_id').all() as Client[]).map(c=>({client_id:c.client_id,...this.totals(c.client_id)}));
    const events=this.db.prepare("SELECT * FROM fc_events WHERE kind IN ('CLAIM_DECISION','REFUND_TO_BALANCE','REFUND_TO_BANK','REFUND_RECOVERY') ORDER BY id").all() as (Event & {client_id:number})[];
    const period=events.filter(e=>e.posted_at>=from&&e.posted_at<until);
    const claims=period.filter(e=>e.kind==='CLAIM_DECISION');
    const categories=['LOST','DELAYED','PARAMETER_ADJUSTMENT','OTHER'].map(category=>({category,
      obligation_change_cents:claims.filter(e=>JSON.parse(e.data_json).category===category).reduce((sum,e)=>sum+e.refund_cents,0),
      events:claims.filter(e=>JSON.parse(e.data_json).category===category)}));
    const bank=events.filter(e=>e.kind==='REFUND_TO_BANK'&&JSON.parse(e.data_json).paid_date>=start&&JSON.parse(e.data_json).paid_date<=end);
    const balance=period.filter(e=>e.kind==='REFUND_TO_BALANCE');
    return {clients,owes_clients_cents:clients.reduce((s,c)=>s+Math.max(0,c.refund_cents),0),
      overpaid_clients_cents:clients.reduce((s,c)=>s+Math.max(0,-c.refund_cents),0),categories,
      bank_outflow_cents:bank.reduce((s,e)=>s+e.cash_out_cents,0),bank_events:bank,
      balance_refund_cents:balance.reduce((s,e)=>s+e.balance_cents,0),balance_events:balance,
      refund_flow_cents:period.reduce((s,e)=>s+e.refund_cents,0),events:period};
  }).immediate();}
}
