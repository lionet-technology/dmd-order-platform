/** Synthetic-only benchmark. No operational DB selection or reset, ever. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const clients=Number(process.env.BENCH_CLIENTS||100),entries=Number(process.env.BENCH_ENTRIES||100);
if(!Number.isSafeInteger(clients)||!Number.isSafeInteger(entries)||clients<1||clients>500||entries<1||entries>500)throw Error('Benchmark clients/entries must be 1-500');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-statement-bench-'));process.env.DMD_DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(r,p,m,o){if(r.startsWith('@/'))r=path.join(root,'src',r.slice(2));return resolve.call(this,r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{statementPreview,listStatements}=require('../src/lib/statements-v2.ts');
const start=performance.now(),timings=[];let finance,ids=[];
try{
 const sales=createUser({username:'bench.sales',display_name:'Synthetic sales',role:'SALES',password:'TestPass123!'});
 finance=createUser({username:'bench.finance',display_name:'Synthetic finance',role:'FINANCE',password:'TestPass123!'});
 const insert=db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,occurred_at) VALUES (?,'ORDER_CHARGE','DEBIT',1,'2026-10-20')");
 db.transaction(()=>{for(let i=0;i<clients;i++){const c=createUser({username:'bench.client.'+i,display_name:'Synthetic '+i,role:'CLIENT',sales_user_id:sales.id,password:'TestPass123!'});ids.push(c.id);for(let j=0;j<entries;j++)insert.run(c.id);}}).immediate();
 const day=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 for(const id of ids){const t=performance.now();const report=statementPreview(finance,id,day,day);assert.equal(report.closing.balance_cents,-100*entries);assert.equal(report.movements.length,entries);listStatements(finance,id);timings.push(performance.now()-t);}
 timings.sort((a,b)=>a-b);
 const result={synthetic_only:true,clients,entries_per_client:entries,ledger_entries:clients*entries,wall_ms:Math.round(performance.now()-start),latency_ms:{p50:Number(timings[Math.floor(timings.length*.5)].toFixed(2)),p95:Number(timings[Math.min(timings.length-1,Math.floor(timings.length*.95))].toFixed(2)),max:Number(timings.at(-1).toFixed(2))},rss_mb:Math.round(process.memoryUsage().rss/1048576),integrity:db.pragma('integrity_check',{simple:true})};
 assert.equal(result.integrity,'ok');console.log(JSON.stringify(result,null,2));
}finally{try{db.close()}catch{}fs.rmSync(dir,{recursive:true,force:true});}
