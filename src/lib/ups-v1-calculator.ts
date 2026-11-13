export type UpsAccount="VTT"|"SDS"|"JD";
export type UpsGlobals={fuel:number;vat:number;us_broker:number;customs_per_kg_vnd:number};
export type UpsRate={zone:string;min_kg:number;max_kg:number;min_inclusive:boolean;max_inclusive:boolean;unit:"FIXED"|"PER_KG";rate_vnd:number};
export type UpsAccountPricing={account:UpsAccount;zone:string;rates:UpsRate[];net_discount:number;shipment_surcharge_vnd:number;shipment_discount:number;weight_surcharge_vnd_per_kg:number;weight_discount:number};
export type UpsRoundingPolicy={divisor:number;carton_step_kg:number;lot_threshold_kg:number;lot_step_at_or_below_kg:number;lot_step_above_kg:number};
function nonnegative(value:number,name:string) {if(typeof value!=="number"||!Number.isFinite(value)||value<0)throw Error(name+" phải là số không âm.");return value;}
function positive(value:number,name:string) {nonnegative(value,name);if(value===0)throw Error(name+" phải lớn hơn 0.");return value;}
function discount(value:number,name:string) {nonnegative(value,name);if(value>1)throw Error(name+" phải là tỷ lệ từ 0 đến 1.");return value;}
function safe(value:number) {if(!Number.isFinite(value)||value>Number.MAX_SAFE_INTEGER)throw Error("UPS cost vượt độ chính xác.");return value;}
export function validateUpsGlobals(input:UpsGlobals):UpsGlobals {
 return {fuel:nonnegative(input.fuel,"Fuel"),vat:nonnegative(input.vat,"VAT"),us_broker:nonnegative(input.us_broker,"US Broker"),customs_per_kg_vnd:nonnegative(input.customs_per_kg_vnd,"Customs")};
}
/** The caller must supply an approved Sub-Service policy. There are no carrier-policy defaults. */
export function upsLotBillable(cartons:Array<{weight_kg:number;length_cm:number;width_cm:number;height_cm:number}>,policy:UpsRoundingPolicy) {
 if(!Array.isArray(cartons)||!cartons.length)throw Error("Lot cần carton.");
 for(const [key,value] of Object.entries(policy))positive(value,key);
 for(const key of ["divisor","carton_step_kg","lot_threshold_kg","lot_step_at_or_below_kg","lot_step_above_kg"] as const)positive(policy[key],key);
 const up=(value:number,step:number)=>safe(Math.ceil(value/step)*step);
 const rows=cartons.map(c=>{
  const actual=positive(c.weight_kg,"Carton weight"),dimensional=safe(positive(c.length_cm,"Length")*positive(c.width_cm,"Width")*positive(c.height_cm,"Height")/policy.divisor);
  const actual_rounded_kg=up(actual,policy.carton_step_kg),dimensional_rounded_kg=up(dimensional,policy.carton_step_kg);
  return {actual_rounded_kg,dimensional_rounded_kg,billable_kg:Math.max(actual_rounded_kg,dimensional_rounded_kg)};
 });
 const carton_total_kg=safe(rows.reduce((sum,c)=>sum+c.billable_kg,0));
 return {cartons:rows,carton_total_kg,billable_kg:up(carton_total_kg,carton_total_kg<=policy.lot_threshold_kg?policy.lot_step_at_or_below_kg:policy.lot_step_above_kg)};
}
export function validateUpsRates(rates:UpsRate[]) {
 if(!Array.isArray(rates)||!rates.length)throw Error("Thiếu UPS rate card.");
 for(const r of rates) {
  if(typeof r.zone!=="string"||!r.zone.trim()||typeof r.min_inclusive!=="boolean"||typeof r.max_inclusive!=="boolean")throw Error("Cần zone và cận Min/Max rõ ràng.");
  nonnegative(r.min_kg,"Min kg");positive(r.max_kg,"Max kg");nonnegative(r.rate_vnd,"Rate");
  if(r.min_kg>=r.max_kg||!["FIXED","PER_KG"].includes(r.unit))throw Error("UPS rate interval/unit không hợp lệ.");
 }
 for(let i=0;i<rates.length;i++)for(let j=i+1;j<rates.length;j++) {
  const a=rates[i],b=rates[j];if(a.zone!==b.zone)continue;
  const lo=Math.max(a.min_kg,b.min_kg),hi=Math.min(a.max_kg,b.max_kg);
  const contains=(r:UpsRate,w:number)=>(w>r.min_kg||(w===r.min_kg&&r.min_inclusive))&&(w<r.max_kg||(w===r.max_kg&&r.max_inclusive));
  if(lo<hi||(lo===hi&&contains(a,lo)&&contains(b,lo)))throw Error("UPS rate card bị chồng khoảng cân.");
 }
}
/** One Lot calculation. Shipment surcharge is applied once per Lot; fractional VND is retained. */
export function upsAccountNet(input:UpsAccountPricing,weightKg:number,variables:UpsGlobals) {
 if(!["VTT","SDS","JD"].includes(input.account))throw Error("UPS account chưa được hỗ trợ.");
 positive(weightKg,"Billable kg");validateUpsRates(input.rates);
 if(typeof input.zone!=="string"||!input.zone.trim())throw Error("Thiếu account zone.");
 const rate=input.rates.find(r=>r.zone===input.zone&&(weightKg>r.min_kg||(weightKg===r.min_kg&&r.min_inclusive))&&(weightKg<r.max_kg||(weightKg===r.max_kg&&r.max_inclusive)));
 if(!rate)throw Error("Thiếu rate phù hợp cho account/zone/kg.");
 const g=validateUpsGlobals(variables);
 const transportation_vnd=safe(rate.rate_vnd*(rate.unit==="PER_KG"?weightKg:1));
 const transportation_discounted_vnd=transportation_vnd*(1-discount(input.net_discount,"Net discount"));
 const shipment_vnd=nonnegative(input.shipment_surcharge_vnd,"Shipment surcharge")*(1-discount(input.shipment_discount,"Shipment discount"));
 const weight_vnd=nonnegative(input.weight_surcharge_vnd_per_kg,"Weight surcharge")*(1-discount(input.weight_discount,"Weight discount"))*weightKg;
 const net_vnd=safe((1+g.fuel)*(1+g.vat)*(transportation_discounted_vnd+shipment_vnd+weight_vnd)+g.us_broker*transportation_discounted_vnd+g.customs_per_kg_vnd*weightKg);
 return {account:input.account,zone:input.zone,weight_kg:weightKg,rate,transportation_vnd,transportation_discounted_vnd,shipment_vnd,weight_vnd,net_vnd};
}

/** One UPS purchase shipment per Lot; Order total is the sum of separately rated Lots. */
export function upsOrderNet(lots:Array<{lot_id:string;pricing:UpsAccountPricing;weight_kg:number}>,globals:UpsGlobals) {
 if(!Array.isArray(lots)||!lots.length)throw Error("Order UPS cần Lot.");
 const ids=new Set<string>();
 const results=lots.map(lot=>{
  if(typeof lot.lot_id!=="string"||!lot.lot_id.trim()||ids.has(lot.lot_id.trim()))throw Error("Lot ID phải có giá trị và không trùng.");
  const lot_id=lot.lot_id.trim();ids.add(lot_id);
  return {lot_id,...upsAccountNet(lot.pricing,lot.weight_kg,globals)};
 });
 // No monetary rounding: preserve fractional VND in each Lot and the Order total.
 return {lots:results,net_vnd:safe(results.reduce((sum,lot)=>sum+lot.net_vnd,0)),shipment_surcharge_vnd:safe(results.reduce((sum,lot)=>sum+lot.shipment_vnd,0))};
}

export function optimizeUpsAccounts(accounts:UpsAccountPricing[],weightKg:number,globals:UpsGlobals) {
 if(!Array.isArray(accounts)||!accounts.length||new Set(accounts.map(a=>a.account)).size!==accounts.length)throw Error("Cần danh sách account không trùng.");
 // All supplied eligible accounts must calculate; missing data fails rather than silently selecting an incomplete set.
 const costs=accounts.map(a=>upsAccountNet(a,weightKg,globals)).sort((a,b)=>a.net_vnd-b.net_vnd);
 if(costs.length>1&&costs[0].net_vnd===costs[1].net_vnd)throw Error("Account bằng Net; cần policy tie-break được duyệt.");
 return {selected:costs[0],accounts:costs};
}
