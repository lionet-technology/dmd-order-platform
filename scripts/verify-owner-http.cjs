// Starts only owned localhost servers on disposable databases. No reset of existing DBs.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-owner-http-'));
function run(script,env={}){const r=spawnSync(process.execPath,[path.join(__dirname,script+'.cjs')],{cwd:root,env:{...process.env,...env},encoding:'utf8'});console.log(r.stdout);if(r.status!==0)throw Error(script+': '+r.stderr);return r.stdout}
async function scenario(database,port,suites){
// Refuse an occupied port before sending any test request.
await new Promise((resolve,reject)=>{const server=require('node:net').createServer();server.once('error',reject);server.listen(port,'127.0.0.1',()=>server.close(resolve))});
const log=fs.openSync(path.join(dir,port+'.log'),'w');
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{cwd:root,env:{...process.env,NODE_ENV:'production',DMD_DB_PATH:database},stdio:['ignore',log,log]});
try{let ready=false;for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('Server failed: '+fs.readFileSync(path.join(dir,port+'.log'),'utf8'));try{await fetch('http://127.0.0.1:'+port+'/api/auth/me');ready=true;break}catch{}await new Promise(r=>setTimeout(r,250))}if(!ready)throw Error('Server timeout');
for(const suite of suites)run(suite,{E2E_BASE_URL:'http://127.0.0.1:'+port});
}finally{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));fs.closeSync(log)}}
(async()=>{
await scenario(path.join(dir,'orders-test.db'),34501,['e2e-order-api','e2e-operations','e2e-finance-domain','e2e-manifest-scan','e2e-order-cancellation']);
// Cancellation continues on the same owned fixture after order/API setup.
const owner=run('verify-owner-credit').match(/isolated DB (.+)/)[1].trim();
await scenario(owner,34503,['e2e-owner-credit']);
const fixture=JSON.parse(run('seed-owner-uat').trim());
await scenario(fixture.database,3158,['e2e-owner-manual']);
const statements=JSON.parse(run('seed-refund-uat').trim());
await scenario(statements.database,34504,['e2e-statements-v2']);
const overview=path.join(root,'.smoke','internal-uat-test-owner-http-'+Date.now()+'.db');
run('seed-internal-uat',{NODE_ENV:'test',DMD_DB_PATH:overview});
run('seed-bulk-ledger-uat',{NODE_ENV:'test',DMD_DB_PATH:overview});
await scenario(overview,3121,['e2e-balance-overview','e2e-finance-list']);
console.log('OWNER HTTP SUITES PASS; logs '+dir);
})().catch(e=>{console.error(e);process.exitCode=1});
