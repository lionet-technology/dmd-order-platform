// All measurements are kilograms/centimetres. Never round before selecting a tier.
export type Tier={weight:number;net:number};
export const STANDARD:Tier[]="0.05 5.01;0.10 5.57;0.15 6.58;0.20 7.12;0.25 8.51;0.30 9.04;0.35 10.62;0.40 11.16;0.45 11.70;0.50 14.13;0.55 14.68;0.60 15.21;0.65 15.75;0.70 16.30;0.75 16.83;0.80 17.38;0.85 17.91;0.90 18.46;0.95 20.36;1.00 20.91;1.10 21.99;1.20 23.07;1.30 24.15;1.40 26.41;1.50 27.49;1.60 28.57;1.70 29.64;1.80 30.72;1.90 32.38;2.00 33.46;2.20 35.63;2.40 38.62;2.60 40.78;2.80 43.75;3.00 45.92;3.20 48.99;3.40 51.16;3.60 53.32;3.80 56.09;4.00 58.25;4.20 61.06;4.40 63.22;4.60 66.42;4.80 68.59;5.00 71.46;5.50 78.70;6.00 83.79;6.50 91.05;7.00 96.13;7.50 108.18;8.00 113.85;8.50 120.39;9.00 126.93;9.50 133.73;10.00 141.75".split(";").map(row=>{const [weight,net]=row.split(" ").map(Number);return {weight,net}});
export const ECO:Tier[]="0.05 4.84;0.10 5.20;0.15 5.62;0.20 5.98;0.25 6.90;0.30 7.26;0.35 8.55;0.40 8.91;0.45 9.27;0.50 11.07;0.55 11.43;0.60 11.79;0.65 12.15;0.70 12.51;0.75 12.88;0.80 13.24;0.85 13.60;0.90 13.96;0.95 14.89;1.00 15.25;1.10 15.98;1.20 16.70;1.30 17.42;1.40 19.03;1.50 19.76;1.60 20.48;1.70 21.20;1.80 21.92;1.90 23.33;2.00 24.05;2.20 25.49;2.40 27.37;2.60 28.81;2.80 30.79;3.00 32.23;3.20 34.06;3.40 35.50;3.60 36.95;3.80 38.77;4.00 40.21;4.20 42.07;4.40 43.51;4.60 45.39;4.80 46.83;5.00 49.12;5.50 53.22;6.00 57.33;6.50 61.45;7.00 65.57;7.50 69.68;8.00 73.71;8.50 77.77;9.00 81.82;9.50 86.16;10.00 91.16".split(";").map(row=>{const [weight,net]=row.split(" ").map(Number);return {weight,net}});
export const usd=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const key=(v:unknown)=>String(v??"").toUpperCase().replace(/[^A-Z0-9]/g,"");
export function normalizeCountry(v:unknown){return ["US","USA","UNITEDSTATES","UNITEDSTATESOFAMERICA"].includes(key(v))?"US":String(v??"").trim()}
export function isEPacket(v:Record<string,unknown>){return key(v.service)==="EPACKET"&&["STANDARD","ECO"].includes(key(v.sub_service))&&key(v.supplier)==="DMD"}
export function remoteArea(o:Record<string,unknown>,zips:string[]=[]){
 const state=key(o.state),city=key(o.city),zip=String(o.zip??"").trim().slice(0,5);
 return ["AK","ALASKA","HI","HAWAII","PR","PUERTORICO","GU","GUAM","VI","USVIRGINISLANDS","VIRGINISLANDS","AS","AMERICANSAMOA","MP","NORTHERNMARIANAISLANDS","UM","UNITEDSTATESMINOROUTLYINGISLANDS","AA","AE","AP"].includes(state)
 ||["APO","FPO","DPO"].includes(city)||/^(340|09[0-8]|96[2-6])\d{2}$/.test(zip)||zips.includes(zip);
}
export type SurchargeRules={oversize_enabled:boolean;length_55:number;length_75:number;amount_55:number;amount_75:number;remote_enabled:boolean;remote_amount:number;remote_zips:string[]};
export const DEFAULT_SURCHARGES:SurchargeRules={oversize_enabled:true,length_55:55,length_75:75,amount_55:5,amount_75:10.5,remote_enabled:true,remote_amount:15,remote_zips:[]};
export function validateRules(value:unknown):SurchargeRules{
 const o=value as SurchargeRules;
 if(!o||typeof o.oversize_enabled!=="boolean"||typeof o.remote_enabled!=="boolean")throw Error("Bật/tắt phụ phí không hợp lệ.");
 for(const k of ["length_55","length_75","amount_55","amount_75","remote_amount"] as const)if(typeof o[k]!=="number"||!Number.isFinite(o[k])||o[k]<0)throw Error("Ngưỡng/phụ phí không hợp lệ.");
 if(o.length_55>=o.length_75)throw Error("Ngưỡng dài thứ hai phải lớn hơn ngưỡng thứ nhất.");
 if(!Array.isArray(o.remote_zips)||o.remote_zips.length>10000||o.remote_zips.some(z=>typeof z!=="string"||!/^\d{5}$/.test(z)))throw Error("Remote ZIP phải là mã 5 chữ số; chưa có danh sách supplier thì để trống.");
 return {...o,remote_zips:[...new Set(o.remote_zips)]};
}
export function validateTiers(value:unknown):Tier[]{
 if(!Array.isArray(value)||!value.length||value.length>1000)throw Error("Bảng giá phải có các bậc cân.");
 const tiers=value.map(v=>({weight:Number(v.weight),net:Number(v.net)}));
 let previous=0;
 for(const t of tiers){if(!Number.isFinite(t.weight)||!Number.isFinite(t.net)||t.weight<=previous||t.weight>10||t.net<=0)throw Error("Bậc cân tăng dần, không trùng, tối đa 10 kg; Net phải lớn hơn 0.");previous=t.weight}
 if(previous!==10)throw Error("Bảng giá phải kết thúc ở 10 kg.");
 return tiers;
}
export function quote(o:Record<string,unknown>,tiers:Tier[],baseMarkup=6,retailMarkup=16,discount=0,rules=DEFAULT_SURCHARGES){
 const actual=Number(o.weight||0),l=Number(o.length||0),w=Number(o.width||0),h=Number(o.height||0);
 const volume=l>0&&w>0&&h>0?l*w*h:Number(o.manual_volume||o.volume||0);
 const volumetric=volume/5000,chargeable=Math.max(actual,volumetric);
 const reasons:string[]=[];
 if(normalizeCountry(o.country)!=="US")reasons.push("Dịch vụ chỉ giao đến US.");
 if(Number(o.carton_count)!==1)reasons.push("Mỗi Order chỉ được 1 carton.");
 if(actual<=0||!Number.isFinite(actual))reasons.push("Cần cân nặng hợp lệ.");
 if(volume<=0||!Number.isFinite(volume))reasons.push("Cần đủ kích thước hoặc thể tích.");
 if(chargeable>10)reasons.push("Chargeable Weight vượt 10 kg; hãy đổi dịch vụ.");
 const tier=actual>0&&volume>0&&Number.isFinite(chargeable)?tiers.find(t=>t.weight>=chargeable):undefined;
 if(!tier)reasons.push("Không có bậc cân phù hợp.");
 const net=tier?.net||0,base=net*(1+baseMarkup/100),retail=net*(1+retailMarkup/100),sale=retail*(1-discount/100);
 const surcharges:Array<{code:string;amount:number;note:string}>=[];
 if(rules.oversize_enabled&&l>rules.length_55){const high=l>rules.length_75,threshold=high?rules.length_75:rules.length_55,amount=high?rules.amount_75:rules.amount_55;surcharges.push({code:high?"OVERSIZE_LENGTH_75":"OVERSIZE_LENGTH_55",amount,note:"Phụ phí quá khổ chiều dài >"+threshold+"cm: "+amount+" USD"})}
 if(rules.remote_enabled&&remoteArea(o,rules.remote_zips))surcharges.push({code:"NON_CONTINENTAL",amount:rules.remote_amount,note:"Non-continental surcharge (phụ phí vùng xa): "+rules.remote_amount+" USD"});
 const surcharge=surcharges.reduce((s,r)=>s+r.amount,0),gpBase=Math.max(sale-base,0),commission=sale*.001+gpBase*.12;
 return {eligible:!reasons.length,reasons,currency:"USD",volumetric_weight:volumetric,chargeable_weight:chargeable,tier:tier?.weight||null,net,base,retail,discount_percent:discount,sale_price:sale,surcharge_breakdown:surcharges,surcharge,total_charge:usd(sale+surcharge),gross_profit_net:sale-net,gross_profit_base:gpBase,commission,commission_basis:{sale,base,gpBase},guidance:{floor:Math.ceil(net*1.02/base*100)||97,base:100,retail:Math.ceil(retail/base*100)||110}};
}
