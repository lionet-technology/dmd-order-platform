const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-ledger-page-'));process.env.DMD_DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{accountFinancials}=require('../src/lib/credit.ts'),{ledgerPage}=require('../src/lib/ledger-page.ts');
try{
const sales=createUser({username:'bench.sales',display_name:'Bench Sales',password:'Synthetic123!',role:'SALES'});
const c=createUser({sales_user_id:sales.id,username:'bench.client',display_name:'Bench',password:'Synthetic123!',role:'CLIENT'});
const insert=db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,note) VALUES (?,'ADDITIONAL_FEE','DEBIT',1,?)");
db.transaction(()=>{for(let i=0;i<10000;i++)insert.run(c.id,'Fixture '+i)})();
const changes=()=>db.prepare('SELECT total_changes() n').get().n;
const before=changes(),times=[];let response;
for(let i=0;i<20;i++){const start=performance.now();response={...accountFinancials(c.id,{readOnly:true,includeTransactions:false}),...ledgerPage(c.id,new URLSearchParams({ledger_page:String(i+1),q:'Fixture',type:'ADDITIONAL_FEE'}))};times.push(performance.now()-start);assert.equal(response.transactions.length,25);assert.equal(response.ledger_pagination.total,10000);}
assert.equal(changes(),before,'Paged reads never write');times.sort((a,b)=>a-b);
console.log(JSON.stringify({fixture_rows:10000,reads:20,page_size:25,median_ms:Math.round(times[10]*100)/100,p95_ms:Math.round(times[18]*100)/100,response_bytes:Buffer.byteLength(JSON.stringify(response)),db_changes:changes()-before}));
}finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
