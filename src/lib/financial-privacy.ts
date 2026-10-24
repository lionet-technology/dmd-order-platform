import {NextRequest,NextResponse} from "next/server";
import {currentUser,isFinanceRole} from "./auth";
const protectedFinancePaths=new Set(["/api/costs","/api/reconciliation","/api/supplier-payables"]);
const privateKey=/^(net|base|base_cost|base_markup|retail_markup|gross_profit_base|commission_basis|commission_amount|guidance|pricing_snapshot_json|before_json|after_json|cost_snapshot_json|cost_coverage_json|effective_net_cost|estimated_gp|actual_gp|finalized_gp|estimated_margin_pct|finalized_margin_pct|gross_margin_pct|margin_status|reconciliation_delta|supplier_waiting|supplier_recovered_cents|net_claim_loss_cents|new_client_quality)$/i;
function hidden(key:string){return privateKey.test(key)||/net_cost|gross_profit_net|cost_coverage|cost_component|supplier_recover/i.test(key);}
export function operationalProjection(value:unknown):unknown{
 if(Array.isArray(value))return value.filter(v=>!v||typeof v!=="object"||((v as Record<string,unknown>).visibility!=="ADMIN"&&(v as Record<string,unknown>).entry_type!=="SERVICE_COST")).map(operationalProjection);
 if(value&&typeof value==="object"){
 const out:Record<string,unknown>={};
 for(const [key,item] of Object.entries(value)){
 if(hidden(key))continue;
 if(typeof item==="string"&&(key.endsWith("_json")||key==="tracking_data"||/^\s*[\[{]/.test(item))){try{out[key]=JSON.stringify(operationalProjection(JSON.parse(item)));}catch{out[key]=key.endsWith("_json")||key==="tracking_data"?null:item;}}
 else out[key]=operationalProjection(item);
 }
 return out;
 }
 return value;
}
// No role gains access to an endpoint here. Authentication remains in each handler.
// Only the three finance endpoints approved by Owner may return private financial data.
export function withFinancialPrivacy<A extends unknown[]>(handler:(req:NextRequest,...args:A)=>Promise<Response>){
 return async function(req:NextRequest,...args:A):Promise<Response>{
 const user=currentUser(req),path=req.nextUrl.pathname;
 const response=await handler(req,...args);
 if(!user||!response.headers.get("content-type")?.includes("application/json"))return response;
 if(isFinanceRole(user.role)&&protectedFinancePaths.has(path))return response;
 const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");headers.set("Cache-Control","private, no-store");
 return NextResponse.json(operationalProjection(await response.json()),{status:response.status,headers});
 };
}
