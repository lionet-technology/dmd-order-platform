const {workerData:w,parentPort}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
process.env.DMD_DB_PATH=w.file;process.env.NODE_ENV='test';
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(r,p,m,o){return resolve.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts');require('../src/lib/auth.ts');require('../src/lib/cases.ts');
const {vndAction}=require('../src/lib/vnd-operational.ts'),{completeReserve}=require('../src/lib/credit.ts');
parentPort.once('message',()=>{
 try{const actor=db.prepare('SELECT * FROM users WHERE id=?').get(w.actor);for(let i=0;i<3;i++){if(w.weekly)require('../src/lib/vnd-statements.ts').closeVndWeeklyStatements(w.input.client_id,undefined,new Date(w.weekly));else if(w.charge)completeReserve(w.charge,actor.id);else if(w.supplier)require('../src/lib/vnd-supplier.ts').vndSupplierAction(actor,w.input);else vndAction(actor,w.input);}parentPort.postMessage({ok:true});}
 catch(e){parentPort.postMessage({ok:false,error:String(e.message)});}
 finally{db.close();parentPort.close();}
});
parentPort.postMessage({ready:true});
