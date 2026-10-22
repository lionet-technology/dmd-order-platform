// Fresh synthetic fixture only; never inherits an operator-selected DB.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const fixture=JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'seed-refund-uat.cjs')],{encoding:'utf8'}).trim());
process.env.DMD_DB_PATH=fixture.database;process.env.NODE_ENV='test';
require('./seed-epacket.cjs');
const {db}=require('../src/lib/db.ts'),{createUser}=require('../src/lib/auth.ts');
const client=db.prepare("SELECT id FROM users WHERE username='uat.client'").get();
db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,active,client_self_purchase,max_cartons_per_order) VALUES ('UPS','Express','KILOSHIP',1,1,8)").run();
db.prepare("INSERT INTO client_service_settings(client_user_id,service,sub_service,is_enabled,discount_percent) VALUES (?,'UPS','Express',1,0)").run(client.id);
createUser({username:'uat.warehouse',display_name:'UAT warehouse',password:'UatRefund123!',role:'WAREHOUSE'});
fs.writeFileSync(path.join(path.dirname(fixture.database),'owner-uat-fixture.json'),JSON.stringify({kind:'disposable-synthetic-owner-uat',database:fixture.database}));
fs.writeFileSync('/tmp/dmd-owner-browser-db-path.txt',fixture.database);
db.close();console.log(JSON.stringify(fixture));
