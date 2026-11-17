require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),{db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),ops=require('../src/lib/vnd-operational.ts'),debt=require('../src/lib/vnd-debt.ts'),statements=require('../src/lib/vnd-statements.ts'),money=require('../src/lib/vnd-money.ts'),report=require('../src/lib/vnd-reporting.ts');
let n=0,checks=0;const key=()=> 'vnd-finance-'+(++n),eq=(a,b)=>{checks++;assert.deepEqual(a,b)},bad=(f,re)=>{checks++;assert.throws(f,re)};
try{
 require('./seed-epacket.cjs').seed();
 const admin=db.prepare('SELECT * FROM users WHERE is_root_admin=1').get(),sales=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'SALES'}),client=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'CLIENT',sales_user_id:sales.id}),other=auth.createUser({username:key(),display_name:'TEST',password:'TestPass123!',role:'SALES'});
 const call=(action,b={},actor=admin)=>ops.vndAction(actor,{action,client_id:client.id,reason:'TEST',request_key:key(),...b});
 call('activate',{credit_limit:'0'});
 call('post',{kind:'ADJUSTMENT',delta:'-1000.123456'});
 eq(ops.vndBalance(client.id).balance,'-1000.123456');eq(db.prepare('SELECT count(*) n FROM vnd_debts').get().n,0);
 bad(()=>call('debt',{amount:'1001',deadline:debt.vndDay()}),/Balance/);
 bad(()=>call('debt',{amount:'100',deadline:'2026-02-30'}),/Ngày/);
 bad(()=>call('debt',{amount:'100',deadline:debt.vndDay()},sales),/Admin/);
 call('debt',{amount:'600.123456',deadline:debt.vndDay(),daily_rate_pct:'0.1'});
 eq(ops.vndBalance(client.id).balance,'-400');eq(ops.vndBalance(client.id).ledger_balance,'-1000.123456');
 const room=ops.vndBalance(client.id).available;
 call('post',{kind:'PAYMENT',delta:'100.000001'});
 eq(ops.vndBalance(client.id).available,room);eq(debt.vndDebt(client.id).principal,'500.123455');
 eq(ops.vndBalance(client.id).ledger_balance,'-900.123455');
 const yesterday=new Date(Date.parse(debt.vndDay()+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 // Explicit synthetic yesterday segment; prospective live commands never backdate.
 db.prepare('INSERT INTO vnd_debt_events(client_id,day,principal,interest,principal_delta,interest_delta,daily_rate_pct,kind,reason,actor_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(client.id,yesterday,'500.123455','0','0','0','0.1','TEST_SEGMENT','TEST',admin.id);
 const beforeRead=db.prepare('SELECT count(*) n FROM vnd_debt_daily').get().n;
 eq(debt.vndDebtProjection(client.id).projected_interest,'0.500123455');eq(db.prepare('SELECT count(*) n FROM vnd_debt_daily').get().n,beforeRead);
 call('post',{kind:'PAYMENT',delta:'10.500123455'});
 eq(debt.vndDebt(client.id).interest,'0');eq(debt.vndDebt(client.id).principal,'490.123455');eq(ops.vndBalance(client.id).balance,'-400');
 eq(db.prepare('SELECT count(*) n FROM vnd_debt_daily').get().n,1);
 call('post',{kind:'ADJUSTMENT',delta:'0'});eq(db.prepare('SELECT count(*) n FROM vnd_debt_daily').get().n,1);
 bad(()=>call('extend_debt',{deadline:yesterday}),/gia hạn/);
 call('debt_rate',{daily_rate_pct:'0.2'});eq(debt.vndDebt(client.id).daily_rate_pct,'0.2');
 bad(()=>call('debt_rate',{daily_rate_pct:'-1'}),/Lãi/);
 const future=new Date(Date.parse(debt.vndDay()+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 call('extend_debt',{deadline:future});eq(debt.vndDebt(client.id).deadline,future);
 bad(()=>ops.vndView(client.id,other),/quyền/);
 call('statement',{period_start:yesterday,period_end:yesterday});
 const first=statements.vndStatementHistory(client.id)[0];eq(first.snapshot.closing.balance,'0');
 call('statement',{period_start:debt.vndDay(),period_end:debt.vndDay()});
 const history=statements.vndStatementHistory(client.id),frozen=history[1].snapshot_json;
 eq(history[1].snapshot.closing.balance,ops.vndBalance(client.id).balance);
 eq(history[1].snapshot.closing.debt_principal,debt.vndDebt(client.id).principal);
 eq(history[1].snapshot.closing.debt_interest,debt.vndDebt(client.id).interest);
 bad(()=>db.prepare("UPDATE vnd_statements SET snapshot_json='{}'").run(),/Immutable/);
 call('post',{kind:'ADJUSTMENT',delta:'-5.000001'});eq(statements.vndStatementHistory(client.id)[1].snapshot_json,frozen);
 bad(()=>call('statement',{period_start:debt.vndDay(),period_end:debt.vndDay()}),/nối tiếp/);
 bad(()=>call('statement',{period_start:future,period_end:future}),/kết thúc/);
 // Payments settle remaining principal before increasing wallet, conserving total obligations.
 const remaining=String(debt.vndDebt(client.id).principal),balance=ops.vndBalance(client.id).balance;
 const pay={action:'post',client_id:client.id,kind:'PAYMENT',delta:money.addVnd(remaining,'50'),reason:'TEST',request_key:key()};
 const receipt=ops.vndAction(admin,pay);eq(ops.vndAction(admin,pay),receipt);
 eq(debt.vndDebt(client.id).principal,'0');eq(ops.vndBalance(client.id).balance,money.addVnd(balance,'50'));
 // Real DB failure rolls back money, accrual, receipt, and history together.
 const before=JSON.stringify(ops.vndView(client.id,admin));
 db.exec("CREATE TRIGGER finance_rollback BEFORE INSERT ON vnd_commands WHEN NEW.request_key='TEST-FINANCE-ROLLBACK' BEGIN SELECT RAISE(ABORT,'TEST rollback'); END;");
 bad(()=>ops.vndAction(admin,{action:'post',client_id:client.id,kind:'PAYMENT',delta:'1',reason:'TEST',request_key:'TEST-FINANCE-ROLLBACK'}),/rollback/);
 eq(JSON.stringify(ops.vndView(client.id,admin)),before);
 const monthly=report.vndBusinessReport(debt.vndDay().slice(0,7));eq(monthly.currency,'VND');eq(monthly.actual_gp,null);eq(monthly.claim_refund_status,'ACTIVE');
 eq(db.pragma('integrity_check',{simple:true}),'ok');
 console.log('VND FINANCIAL CUTOVER PASS ('+checks+' assertions)');
}finally{db.close();}
