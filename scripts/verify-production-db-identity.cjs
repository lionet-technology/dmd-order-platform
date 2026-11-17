require('./service-v1-test-env.cjs');
const assert=require('node:assert/strict'),Module=require('node:module');
process.env.NODE_ENV='production';
const file=require.resolve('../src/lib/db.ts');
let first,second,checks=0;const eq=(a,b)=>{checks++;assert.deepEqual(a,b)};
try{
 first=require(file).db;
 // Model a second server bundle evaluating the same source outside Node's module cache.
 const copy=new Module(file,module);copy.filename=file;copy.paths=module.paths;
 require.extensions['.ts'](copy,file);second=copy.exports.db;
 eq(first,second);
 first.transaction(()=>{
  second.prepare("INSERT INTO enum_values(enum_type,value,parent_value,active) VALUES ('SUPPLIER','TEST-PRODUCTION-IDENTITY','',1)").run();
  eq(first.prepare("SELECT count(*) n FROM enum_values WHERE value='TEST-PRODUCTION-IDENTITY'").get().n,1);
  throw Error('TEST rollback');
 }).immediate();
}catch(e){if(e.message!=='TEST rollback')throw e;
 eq(first.prepare("SELECT count(*) n FROM enum_values WHERE value='TEST-PRODUCTION-IDENTITY'").get().n,0);
 eq(first.pragma('integrity_check',{simple:true}),'ok');
 console.log('PRODUCTION DB IDENTITY PASS ('+checks+' assertions)');
}finally{if(first?.open)first.close();}
