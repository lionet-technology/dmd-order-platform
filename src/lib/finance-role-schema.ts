import {db} from "./db";
// Schema-only migration: preserve all columns, IDs, sessions, indexes and balances.
// No legacy account is promoted to either financial role.
export function ensureFinanceRoles(){
 const original=(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as {sql:string}).sql;
 if(original.includes("'FINANCE'"))return;
 const indexes=db.prepare("SELECT sql FROM sqlite_master WHERE tbl_name='users' AND type='index' AND sql IS NOT NULL").all() as {sql:string}[];
 const columns=(db.prepare("PRAGMA table_info(users)").all() as {name:string}[]).map(c=>'"'+c.name.replace(/"/g,'""')+'"').join(",");
 const fk=Number(db.pragma("foreign_keys",{simple:true}));
 db.pragma("foreign_keys = OFF");
 try{db.transaction(()=>{
 const sql=(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as {sql:string}).sql;
 if(sql.includes("'FINANCE'"))return;
 db.exec(sql.replace(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`]?users["`]?/i,"CREATE TABLE users_finance_upgrade").replace("'WAREHOUSE'","'WAREHOUSE','BOD','FINANCE'"));
 db.exec("INSERT INTO users_finance_upgrade("+columns+") SELECT "+columns+" FROM users; DROP TABLE users; ALTER TABLE users_finance_upgrade RENAME TO users;");
 for(const index of indexes)db.exec(index.sql);
 const violations=db.prepare("PRAGMA foreign_key_check").all();
 if(violations.length)throw Error("Finance role migration failed FK validation.");
 })();}finally{db.pragma("foreign_keys = "+fk);}
}
