const {workerData}=require('node:worker_threads'),fs=require('node:fs'),ts=require('typescript');
const signal=new Int32Array(workerData.signal),RealDate=Date;
try{
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[workerData.now]))}static now(){return new RealDate(workerData.now).getTime()}};
 process.env.DMD_DB_PATH=workerData.file;process.env.NODE_ENV='test';
 require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
 const {finalizeStatement}=require('../src/lib/statements-v2.ts');
 for(let i=0;i<10;i++)finalizeStatement(workerData.actor,workerData.client,workerData.start,workerData.end);
 require('../src/lib/db.ts').db.close();Atomics.store(signal,0,1);
}catch(e){process.stderr.write(String(e.stack)+'\n');Atomics.store(signal,0,-1)}finally{Atomics.notify(signal,0)}
