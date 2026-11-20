require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict');
const {Worker}=require('node:worker_threads');
const {db}=require('../src/lib/db.ts');
const auth=require('../src/lib/auth.ts');
const ops=require('../src/lib/vnd-operational.ts');
const {closeVndWeeklyStatements,vndStatementHistory,vndCreditStatus}=require('../src/lib/vnd-statements.ts');
const {runVndWeeklyClose}=require('../src/lib/vnd-weekly-scheduler.ts');
const {vndDay}=require('../src/lib/vnd-debt.ts');
let checks=0,sequence=0;
const eq=(a,b)=>{checks++;assert.deepEqual(a,b);};
const bad=(fn,pattern)=>{checks++;assert.throws(fn,pattern);};
const key=()=> 'TEST-WEEKLY-'+(++sequence);
const create=(role,extra={})=>auth.createUser({username:key(),display_name:'TEST weekly',password:'TestPass123!',role,...extra});
const now=timestamp=>new Date(timestamp);

(async()=>{try{
 require('./seed-epacket.cjs').seed();
 const admin=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get();
 const finance=create('FINANCE'),bod=create('BOD'),sales=create('SALES'),otherSales=create('SALES');
 const client=create('CLIENT',{sales_user_id:sales.id});
 const action=(type,data={},actor=admin,clientId=client.id)=>ops.vndAction(actor,{action:type,client_id:clientId,request_key:key(),reason:'TEST weekly',...data});
 action('activate',{credit_limit:'150'});
 db.prepare("UPDATE vnd_accounts SET created_at='2026-01-07 00:00:00' WHERE client_id=?").run(client.id);
 const post=(delta,date,clientId=client.id)=>db.prepare("INSERT INTO vnd_ledger(client_id,kind,delta,reason,actor_id,request_key,created_at) VALUES (?,'ADJUSTMENT',?,'TEST',?,?,?)")
  .run(clientId,delta,admin.id,key(),date);
 const status=()=>vndCreditStatus(client.id);
 const freeze=()=>vndStatementHistory(client.id);
 eq(status(),{term_weeks:0,consecutive_weeks:0,overdue:false,overdue_weeks:0});
 post('-100','2026-01-11 16:59:59'); // Sunday 23:59:59 in Vietnam
 eq(status(),{term_weeks:0,consecutive_weeks:0,overdue:true,overdue_weeks:0});
 action('credit_term',{weeks:2});
 for(const actor of [finance,bod,sales,client])bad(()=>action('credit_term',{weeks:0},actor),/Admin/);
 for(const weeks of [-1,1.5,'2',null])bad(()=>action('credit_term',{weeks}),/số tuần/);
 bad(()=>action('statement',{},sales),/Finance/);
 bad(()=>action('statement',{},client),/Finance/);
 bad(()=>ops.vndView(client.id,otherSales),/quyền/);
 eq(ops.vndView(client.id,sales).credit_term,status());
 eq(closeVndWeeklyStatements(client.id,undefined,now('2026-01-11T16:59:59Z')),[]);
 eq(closeVndWeeklyStatements(client.id,undefined,now('2026-01-11T17:00:00Z')).length,1);
 eq(freeze().map(s=>[s.period_start,s.period_end,s.snapshot.closing.balance]),[['2026-01-05','2026-01-11','-100']]);
 eq(status().consecutive_weeks,1);eq(status().overdue,false);
 post('5','2026-01-11 17:00:00'); // Monday 00:00
 post('-10','2026-01-16 01:00:00');
 runVndWeeklyClose(now('2026-01-18T17:00:00Z'));
 eq(freeze().at(-1).snapshot.closing.balance,'-105');
 eq(status(),{term_weeks:2,consecutive_weeks:2,overdue:true,overdue_weeks:1});
 eq(ops.vndBalance(client.id).available,'45');
 const first=freeze()[0].snapshot_json;
 // Partial payment does not reset. Zero then negative on the same day does.
 post('104','2026-01-19 01:00:00');eq(status().overdue,true);
 post('1','2026-01-19 01:00:00');eq(status().consecutive_weeks,0);
 post('-130','2026-01-19 01:00:00');eq(status().overdue,false);
 runVndWeeklyClose(now('2026-02-02T19:00:00Z')); // Missed run catches up in order.
 eq(freeze().map(s=>s.period_end),['2026-01-11','2026-01-18','2026-01-25','2026-02-01']);
 eq(status().overdue_weeks,1);eq(freeze()[0].snapshot_json,first);
 runVndWeeklyClose(now('2026-02-09T17:00:00Z'));
 eq(status().overdue_weeks,2);
 action('credit_term',{weeks:4});eq(status().overdue,false);
 action('credit_term',{weeks:1});eq(status().overdue_weeks,3);
 action('credit_limit',{amount:'10'});
 eq(ops.vndBalance(client.id).balance,'-130');eq(ops.vndBalance(client.id).available,'-120');
 action('debt',{amount:'100',deadline:vndDay()});
 action('post',{kind:'PAYMENT',delta:'100'});
 eq(ops.vndBalance(client.id).balance,'-30');
 eq(status().consecutive_weeks,3); // Debt principal payout never crosses zero in Balance.
 action('post',{kind:'PAYMENT',delta:'30'});eq(status().overdue,false);eq(status().consecutive_weeks,0);
 const audit=db.prepare("SELECT count(*) n FROM vnd_history WHERE client_id=? AND event='WEEKLY_STATEMENT_CLOSED'").get(client.id);
 eq(audit.n,5);
 bad(()=>db.prepare("UPDATE vnd_statements SET snapshot_json='{}'").run(),/Immutable/);

 const legacy=create('CLIENT',{sales_user_id:sales.id});
 action('activate',{},admin,legacy.id);
 db.prepare("UPDATE vnd_accounts SET created_at='2026-01-07 00:00:00' WHERE client_id=?").run(legacy.id);
 const legacySnapshot=JSON.stringify({closing:{balance:'0',debt_principal:'0',debt_interest:'0'}});
 db.prepare("INSERT INTO vnd_statements(client_id,period_start,period_end,last_ledger_id,last_debt_event_id,snapshot_json,actor_id) VALUES (?,'2026-01-07','2026-01-08',0,0,?,?)").run(legacy.id,legacySnapshot,admin.id);
 post('-3','2026-01-09 00:00:00',legacy.id);
 const workers=Array.from({length:2},()=>new Worker(require.resolve('./vnd-race-worker.cjs'),{workerData:{file:process.env.DMD_DB_PATH,actor:admin.id,weekly:'2026-01-18T17:00:00Z',input:{client_id:legacy.id}}}));
 let ready=0;
 const results=await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{
  worker.on('error',reject);
  worker.on('message',message=>{
   if(!message.ready){resolve(message);return;}
   if(++ready===workers.length)workers.forEach(w=>w.postMessage('go'));
  });
 })));
 eq(results,[{ok:true},{ok:true}]);
 const preserved=vndStatementHistory(legacy.id);
 eq(preserved[0].snapshot_json,legacySnapshot);
 eq(preserved.map(s=>[s.period_start,s.period_end,s.snapshot.closing.balance]),[
  ['2026-01-07','2026-01-08','0'],['2026-01-09','2026-01-11','-3'],['2026-01-12','2026-01-18','-3'],
 ]);
 eq(preserved[1].snapshot.close.source,'SCHEDULED');
 db.exec(`CREATE TRIGGER test_weekly_audit_failure BEFORE INSERT ON vnd_history
  WHEN NEW.client_id=${legacy.id} AND NEW.event='WEEKLY_STATEMENT_CLOSED'
  BEGIN SELECT RAISE(ABORT,'TEST weekly audit failure'); END;`);
 const nextMonday=now('2026-01-25T17:00:00Z');
 bad(()=>closeVndWeeklyStatements(legacy.id,undefined,nextMonday),/audit failure/);
 eq(vndStatementHistory(legacy.id),preserved);
 db.exec('DROP TRIGGER test_weekly_audit_failure');
 runVndWeeklyClose(nextMonday);
 eq(vndStatementHistory(legacy.id).at(-1).period_end,'2026-01-25');
 eq(vndStatementHistory(legacy.id).slice(0,3),preserved);

 eq(db.pragma('integrity_check',{simple:true}),'ok');
 console.log('VND WEEKLY STATEMENT PASS ('+checks+' assertions)');
}finally{db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
