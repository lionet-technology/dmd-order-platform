// Creates a new isolated synthetic database; deliberately ignores all operator DB paths.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),ts=require('typescript'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-refund-browser-'));
process.env.DMD_DB_PATH=path.join(dir,'synthetic.db');process.env.NODE_ENV='test';
const resolve=Module._resolveFilename;Module._resolveFilename=function(r,p,m,o){if(r.startsWith('@/'))r=path.join(root,'src',r.slice(2));return resolve.call(this,r,p,m,o)};
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
const {db}=require('../src/lib/db.ts'),auth=require('../src/lib/auth.ts'),cases=require('../src/lib/cases.ts'),claims=require('../src/lib/claims.ts');
const create=(name,role,sales_user_id)=>auth.createUser({username:'uat.'+name,display_name:'UAT '+name,password:'UatRefund123!',role,sales_user_id,is_root_admin:role==='ADMIN'});
const admin=create('admin','ADMIN'),sales=create('sales','SALES'),client=create('client','CLIENT',sales.id);create('finance','FINANCE');create('bod','BOD');
const id=Number(db.prepare("INSERT INTO orders(client_user_id,sales_user_id,customer,order_id,system_order_code,workflow_status,service,supplier) VALUES (?,?,?,'UAT-REFUND','UAT-REFUND','PURCHASED','ePacket','DMD')").run(client.id,sales.id,client.display_name).lastInsertRowid);
const claim=cases.caseAction(client,{action:'create',kind:'CLAIM',visibility:'PUBLIC',order_ids:[id],summary:'Synthetic UAT refund claim'});
claims.claimAction(admin,{action:'finalize',case_id:claim.id,category:'LOST',refund_amount:10,compensation_amount:2,reason:'Synthetic approved obligation',request_key:'uat-initial-decision'});
db.close();fs.writeFileSync('/tmp/dmd-refund-browser-db-path.txt',process.env.DMD_DB_PATH);console.log(JSON.stringify({database:process.env.DMD_DB_PATH,users:['uat.admin','uat.sales','uat.finance','uat.client','uat.bod'],password:'UatRefund123!'}));
