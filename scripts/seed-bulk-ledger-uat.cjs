// Additive fixture; hard bound to the independent DB created for this UAT.
const path=require('node:path'),fs=require('node:fs');
const expected=path.resolve(__dirname,'../.smoke/internal-uat-test-ledger-oct18.db');
const target=process.env.DMD_DB_PATH||'';
const ownedSummary=fs.existsSync(target+'.summary.json')?JSON.parse(fs.readFileSync(target+'.summary.json','utf8')):null;
const freshUat=path.dirname(target)===path.resolve(__dirname,'../.smoke')&&/^internal-uat-test-owner-http-[a-z0-9-]+\.db$/.test(path.basename(target))&&ownedSummary?.database===target;
if(process.env.NODE_ENV!=='test'||(target!==expected&&!freshUat))throw Error('Dedicated UAT DB only');
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts'),{addLedgerEntry}=require('../src/lib/finance.ts');
const admin=db.prepare("SELECT * FROM users WHERE username='epacket.admin'").get(),sales=db.prepare("SELECT * FROM users WHERE username='epacket.sales'").get();
if(db.prepare("SELECT id FROM users WHERE username='uat.partial'").get())throw Error('Fixture already exists');
const client=createUser({username:'uat.partial',display_name:'UAT Partial Balance',role:'CLIENT',sales_user_id:sales.id,password:'Demo12345!',created_by_user_id:admin.id});
for(const setting of db.prepare("SELECT * FROM client_service_settings WHERE client_user_id=(SELECT id FROM users WHERE username='uat.client.4')").all())db.prepare('INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent,updated_by_user_id) VALUES (?,?,?,1,0,?)').run(client.id,setting.service,setting.sub_service,admin.id);
addLedgerEntry({client_user_id:client.id,entry_type:'PAYMENT',direction:'CREDIT',amount:15,customer:client.display_name,occurred_at:'2026-10-18',request_key:'uat-partial-opening',created_by_user_id:admin.id,note:'Synthetic UAT only'});
const risk=createUser({username:'uat.overdue',display_name:'UAT Overdue Risk',role:'CLIENT',sales_user_id:sales.id,password:'Demo12345!',created_by_user_id:admin.id});
require('../src/lib/credit.ts').financialAction(admin,risk.id,{action:'additional_fee',occurred_at:'2026-09-01',quantity:1,unit_price:50,note:'Synthetic overdue UAT',request_key:'uat-overdue-fee'});

console.log({id:client.id,username:client.username}); db.close();
