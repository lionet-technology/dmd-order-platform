"use client";
export type Preview={eligible:boolean;reasons:string[];currency:string;service_price?:number;sale_price?:number;discount_percent:number;surcharge:number;total_charge:number;volumetric_weight:number;chargeable_weight:number;tier:number|null;surcharge_breakdown:Array<{code:string;amount:number;note:string}>;guidance?:{floor:number;base:number;retail:number}};
const money=(n:number)=>Number(n||0).toFixed(2)+" USD";
export function PricingPreview({pricing}:{pricing:Preview|null}){
 if(!pricing)return <p>Chưa thể tính giá · Nhập đủ dữ liệu và chọn dịch vụ.</p>;
 return <div className="pricingPreview"><b className={pricing.eligible?"status goodStatus":"status badStatus"}>{pricing.eligible?"Đủ điều kiện mua":"Không đủ điều kiện mua dịch vụ"}</b>
 <p>Cân thể tích: {pricing.volumetric_weight.toFixed(4)} kg · Chargeable: {pricing.chargeable_weight.toFixed(4)} kg · Bậc: {pricing.tier??"—"} kg</p>
 <dl><dt>Giá dịch vụ</dt><dd>{money(pricing.service_price??pricing.sale_price??0)}</dd><dt>Discount từ Retail</dt><dd>{Number(pricing.discount_percent).toFixed(4)}%</dd><dt>Phụ phí</dt><dd>{money(pricing.surcharge)}</dd><dt>Tổng charge</dt><dd><strong>{money(pricing.total_charge)}</strong></dd></dl>
 {pricing.surcharge_breakdown.map(s=><p key={s.code}>{s.note}</p>)}{pricing.reasons.map((r,i)=><p key={i} className="error">{r}</p>)}
 {pricing.guidance&&<p>Floor {pricing.guidance.floor}% · Base 100% · Retail {pricing.guidance.retail}%</p>}
 </div>;
}
