const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,".."),temp=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-service-v1-"));
process.env.NODE_ENV="test";process.env.DMD_DB_PATH=path.join(temp,"test.db");
const original=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){return original.call(this,request.startsWith("@/")?path.join(root,"src",request.slice(2)):request,parent,...rest)};
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
module.exports={temp};
