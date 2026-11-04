const {workerData:w}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
process.env.DMD_DB_PATH=w.file;process.env.NODE_ENV='test';
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){return resolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const ready=new Int32Array(w.ready),gate=new Int32Array(w.gate),out=new Int32Array(w.out);let db;
try{
 db=require('../src/lib/db.ts').db;
 const pricing=require('../src/lib/route-pricing.ts'),finance=require('../src/lib/finance.ts'),credit=require('../src/lib/credit.ts'),refunds=new(require('../src/lib/refunds.ts').RefundService)(db);
 Atomics.store(ready,0,1);Atomics.notify(ready,0);while(!Atomics.load(gate,0))Atomics.wait(gate,0,0,30000);
 const run=()=>w.mode==='purchase'?pricing.purchaseService(w.order,w.client,true,w.quote):w.mode==='recover'?refunds.execute(w.admin,w.recover):finance.addLedgerEntry(w.payment);
 const first=run();for(let i=0;i<3;i++)run();
 if(w.mode==='recover'&&first.refund_balance_cents!==0)throw Error('Recovery receipt mismatch');
 // Allocation retries must not move a dollar again after the payment receipt.
 if(w.mode==='payment')for(let i=0;i<3;i++)credit.allocateFIFO(w.client.id);
 Atomics.store(out,0,1);
}catch(e){if(/Balance.*không đủ|Balance \/ credit không đủ/.test(String(e)))Atomics.store(out,0,2);else {process.stderr.write(String(e.stack||e)+'\n');Atomics.store(out,0,-1);}Atomics.store(ready,0,1);Atomics.notify(ready,0);}
finally{if(db)db.close();Atomics.notify(out,0);}
