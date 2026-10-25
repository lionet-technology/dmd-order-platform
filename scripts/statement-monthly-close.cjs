// Explicit integration entry point. No scheduler is installed by this command.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
if(!process.env.DMD_DB_PATH||!path.isAbsolute(process.env.DMD_DB_PATH)||!fs.existsSync(process.env.DMD_DB_PATH))throw Error('Select an existing absolute DMD_DB_PATH; backup before first migration.');
const actorId=Number(process.env.DMD_STATEMENT_ACTOR_ID),through=process.argv[2];
if(!Number.isSafeInteger(actorId)||actorId<=0||!through)throw Error('DMD_STATEMENT_ACTOR_ID and YYYY-MM argument required.');
const root=path.resolve(__dirname,'..'),ts=require('typescript'),resolver=Module._resolveFilename;
Module._resolveFilename=function(r,p,m,o){return resolver.call(this,r.startsWith('@/')?path.join(root,'src',r.slice(2)):r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts');
try{
 const actor=db.prepare("SELECT * FROM users WHERE id=? AND active=1 AND role IN ('ADMIN','FINANCE')").get(actorId);
 if(!actor)throw Error('Active Admin/Finance actor required.');
 const {closeMonthlyStatements}=require('../src/lib/statement-monthly-close.ts');
 let cursor=0,reviews=0;
 do{const result=closeMonthlyStatements(actor,through,cursor);console.log(JSON.stringify(result));cursor=result.next_client_id;reviews=Math.max(reviews,result.review.length,result.remaining_client_ids.length);}while(cursor!==null);
 if(reviews)process.exitCode=2;
}finally{db.close();}
