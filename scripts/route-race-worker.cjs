const {workerData}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const ready=new Int32Array(workerData.ready),gate=new Int32Array(workerData.gate),outcome=new Int32Array(workerData.outcome);
let db;
try {
 if(workerData.mode==='purchase'){
  process.env.DMD_DB_PATH=workerData.file;process.env.NODE_ENV='test';
  const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){return resolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
  require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
  db=require('../src/lib/db.ts').db;
 }else {db=new(require('better-sqlite3'))(workerData.file);db.pragma('busy_timeout=10000');}
 Atomics.store(ready,0,1);Atomics.notify(ready,0);
 while(!Atomics.load(gate,0))Atomics.wait(gate,0,0,30000);
 if(workerData.mode==='purchase'){
  try {require('../src/lib/route-pricing.ts').purchaseService(workerData.order,workerData.actor,true,workerData.quote);Atomics.store(outcome,0,1);}
  catch(e){if(/ngừng hoạt động|Route.*active/i.test(String(e)))Atomics.store(outcome,0,2);else throw e;}
 }else {db.transaction(()=>db.prepare('UPDATE service_route_configs SET active=0 WHERE id=?').run(workerData.route)).immediate();Atomics.store(outcome,0,1);}
}catch(e){process.stderr.write(String(e.stack||e)+'\n');Atomics.store(outcome,0,-1);Atomics.store(ready,0,-1);Atomics.notify(ready,0);}
finally {if(db)db.close();Atomics.notify(outcome,0);}
