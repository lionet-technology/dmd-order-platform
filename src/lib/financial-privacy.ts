import {NextRequest,NextResponse} from "next/server";
import {currentUser,isFinanceRole} from "./auth";
import {privateSupplierNames,redactPrivateContent} from './private-content';
const protectedFinancePaths=new Set(["/api/costs","/api/reconciliation","/api/supplier-payables"]);
const privateKey=/^(net|base|base_cost|base_markup|retail_markup|gross_profit_base|commission_basis|commission_amount|guidance|pricing_snapshot_json|before_json|after_json|cost_snapshot_json|cost_coverage_json|effective_net_cost|estimated_gp|actual_gp|finalized_gp|estimated_margin_pct|finalized_margin_pct|gross_margin_pct|margin_status|reconciliation_delta|supplier_waiting|supplier_recovered_cents|net_claim_loss_cents|new_client_quality)$/i;
function hidden(key:string){return privateKey.test(key)||/net_cost|gross_profit_net|cost_coverage|cost_component|supplier_recover/i.test(key)||/^(true_cost|estimated_cost|gp_net|net_price|unit_cost|cost_price)$/i.test(key);}
export function operationalProjection(value:unknown,hideSupplier=false,names:readonly string[]=[]):unknown{
 if(Array.isArray(value))return value.filter(v=>!v||typeof v!=="object"||((v as Record<string,unknown>).visibility!=="ADMIN"&&(v as Record<string,unknown>).entry_type!=="SERVICE_COST"&&(!hideSupplier||(v as Record<string,unknown>).enum_type!=="SUPPLIER"))).map(v=>operationalProjection(v,hideSupplier,names));
 if(value&&typeof value==="object"){
 const out:Record<string,unknown>={};
 for(const [key,item] of Object.entries(value)){
 if(hidden(key)||(hideSupplier&&(/supplier/i.test(key)||/^(base_rate|markup|source_code)$/i.test(key))))continue;
 if(typeof item==="string"&&(key.endsWith("_json")||key==="tracking_data"||/^\s*[\[{]/.test(item))){try{out[key]=JSON.stringify(operationalProjection(JSON.parse(item),hideSupplier,names));}catch{out[key]=key.endsWith("_json")||key==="tracking_data"?null:hideSupplier?redactPrivateContent(item,names):item;}}
 else if(hideSupplier&&typeof item==='string'&&!/^(service|sub_service|tracking|normalized_tracking|system_order_code|order_id|client_order_ref|client_order_id|username|role|status|workflow_status|event_type|entry_type|created_at|updated_at)$/.test(key)){
  const clean=redactPrivateContent(item,names);
  out[key]=/^(label|label_url|attachment_url|download_url)$/i.test(key)&&(clean!==item||! /^(https?:\/\/|\/(?!\/))/i.test(item))?null:clean;
 }
 else out[key]=operationalProjection(item,hideSupplier,names);
 }
 return out;
 }
 return hideSupplier&&typeof value==='string'?redactPrivateContent(value,names):value;
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
 const hideSupplier=user.role==="CLIENT"||user.role==="SALES";
 return NextResponse.json(operationalProjection(await response.json(),hideSupplier,hideSupplier?privateSupplierNames():[]),{status:response.status,headers});
 };
}
