const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-aging-opening-'));
process.env.DMD_DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
require('./seed-epacket.cjs'); // TS hooks and alias, not seeding operational DB.
const {db}=require('../src/lib/db.ts'),{statementJournalSchema}=require('../src/lib/statement-journal.ts');
const {createUser,createSession}=require('../src/lib/auth.ts'),{accountFinancials,localDay,shiftDay}=require('../src/lib/credit.ts');
const {POST}=require('../src/app/api/admin-debt-aging/route.ts'),{NextRequest}=require('next/server');
let assertions=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);assertions++};
const run=async(actor,body)=>{const r=await POST(new NextRequest('http://localhost/api/admin-debt-aging',{method:'POST',headers:{cookie:'dmd_session='+createSession(actor.id).token,'content-type':'application/json'},body:JSON.stringify(body)}));return {status:r.status,data:await r.json()}};
(async()=>{try{
 const admin=createUser({username:'aging.admin',display_name:'Admin',role:'ADMIN',password:'TestPass123!'});
 const sale=createUser({username:'aging.sale',display_name:'Sale',role:'SALES',password:'TestPass123!'});
 const client=createUser({username:'aging.client',display_name:'Client',role:'CLIENT',password:'TestPass123!',sales_user_id:sale.id});
 db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,created_by_user_id) VALUES (?,'ADDITIONAL_FEE','DEBIT',100,?)").run(client.id,admin.id);
 // Construct a genuine legacy-style opening checkpoint on a disposable DB:
 // the ledger predates V2; the opening captures it instead of creating
 // per-entry new-period events. Never run on a non-temporary database.
 eq(process.env.DMD_DB_PATH.startsWith(dir),true,'Fixture is isolated');
 db.exec("DROP TRIGGER statement_v2_events_immutable_DELETE; DROP TRIGGER statement_v2_epoch_immutable_DELETE; DELETE FROM statement_v2_events; DELETE FROM statement_v2_epoch;");
 statementJournalSchema(db);
 const before=accountFinancials(client.id,{readOnly:true,includeDetails:false});
 eq(before.debt_age.status,'REVIEW','Legacy fee has no finalized period basis');
 eq(before.debt_age.uncovered_cents,10000,'Historical uncovered principal exactly 100 USD');
 const opening={client_id:client.id,amount:100,reference_day:shiftDay(localDay(),-30),reason:''};
 let result=await run(client,opening);eq(result.status,403,'Client cannot certify age');
 result=await run(admin,{...opening,amount:99});eq(result.status,400,'Incorrect uncovered amount rejected');
 result=await run(admin,{...opening,reference_day:shiftDay(localDay(),1)});eq(result.status,400,'Future age marker rejected');
 const balanceBefore=db.prepare("SELECT COALESCE(SUM(amount),0) amount,COUNT(*) n FROM ledger_entries WHERE client_user_id=?").get(client.id);
 result=await run(admin,opening);eq(result.status,200,'Admin can certify real legacy opening');
 const after=accountFinancials(client.id,{readOnly:true,includeDetails:false});
 eq(after.debt_age.status,'OVERDUE','Opening reference yields correct contractual overdue');
 eq(after.debt_age.oldest_unpaid_statement_date,opening.reference_day,'Legacy reference date is auditable');
 eq(after.purchase_blocked,true,'Overdue legacy debt still blocks future purchasing');
 eq(db.prepare("SELECT COALESCE(SUM(amount),0) amount,COUNT(*) n FROM ledger_entries WHERE client_user_id=?").get(client.id),balanceBefore,'Opening never moves real money');
 eq(db.prepare('SELECT COUNT(*) n FROM credit_debts WHERE client_id=?').get(client.id).n,0,'Opening does not create a Debt account');
 result=await run(admin,opening);eq(result.status,200,'Same request replay returns success');
 eq(result.data.replayed,true,'Exact replay identified');
 result=await run(admin,{...opening,amount:101});eq(result.status,400,'Different opening cannot overwrite');
 assert.throws(()=>db.prepare('UPDATE debt_aging_openings SET amount_cents=1 WHERE client_id=?').run(client.id));assertions++;
 const audit=db.prepare("SELECT COUNT(*) n FROM financial_audit WHERE client_id=? AND event='DEBT_AGING_OPENING'").get(client.id).n;
 eq(audit,1,'Exactly one immutable audit entry');
 console.log('DEBT AGING OPENING MIGRATION PASS ('+assertions+' assertions)');
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
