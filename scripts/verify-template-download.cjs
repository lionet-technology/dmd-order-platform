const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),Module=require("node:module"),ts=require("typescript");
const root=path.resolve(__dirname,".."),temporary=fs.mkdtempSync(path.join(os.tmpdir(),"dmd-template-download-"));
process.env.DMD_DB_PATH=path.join(temporary,"test.db");process.env.NODE_ENV="test";
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,isMain,options){if(request.startsWith("@/"))request=path.join(root,"src",request.slice(2))+".ts";return resolve.call(this,request,parent,isMain,options)};
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename);
const {db}=require("../src/lib/db.ts"),{createUser,createSession}=require("../src/lib/auth.ts"),{NextRequest}=require("next/server");
const {GET}=require("../src/app/api/purchase-template-versions/[id]/download/route.ts"),{POST:uploadTemplate}=require("../src/app/api/purchase-templates/route.ts"),{File}=require("node:buffer");
let checks=0;const check=(ok,message)=>{checks++;if(!ok)throw Error(message)};
async function main(){
 const tokens={};let salesId;for(const role of ["ADMIN","SALES","CLIENT"]){const user=createUser({username:"download."+role,display_name:role,password:"TestPass123!",role,sales_user_id:role==="CLIENT"?salesId:undefined});if(role==="SALES")salesId=user.id;tokens[role]=createSession(user.id).token}
 const request=(id,role)=>GET(new NextRequest("http://localhost/api/purchase-template-versions/"+id+"/download",{headers:role?{cookie:"dmd_session="+tokens[role]}:{}}),{params:Promise.resolve({id:String(id)})});
 const routeId=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier) VALUES ('ePacket','Standard','DMD')").run().lastInsertRowid);
 for(const kind of ["PURCHASE","MANIFEST"]){
  const templateId=Number(db.prepare("INSERT INTO purchase_templates(route_config_id,name,template_kind,output_mode) VALUES (?,?,?,'MULTI_ORDER')").run(routeId,kind,kind).lastInsertRowid);
  const file=path.join(root,"config/templates/epacket-standard-dmd",kind.toLowerCase()+".xlsx");
  const versionId=Number(db.prepare("INSERT INTO purchase_template_versions(template_id,version_number,original_filename,stored_path,status) VALUES (?,1,?,?,'ACTIVE')").run(templateId,"Mẫu "+kind+".xlsx",file).lastInsertRowid);
  for(const role of [undefined,"SALES","CLIENT"])check((await request(versionId,role)).status>=400,"download must require Admin");
  const response=await request(versionId,"ADMIN");check(response.status===200,"Admin can download "+kind);
  check(Buffer.from(await response.arrayBuffer()).equals(fs.readFileSync(file)),"download must preserve exact workbook bytes and placeholders");
  check(response.headers.get("content-disposition").includes(encodeURIComponent("Mẫu "+kind+".xlsx")),"Unicode filename must be encoded safely");
  check(response.headers.get("cache-control")==="private, no-store","private downloads must not be cached");
  db.prepare("UPDATE purchase_template_versions SET status='DRAFT' WHERE id=?").run(versionId);
  check((await request(versionId,"ADMIN")).status===404,"draft version must not download");
  db.prepare("UPDATE purchase_template_versions SET status='ACTIVE',stored_path=? WHERE id=?").run(path.join(temporary,"missing.xlsx"),versionId);
  check((await request(versionId,"ADMIN")).status===404,"missing workbook must return a friendly error");
 }
 check((await request(99999,"ADMIN")).status===404,"unknown version must not download");
 check((await request("invalid","ADMIN")).status===400,"invalid version must be rejected");
 const isolatedRoute=Number(db.prepare("INSERT INTO service_route_configs(service,sub_service,supplier,route_variables_json) VALUES ('Isolated','Standard','DMD',?)").run(JSON.stringify({purchase_service_code:"EPK",internal_service:"Standard"})).lastInsertRowid);
 const form=new FormData();
 for(const [key,value] of Object.entries({route_config_id:isolatedRoute,template_kind:"PURCHASE",name:"Isolation check",output_mode:"MULTI_ORDER",repeat_sections:JSON.stringify([{sheet:"Sheet1",row:2,scope:"CARTON"}])}))form.set(key,String(value));
 const uploadBytes=fs.readFileSync(path.join(root,"config/templates/epacket-standard-dmd/purchase.xlsx"));
 form.set("file",new File([uploadBytes],"purchase.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
 const uploadResponse=await uploadTemplate(new NextRequest("http://localhost/api/purchase-templates",{method:"POST",headers:{cookie:"dmd_session="+tokens.ADMIN},body:form}));
 const uploadBody=await uploadResponse.json();check(uploadResponse.status===201&&!uploadBody.errors.length,"isolated template upload must validate");
 const storedPath=String(uploadBody.version.stored_path);check(storedPath.startsWith(temporary+path.sep),"template storage must follow the configured database directory");check(fs.existsSync(storedPath),"isolated uploaded workbook must be stored beside its test database");
 console.log("TEMPLATE DOWNLOAD PASS ("+checks+" assertions)");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{db.close();fs.rmSync(temporary,{recursive:true,force:true})});
