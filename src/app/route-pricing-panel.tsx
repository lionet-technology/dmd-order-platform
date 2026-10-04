"use client";
import { useEffect,useState } from "react";
import { DEFAULT_SURCHARGES,type SurchargeRules } from "@/lib/epacket-pricing";
type Version={id:number;version_number:number;created_at:string;created_by_user_id:number};
type Pricing={active?:{price_version_id:number;base_markup:number;retail_markup:number;effective_at:string;surcharges_json:string};versions:Version[];client_self_purchase:number;activations:Array<{id:number;effective_at:string;price_version_id:number;config_version_id:number;actor_user_id:number}>};
export function RoutePricingPanel({routeId}:{routeId:number}){
 const [data,setData]=useState<Pricing|null>(null),[version,setVersion]=useState(""),[base,setBase]=useState("6"),[retail,setRetail]=useState("16"),[when,setWhen]=useState(""),[rules,setRules]=useState<SurchargeRules>(DEFAULT_SURCHARGES),[zips,setZips]=useState(""),[file,setFile]=useState<File|null>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch("/api/route-pricing?route_id="+routeId),d=await r.json();if(!r.ok)throw Error(d.error);setData(d);if(d.active){setVersion(String(d.active.price_version_id));setBase(String(d.active.base_markup));setRetail(String(d.active.retail_markup));const s=JSON.parse(d.active.surcharges_json);setRules(s);setZips(s.remote_zips.join("\n"))}}
 useEffect(()=>{void load().catch(e=>setMsg(e.message))},[routeId]); // eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:object|FormData){
 setBusy(true);setMsg("");try{const r=await fetch("/api/route-pricing",{method:"POST",...(body instanceof FormData?{body}:{headers:{"content-type":"application/json"},body:JSON.stringify({route_id:routeId,...body})})}),d=await r.json();if(!r.ok)throw Error(d.error);await load();if(d.version_number)setVersion(String(d.id));setMsg(d.version_number?"Đã tạo version "+d.version_number+"; chọn Activate để áp dụng.":"Đã lưu cấu hình có thời điểm hiệu lực.")}catch(e){setMsg((e as Error).message)}finally{setBusy(false)}}
 return <section className="routeVariablesEditor"><h3>Pricing · USD</h3>
 <label><input type="checkbox" checked={!!data?.client_self_purchase} disabled={busy} onChange={e=>void post({action:"self-purchase",enabled:e.target.checked})}/> Cho phép Client tự đặt mua</label>
 <div className="templateGrid"><label>Base markup (%)<input type="number" value={base} onChange={e=>setBase(e.target.value)}/></label><label>Retail markup (%)<input type="number" value={retail} onChange={e=>setRetail(e.target.value)}/></label><label>Net table version<select value={version} onChange={e=>setVersion(e.target.value)}><option value="">Chọn version</option>{data?.versions.map(v=><option key={v.id} value={v.id}>v{v.version_number} · {v.created_at}</option>)}</select></label></div>
 <p>Active: {data?.active?"v"+data.versions.find(v=>v.id===data.active?.price_version_id)?.version_number+" · "+data.active.effective_at:"Chưa có"} · Đơn đã mua giữ nguyên snapshot.</p>
 <div className="templateActions"><a href={"/api/route-pricing?route_id="+routeId+"&download=1"}>Tải bảng Net hiện tại (CSV)</a><input type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button disabled={!file||busy} onClick={()=>{const f=new FormData();f.set("route_id",String(routeId));f.set("file",file!);void post(f)}}>Upload & Validate · tạo version mới</button></div>
 <h3>Surcharge Rules</h3><label><input type="checkbox" checked={rules.oversize_enabled} onChange={e=>setRules({...rules,oversize_enabled:e.target.checked})}/> Quá khổ (chỉ lấy một ngưỡng)</label>
 <div className="templateGrid">{(["length_55","amount_55","length_75","amount_75","remote_amount"] as const).map(k=><label key={k}>{({length_55:"Ngưỡng dài 1 (cm)",amount_55:"Phụ phí 1 (USD)",length_75:"Ngưỡng dài 2 (cm)",amount_75:"Phụ phí 2 (USD)",remote_amount:"Non-continental (USD)"}[k])}<input type="number" value={rules[k]} onChange={e=>setRules({...rules,[k]:Number(e.target.value)})}/></label>)}</div>
 <p>Dài &gt;{rules.length_55}cm: {rules.amount_55} USD; dài &gt;{rules.length_75}cm: {rules.amount_75} USD thay thế. Phụ phí vùng xa cộng thêm.</p>
 <label><input type="checkbox" checked={rules.remote_enabled} onChange={e=>setRules({...rules,remote_enabled:e.target.checked})}/> Non-continental / APO / FPO / DPO</label>
 <label>Remote ZIP của supplier (mỗi dòng 1 ZIP, để trống khi chưa có danh sách)<textarea rows={3} value={zips} onChange={e=>setZips(e.target.value)}/></label>
 <label>Thời điểm hiệu lực (giờ máy hiện tại; bỏ trống để áp dụng ngay)<input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label>
 <button disabled={busy||!version} onClick={()=>void post({action:"activate",price_version_id:Number(version),base_markup:Number(base),retail_markup:Number(retail),currency:"USD",effective_at:when?new Date(when).toISOString():undefined,surcharges:{...rules,remote_zips:zips.split(/[\s,]+/).filter(Boolean)}})}>Activate bảng giá & cấu hình</button>
 {msg&&<p role="status">{msg}</p>}
 <details><summary>Lịch sử kích hoạt / audit</summary>{data?.activations.map(a=><p key={a.id}>{a.effective_at} · Price #{a.price_version_id} · Config #{a.config_version_id} · User #{a.actor_user_id}</p>)}</details>
 </section>;
}
