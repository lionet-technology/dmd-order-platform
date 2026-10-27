const {workerData}=require('node:worker_threads'),fs=require('node:fs'),ts=require('typescript'),Database=require('better-sqlite3');
const signal=new Int32Array(workerData.signal);
try{
 require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
 const db=new Database(workerData.file);db.pragma('busy_timeout=10000');db.pragma('foreign_keys=ON');
 const {RefundService}=require('../src/lib/refunds.ts'),service=new RefundService(db);
 for(let i=0;i<10;i++)service.execute(workerData.actor,workerData.payload);
 db.close();Atomics.store(signal,0,1);
}catch(e){if(workerData.allow_rejection&&String(e).includes('Số tiền hoàn vượt')){Atomics.store(signal,0,2);Atomics.notify(signal,0);return;}process.stderr.write(String(e.stack)+'\n');Atomics.store(signal,0,-1)}finally{Atomics.notify(signal,0)}
