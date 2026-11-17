import type Database from 'better-sqlite3';
import {db} from './db';
import type {AuthUser} from './auth';
import {sumVnd,subtractVnd} from './vnd-money';
import {validVndDay,vndDay,nextVndDay} from './vnd-debt';
import {supplierClaimState} from './vnd-supplier-claims';
type Row=Record<string,unknown>;
export function installSupplierPeriodSchema(database:Database.Database){
 database.exec(`CREATE TABLE IF NOT EXISTS vnd_supplier_periods(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,period_start TEXT NOT NULL,period_end TEXT NOT NULL,snapshot_json TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(supplier,period_end));
 CREATE TABLE IF NOT EXISTS vnd_supplier_posting_links(id INTEGER PRIMARY KEY,supplier TEXT NOT NULL,source_kind TEXT NOT NULL,source_id INTEGER NOT NULL,original_period_id INTEGER NOT NULL REFERENCES vnd_supplier_periods(id),original_source_id INTEGER NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(source_kind,source_id));`);
 for(const table of ['vnd_supplier_periods','vnd_supplier_posting_links'])for(const op of ['UPDATE','DELETE'])database.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${op} BEFORE ${op} ON ${table} BEGIN SELECT RAISE(ABORT,'Immutable supplier period'); END;`);
 database.exec(`CREATE TRIGGER IF NOT EXISTS vnd_supplier_no_backdate BEFORE INSERT ON vnd_supplier_ledger WHEN EXISTS(SELECT 1 FROM vnd_supplier_periods p WHERE p.supplier=NEW.supplier AND substr(datetime(NEW.created_at,'+7 hours'),1,10)<=p.period_end) BEGIN SELECT RAISE(ABORT,'Supplier period closed: post in current period'); END;
 CREATE TRIGGER IF NOT EXISTS vnd_supplier_event_no_backdate BEFORE INSERT ON vnd_supplier_claim_events WHEN EXISTS(SELECT 1 FROM vnd_supplier_periods p JOIN vnd_supplier_claims c ON c.supplier=p.supplier WHERE c.id=NEW.claim_id AND substr(datetime(NEW.created_at,'+7 hours'),1,10)<=p.period_end) BEGIN SELECT RAISE(ABORT,'Supplier period closed: post in current period'); END;`);
}
export function supplierPeriods(supplier:string){
 return db.prepare('SELECT * FROM vnd_supplier_periods WHERE supplier=? ORDER BY id DESC').all(supplier) as Row[];
}
export function supplierPeriodView(supplier:string){return {periods:supplierPeriods(supplier).map(p=>({...p,snapshot:JSON.parse(String(p.snapshot_json))})),late_adjustments:db.prepare('SELECT * FROM vnd_supplier_posting_links WHERE supplier=? ORDER BY id DESC').all(supplier)};}
/** Called within the existing immediate Supplier command and receipt transaction. */
export function closeSupplierPeriod(actor:AuthUser,supplier:string,input:Row,reason:string){
 if(!['FINANCE','BOD'].includes(actor.role))throw Error('Khóa kỳ cần Finance/BOD.');
 const end=validVndDay(input.period_end),start=validVndDay(input.period_start),last=supplierPeriods(supplier)[0];
 if(end>=vndDay())throw Error('Chỉ khóa ngày đã kết thúc theo giờ Việt Nam.');
 if(start>end||input.expected_previous_period_id!==Number(last?.id??0)||last&&start!==nextVndDay(String(last.period_end)))throw Error('Kỳ phải liên tiếp; tải lại kỳ đã khóa.');
 // First close covers all existing history: never discard an opening implicitly.
 const entries=db.prepare("SELECT * FROM vnd_supplier_ledger WHERE supplier=? AND substr(datetime(created_at,'+7 hours'),1,10)<=? ORDER BY id").all(supplier,end) as Row[];
 const claims=(db.prepare("SELECT * FROM vnd_supplier_claims WHERE supplier=? AND substr(datetime(created_at,'+7 hours'),1,10)<=? ORDER BY id").all(supplier,end) as Row[]).map(c=>supplierClaimState(c,end));
 const opening=sumVnd(entries.filter(e=>String(e.created_at).length>0&&String((db.prepare("SELECT substr(datetime(?,'+7 hours'),1,10) day").get(e.created_at) as Row).day)<start).map(e=>String(e.delta)));
 const payable=sumVnd(entries.map(e=>String(e.delta)));
 const beforeStart=new Date(Date.parse(start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const openingReceivable=sumVnd(claims.map(c=>supplierClaimState(c,beforeStart).outstanding));
 const closingReceivable=sumVnd(claims.map(c=>c.outstanding));
 const snapshot={currency:'VND',basis:'POSTING_DAY_ASIA_HO_CHI_MINH',period_start:start,period_end:end,opening_payable:opening,payable_movement:subtractVnd(payable,opening),closing_payable:payable,opening_receivable:openingReceivable,receivable_movement:subtractVnd(closingReceivable,openingReceivable),closing_receivable:closingReceivable,entries,claims,
  actual_costs:entries.filter(e=>e.kind==='ACTUAL').map(e=>({...e,cost:db.prepare('SELECT * FROM vnd_supplier_costs WHERE id=?').get(e.cost_id)})),
  unresolved_import_rows:db.prepare("SELECT r.* FROM vnd_supplier_import_rows r WHERE supplier=? AND substr(datetime(r.created_at,'+7 hours'),1,10)<=? AND NOT EXISTS(SELECT 1 FROM vnd_supplier_import_decisions d WHERE d.row_id=r.id AND substr(datetime(d.created_at,'+7 hours'),1,10)<=?) ORDER BY id").all(supplier,end,end)};
 db.prepare('INSERT INTO vnd_supplier_periods(supplier,period_start,period_end,snapshot_json,reason,actor_id) VALUES (?,?,?,?,?,?)').run(supplier,start,end,JSON.stringify(snapshot),reason,actor.id);
}
export function supplierPostingCursor(){return {ledger:Number((db.prepare('SELECT COALESCE(MAX(id),0) id FROM vnd_supplier_ledger').get() as Row).id),event:Number((db.prepare('SELECT COALESCE(MAX(id),0) id FROM vnd_supplier_claim_events').get() as Row).id)};}
/** Link late cost/Claim corrections to their frozen source, without rewriting either journal. */
export function linkSupplierPostings(actor:AuthUser,supplier:string,input:Row,reason:string,cursor:ReturnType<typeof supplierPostingCursor>){
 const periods=supplierPeriods(supplier);
 const originalPeriod=(createdAt:unknown)=>{const day=String((db.prepare("SELECT substr(datetime(?,'+7 hours'),1,10) day").get(createdAt) as Row).day);return periods.find(p=>String(p.period_start)<=day&&String(p.period_end)>=day)??periods.at(-1)!;};
 const link=(kind:string,id:unknown,p:Row,original:unknown)=>db.prepare('INSERT INTO vnd_supplier_posting_links(supplier,source_kind,source_id,original_period_id,original_source_id,reason,actor_id) VALUES (?,?,?,?,?,?,?)').run(supplier,kind,id,p.id,original,reason,actor.id);
 for(const e of db.prepare('SELECT * FROM vnd_supplier_ledger WHERE supplier=? AND id>?').all(supplier,cursor.ledger) as Row[]){
  let found=false;
  for(const p of periods){
   const snap=JSON.parse(String(p.snapshot_json));
   const lot=e.cost_id?(db.prepare('SELECT lot_id FROM vnd_supplier_costs WHERE id=?').get(e.cost_id) as Row).lot_id:null;
   const original=lot?snap.actual_costs.filter((x:Row)=>(x.cost as Row).lot_id===lot).at(-1):snap.entries.find((x:Row)=>x.id===input.original_ledger_id);
   if(original){link('LEDGER',e.id,originalPeriod(original.created_at),original.id);found=true;break;}
  }
  if(e.kind==='ADJUSTMENT'&&periods.length&&!found)throw Error('Điều chỉnh sau khóa cần original_ledger_id thuộc kỳ gốc của Supplier.');
 }
 for(const e of db.prepare('SELECT e.* FROM vnd_supplier_claim_events e JOIN vnd_supplier_claims c ON c.id=e.claim_id WHERE c.supplier=? AND e.id>?').all(supplier,cursor.event) as Row[]){
  for(const p of periods){const c=JSON.parse(String(p.snapshot_json)).claims.find((x:Row)=>x.id===e.claim_id);if(c){const source=c.events.at(-1)??c;link('CLAIM_EVENT',e.id,originalPeriod(source.created_at),source.id);break;}}
 }
}
