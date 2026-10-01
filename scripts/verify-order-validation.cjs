const fs=require("node:fs"),path=require("node:path");
const base=process.env.E2E_BASE_URL||"http://localhost:3103";const stamp=Date.now();const results=[];
async function call(p,b,c){const response=await fetch(base+p,{method:b===undefined?"GET":"POST",headers:{"content-type":"application/json",...(c?{cookie:c}:{})},body:b===undefined?undefined:JSON.stringify(b)});return {status:response.status,data:await response.json().catch(()=>null),cookie:(response.headers.get("set-cookie")||"").split(";")[0]}}
async function main(){
 const login=await call("/api/auth/login",{username:"e2e.admin",password:"TestPass123!"});if(login.status!==200)throw Error("fixture admin missing");const cookie=login.cookie;
 for(const [name,edit] of [
  ["negative weight",{weight:-1}],["zero carton count",{carton_count:0}],["fractional carton count",{carton_count:1.5}],
  ["negative manual volume",{manual_volume:-100}],["negative dimensional divisor",{dimensional_divisor:-5000}],
  ["discount over 100",{discount:110,discount_note:"invalid"}],["negative discount",{discount:-5,discount_note:"invalid"}]
 ]){
  const fixture=await call("/api/orders",{order_id:"validation-"+stamp+"-"+name,customer:"QA validation",service:"ePacket",item:"Shirt",material:"Cotton",carton_count:1,weight:2,manual_volume:10000,sales_price:10},cookie);
  if(fixture.status!==201)throw Error(JSON.stringify(fixture));
  const r=await call("/api/orders",{id:fixture.data.id,...edit},cookie);
  results.push({name:"Reject edit: "+name,passed:r.status===400,status:r.status});
 }
 const ledger=await call("/api/ledger",{entry_type:"PAYMENT",direction:"CREDIT",amount:-50,note:"invalid negative payment"},cookie);
 results.push({name:"Reject negative ledger payment",passed:ledger.status===400,status:ledger.status});
 const report={passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
 const dir=path.resolve(".smoke/verification-20261001-2301");fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,"validation-"+stamp+".json"),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
