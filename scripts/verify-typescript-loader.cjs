// Deterministic TypeScript loader for domain verification on Node without built-in TS support.
// Does not initialize any database or select an operational data path.
const fs=require("node:fs"),Module=require("node:module"),path=require("node:path");
const root=path.resolve(__dirname,".."),ts=require("typescript"),original=Module._resolveFilename;
require.extensions[".ts"]=require.extensions[".tsx"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);
Module._resolveFilename=function(request,parent,...rest){return original.call(this,request.startsWith("@/")?path.join(root,"src",request.slice(2)):request,parent,...rest)};
