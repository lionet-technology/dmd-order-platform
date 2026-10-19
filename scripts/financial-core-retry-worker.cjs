const {workerData}=require('node:worker_threads');
const fs=require('node:fs');
const ts=require('typescript');
const Database=require('better-sqlite3');
const signal=new Int32Array(workerData.signal);
try {
  require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file
  }).outputText,file);
  const db=new Database(workerData.file);
  db.pragma('busy_timeout=10000');db.pragma('foreign_keys=ON');
  const {FinancialCore}=require('../src/lib/financial-core/core.ts');
  const core=new FinancialCore(db,()=>new Date('2026-10-21T00:00:00Z'));
  for(let i=0;i<10;i++)core.execute({id:2,role:'SALES'},{client_id:10,request_key:'concurrent-payment',
    reason:'Concurrent synthetic replay',action:'payment',amount_cents:123,reference:'CONCURRENT'});
  db.close();Atomics.store(signal,0,1);
} catch(error) {
  process.stderr.write(String(error.stack)+'\n');Atomics.store(signal,0,-1);
} finally {Atomics.notify(signal,0);}
