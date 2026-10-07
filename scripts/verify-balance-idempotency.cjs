const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const Module=require("node:module");
const ts=require("typescript");

const root=path.resolve(__dirname,"..");
const dbPath=process.env.DMD_VERIFY_DB||path.join(os.tmpdir(),"dmd-balance-idempotency-"+process.pid+".db");
process.env.DMD_DB_PATH=dbPath;
process.env.NODE_ENV="test";
for(const suffix of ["","-shm","-wal"])fs.rmSync(dbPath+suffix,{force:true});

const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){
  if(request.startsWith("@/")){
    const target=path.join(root,"src",request.slice(2));
    for(const candidate of [target,target+".ts",target+".tsx",path.join(target,"index.ts")])if(fs.existsSync(candidate))return candidate;
  }
  return originalResolve.call(this,request,parent,isMain,options);
};
require.extensions[".ts"]=function(module,filename){
  const source=fs.readFileSync(filename,"utf8");
  const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:filename});
  module._compile(result.outputText,filename);
};

const {db}=require(path.join(root,"src/lib/db.ts"));
const {createUser}=require(path.join(root,"src/lib/auth.ts"));
const credit=require(path.join(root,"src/lib/credit.ts"));
let checks=0;const assert=(v,m)=>{checks++;if(!v)throw Error(m)};const _rejects=(f,m)=>{let ok=false;try{f()}catch{ok=true}assert(ok,m)};
const admin=createUser({username:"fin.admin",display_name:"Admin",password:"TestPass123!",role:"ADMIN"});
const sales=createUser({username:"fin.sales",display_name:"Sales",password:"TestPass123!",role:"SALES"});
const client=createUser({username:"fin.client",display_name:"Client",password:"TestPass123!",role:"CLIENT",sales_user_id:sales.id});
const today=credit.localDay();
const _entry=(type,direction,amount,date=today)=>Number(db.prepare("INSERT INTO ledger_entries(client_user_id,entry_type,direction,amount,occurred_at) VALUES (?,?,?,?,?)").run(client.id,type,direction,amount,date).lastInsertRowid);


(async()=>{const ExcelJS=require('exceljs'),{importWorkbook}=require(path.join(root,'src/lib/importers.ts'));
const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Balance');sheet.addRow(['Ngày','Hạng mục','Số tiền','Service','Status']);sheet.addRow([today,'Payment',10,'bank','received']);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
const first=await importWorkbook('balance',bytes,'balance.xlsx',{actorId:admin.id}),second=await importWorkbook('balance',bytes,'renamed.xlsx',{actorId:admin.id});assert(first.batchId===second.batchId,'Identical balance upload reuses batch');assert(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE entry_type='PAYMENT'").get().n===1,'Import payment exactly once');assert(db.prepare("SELECT created_by_user_id FROM ledger_entries WHERE entry_type='PAYMENT'").get().created_by_user_id===admin.id,'Import retains actor');
const keyed=await importWorkbook('balance',bytes,'keyed.xlsx',{actorId:admin.id,requestKey:'explicit'});assert((await importWorkbook('balance',bytes,'keyed.xlsx',{actorId:admin.id,requestKey:'explicit'})).batchId===keyed.batchId,'Explicit upload retry');assert(db.prepare("SELECT COUNT(*) n FROM ledger_entries WHERE entry_type='PAYMENT'").get().n===1,'Same file with a new key still one payment');sheet.getCell('C2').value=11;let failed=false;try{await importWorkbook('balance',Buffer.from(await workbook.xlsx.writeBuffer()),'changed.xlsx',{actorId:admin.id,requestKey:'explicit'})}catch{failed=true}assert(failed,'Import key mismatch rejected');console.log(JSON.stringify({checks,ok:true}));db.close();for(const suffix of ['','-wal','-shm'])fs.rmSync(dbPath+suffix,{force:true});})().catch(e=>{console.error(e);process.exit(1)});
