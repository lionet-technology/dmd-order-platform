const fs=require("node:fs"),path=require("node:path"),Module=require("node:module"),ts=require("typescript"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,"..");
const work=path.join(root,".smoke","verification-20261001-2301","migration-"+Date.now());
fs.mkdirSync(work,{recursive:true});
process.env.DMD_DB_PATH=path.join(work,"legacy.db");process.env.NODE_ENV="production";
const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){
 if(request.startsWith("@/")){const target=path.join(root,"src",request.slice(2));for(const p of [target,target+".ts",target+".tsx"])if(fs.existsSync(p))return p}
 return originalResolve.call(this,request,parent,isMain,options);
};
function compile(module,filename,source=fs.readFileSync(filename,"utf8")){
 module._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename);
}
require.extensions[".ts"]=compile;
const filename=path.join(work,"baseline-db.ts");const old=new Module(filename,module);old.filename=filename;old.paths=Module._nodeModulePaths(work);
compile(old,filename,execFileSync("git",["show","00831dd:src/lib/db.ts"],{cwd:root,encoding:"utf8"}));
let db=old.exports.db;
const password="LegacyTest123!",salt=crypto.randomBytes(16).toString("hex"),hash="scrypt:"+salt+":"+crypto.scryptSync(password,salt,64).toString("hex");
db.prepare("INSERT INTO users(id,username,display_name,password_hash,role,is_root_admin) VALUES (1,'legacy.admin','Legacy Admin',?,'ADMIN',1)").run(hash);
db.prepare("INSERT INTO users(id,username,display_name,password_hash,role) VALUES (2,'legacy.sales','Legacy Sales',?,'SALES')").run(hash);
const tokenHash=crypto.createHash("sha256").update("legacy-session-fixture").digest("hex");
db.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(1,1,?,'2100-01-01T00:00:00.000Z')").run(tokenHash);
db.prepare("INSERT INTO orders(id,created_at,tracking,label,order_id,customer,sales,sales_price,surcharge,import_tax,total_due) VALUES(10,'2026-09-27','LEGACY-TRACK','https://labels.test/old.pdf','LEGACY-ORDER','Legacy Customer','Legacy Sales',100,2,3,105)").run();
db.prepare("INSERT INTO ledger_entries(entry_type,direction,amount,reference_type,reference_id,customer) VALUES('ORDER_CHARGE','DEBIT',105,'TRACKING','LEGACY-TRACK','Legacy Customer')").run();
const expectedUsers=db.prepare("SELECT id,username,role,password_hash,is_root_admin FROM users ORDER BY id").all();
db.close();
db=require(path.join(root,"src/lib/db.ts")).db;
const {verifyPassword,createUser,requireUser}=require(path.join(root,"src/lib/auth.ts"));
const {NextRequest}=require("next/server");
const {addOrderTracking}=require(path.join(root,"src/lib/order-operations.ts"));
const results=[];function check(name,passed){results.push({name,passed:Boolean(passed)})}
check("Legacy user IDs/password hashes/roles preserved",JSON.stringify(expectedUsers)===JSON.stringify(db.prepare("SELECT id,username,role,password_hash,is_root_admin FROM users ORDER BY id").all()));
check("Existing password verifies after users-table rebuild",verifyPassword(password,db.prepare("SELECT password_hash FROM users WHERE id=1").get().password_hash));
check("Existing sessions preserved",db.prepare("SELECT COUNT(*) c FROM sessions WHERE id=1 AND user_id=1 AND token_hash=?").get(tokenHash).c===1);
const legacyAuth=requireUser(new NextRequest("http://localhost/api/orders",{headers:{cookie:"dmd_session=legacy-session-fixture"}}));
check("Existing session authenticates after migration",!legacyAuth.error&&legacyAuth.user.id===1&&legacyAuth.user.role==="ADMIN");
const newClient=createUser({username:"legacy.client",display_name:"Legacy Client",password,role:"CLIENT",sales_user_id:2,created_by_user_id:1});
check("Client role accepted after migration",newClient.role==="CLIENT"&&newClient.sales_user_id===2);
check("Legacy primary tracking converted exactly once",db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=10 AND tracking='LEGACY-TRACK'").get().c===1);
check("Legacy label preserved",db.prepare("SELECT label_url FROM order_trackings WHERE order_id=10").get().label_url==="https://labels.test/old.pdf");
check("Legacy order ID and payable amount preserved",db.prepare("SELECT order_id,total_due FROM orders WHERE id=10").get().order_id==="LEGACY-ORDER"&&db.prepare("SELECT total_due FROM orders WHERE id=10").get().total_due===105);
check("DMD ID generated for legacy order",db.prepare("SELECT system_order_code FROM orders WHERE id=10").get().system_order_code==="DMD-20260927-000010");
check("SQLite integrity passes",db.pragma("quick_check")[0].quick_check==="ok");
check("Migration does not break foreign keys",db.pragma("foreign_key_check").length===0);
addOrderTracking({orderId:10,tracking:"LEGACY-AUX",labelUrl:"https://labels.test/aux.pdf"});
check("Updating legacy order does not double-charge balance",db.prepare("SELECT COUNT(*) c,SUM(amount) amount FROM ledger_entries WHERE entry_type='ORDER_CHARGE'").get().c===1&&db.prepare("SELECT SUM(amount) amount FROM ledger_entries WHERE entry_type='ORDER_CHARGE'").get().amount===105);
db.close();delete require.cache[require.resolve(path.join(root,"src/lib/db.ts"))];
db=require(path.join(root,"src/lib/db.ts")).db;
check("Repeat startup does not duplicate primary tracking",db.prepare("SELECT COUNT(*) c FROM order_trackings WHERE order_id=10 AND tracking='LEGACY-TRACK'").get().c===1);
check("Repeat startup keeps sessions",db.prepare("SELECT COUNT(*) c FROM sessions WHERE id=1 AND token_hash=?").get(tokenHash).c===1);
db.close();
const report={created_at:new Date().toISOString(),passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
fs.writeFileSync(path.join(work,"result.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,failed:report.failed,failures:results.filter(x=>!x.passed)},null,2));
if(report.failed)process.exitCode=1;
