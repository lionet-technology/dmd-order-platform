// Route modules may initialize SQLite while Next collects build metadata.
// Never let a build load the operator's default or explicitly selected DB.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dmd-build-'));
try{
 const result=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build',...process.argv.slice(2)],{
  cwd:path.resolve(__dirname,'..'),env:{...process.env,DMD_DB_PATH:path.join(directory,'build.db')},stdio:'inherit'
 });
 if(result.error)throw result.error;
 process.exitCode=result.status===null?1:result.status;
}finally{
 fs.rmSync(directory,{recursive:true,force:true});
}
