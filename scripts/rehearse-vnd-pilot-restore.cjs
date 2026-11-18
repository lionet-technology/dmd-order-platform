// Isolated synthetic rehearsal only, never a deployment/production restore.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
require('./verify-vnd-period-close.cjs');
const Database=require('better-sqlite3'),source=process.env.DMD_DB_PATH,backup=path.join(path.dirname(source),'TEST-backup.db'),restored=path.join(path.dirname(source),'TEST-restored.db');
const tables=['vnd_supplier_periods','vnd_supplier_ledger','vnd_supplier_costs','vnd_supplier_claims','vnd_supplier_claim_events','vnd_supplier_posting_links','vnd_commands','vnd_ledger'];
const original=new Database(source,{readonly:true}),before=Object.fromEntries(tables.map(t=>[t,original.prepare('SELECT * FROM '+t+' ORDER BY rowid').all()]));
original.backup(backup).then(()=>{
 original.close();fs.copyFileSync(backup,restored);
 const check=new Database(restored,{readonly:true});
 assert.equal(check.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(check.pragma('foreign_key_check'),[]);
 for(const t of tables)assert.deepEqual(check.prepare('SELECT * FROM '+t+' ORDER BY rowid').all(),before[t]);
 check.close();
 const output=path.resolve(process.argv[2] || path.join(__dirname,'../artifacts/vnd-v1-close-reconciliation-2026-11-17/pilot-restore.json'));
 fs.writeFileSync(output,JSON.stringify({status:'PASS',data:'TEST FIXTURES ONLY — NO REAL DOCUMENTS',source,backup,restored,tables:tables.map(t=>({name:t,rows:before[t].length})),verified:['SQLite integrity','foreign keys','byte-identical frozen snapshots','late-adjustment original links','separate payable and receivable journals','commands and Client journal unchanged'],not_verified:['real Supplier documents','deployment-target restore','production credentials','operator acceptance','production financial actions']},null,2));
 console.log('SYNTHETIC PILOT RESTORE PASS ('+tables.length+' table comparisons, integrity and foreign keys)');
}).catch(e=>{console.error(e);process.exitCode=1;});
