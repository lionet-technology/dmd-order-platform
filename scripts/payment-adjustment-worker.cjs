const {workerData}=require('node:worker_threads'),fs=require('node:fs'),ts=require('typescript'),Database=require('better-sqlite3'),signal=new Int32Array(workerData.signal);
try{
 require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
 const db=new Database(workerData.file);db.pragma('busy_timeout=10000');db.pragma('foreign_keys=ON');const {PaymentAdjustments}=require('../src/lib/payment-adjustments.ts'),s=new PaymentAdjustments(db);
 for(let i=0;i<10;i++)s.adjust(workerData.actor,workerData.payload);db.close();Atomics.store(signal,0,1);
}catch(e){if(workerData.allow_stale&&String(e.message).includes('Payment đã được điều chỉnh'))Atomics.store(signal,0,2);else{process.stderr.write(String(e.stack)+'\n');Atomics.store(signal,0,-1)}}finally{Atomics.notify(signal,0)}
