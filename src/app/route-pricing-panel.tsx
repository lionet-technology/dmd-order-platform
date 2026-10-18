"use client";
import { useEffect,useState } from "react";
import { DEFAULT_SURCHARGES,type SurchargeRules } from "@/lib/epacket-pricing";
type Version={id:number;version_number:number;created_at:string;created_by_user_id:number};
type Pricing={active?:{price_version_id:number;base_markup:number;retail_markup?:number;sales_markup_percent?:number|null;effective_at:string;surcharges_json:string};versions:Version[];client_self_purchase:number;activations:Array<{id:number;effective_at:string;price_version_id:number;config_version_id:number;actor_user_id:number}>};
export function RoutePricingPanel({routeId}:{routeId:number}){
 const [data,setData]=useState<Pricing|null>(null),[version,setVersion]=useState(""),[retail,setRetail]=useState("16"),[when,setWhen]=useState(""),[rules,setRules]=useState<SurchargeRules>(DEFAULT_SURCHARGES),[file,setFile]=useState<File|null>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch("/api/route-pricing?route_id="+routeId),d=await r.json();if(!r.ok)throw Error(d.error);setData(d);if(d.active){setVersion(String(d.active.price_version_id));setRetail(String(d.active.sales_markup_percent??16));const s=JSON.parse(d.active.surcharges_json);setRules(s)}}
 useEffect(()=>{void load().catch(e=>setMsg(e.message))},[routeId]); // eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:object|FormData){
 setBusy(true);setMsg("");try{const r=await fetch("/api/route-pricing",{method:"POST",...(body instanceof FormData?{body}:{headers:{"content-type":"application/json"},body:JSON.stringify({route_id:routeId,...body})})}),d=await r.json();if(!r.ok)throw Error(d.error);await load();if(d.version_number)setVersion(String(d.id));setMsg(d.version_number?"Đã tạo version "+d.version_number+"; chọn Activate để áp dụng.":"Đã lưu cấu hình có thời điểm hiệu lực.")}catch(e){setMsg((e as Error).message)}finally{setBusy(false)}}
 if(!data&&!msg)return <div className="panel loadingState">Đang tải cấu hình giá…</div>;
 return <section className="routePricingPanel">
   <div className="settingsSectionHead"><div><span className="eyebrow">PRICING</span><h3>Bảng giá & phụ phí</h3><p>Nhập Base Rate do Owner duyệt; Retail và giá bán độc lập với Net Cost.</p></div><span className={data?.active?"status goodStatus":"status neutralStatus"}>{data?.active?"Đang áp dụng":"Chưa kích hoạt"}</span></div>
   <div className="settingsSection">
     <div className="settingsSectionTitle"><h3>Giá dịch vụ · USD</h3><p>CSV/XLSX gồm weight,net,base_rate. Chỉ kích hoạt bảng có Base Rate được Owner duyệt.</p></div>
     <label className="settingToggle"><input type="checkbox" checked={!!data?.client_self_purchase} disabled={busy||!data} onChange={e=>void post({action:"self-purchase",enabled:e.target.checked})}/><span><b>Client tự đặt mua</b><small>Cho phép Client đặt mua dịch vụ bằng Balance.</small></span></label>
     <div className="settingsGrid">
       <label className="field"><span>Markup trên Base Rate (%)</span><input type="number" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
       <label className="field"><span>Phiên bản bảng Base Rate</span><select value={version} onChange={e=>setVersion(e.target.value)}><option value="">Chọn version</option>{data?.versions.map(v=><option key={v.id} value={v.id}>v{v.version_number} · {v.created_at}</option>)}</select></label>
     </div>
     <p className="settingsHint">Đang áp dụng: {data?.active?"v"+data.versions.find(v=>v.id===data.active?.price_version_id)?.version_number+" · "+new Date(data.active.effective_at).toLocaleString("vi-VN"):"Chưa có"}. Đơn đã mua giữ nguyên giá tại thời điểm mua.</p>
     <div className="pricingUploadBox"><div><b>Nhập bảng Base Rate mới</b><p>Chọn CSV hoặc XLSX để tạo phiên bản mới. Kích hoạt sau khi kiểm tra dữ liệu.</p></div><div className="settingsActions"><a className="secondaryBtn" href={"/api/route-pricing?route_id="+routeId+"&download=1"}>↓ Tải bảng Base Rate hiện tại</a><label className="file"><input type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"＋ Chọn CSV / XLSX"}</span></label><button className="secondaryBtn" disabled={!file||busy} onClick={()=>{const f=new FormData();f.set("route_id",String(routeId));f.set("approval_confirmed","true");f.set("file",file!);void post(f)}}>Xác nhận bảng đã duyệt & nhập</button></div></div>
   </div>
   <div className="settingsSection">
     <div className="settingsSectionTitle"><h3>Phụ phí</h3><p>Cấu hình ngưỡng quá khổ và phụ phí vùng xa.</p></div>
     <label className="settingToggle"><input type="checkbox" checked={rules.oversize_enabled} onChange={e=>setRules({...rules,oversize_enabled:e.target.checked})}/><span><b>Phụ phí quá khổ</b><small>Chỉ áp dụng một ngưỡng quá khổ cho mỗi đơn.</small></span></label>
     <div className="surchargeGrid">{(["length_55","amount_55","length_75","amount_75"] as const).map(k=><label className="field" key={k}><span>{({length_55:"Ngưỡng dài 1 (cm)",amount_55:"Phụ phí 1 (USD)",length_75:"Ngưỡng dài 2 (cm)",amount_75:"Phụ phí 2 (USD)"}[k])}</span><input type="number" value={rules[k]} onChange={e=>setRules({...rules,[k]:Number(e.target.value)})}/></label>)}</div>
     <p className="settingsHint">Dài &gt;{rules.length_55}cm: {rules.amount_55} USD; dài &gt;{rules.length_75}cm: {rules.amount_75} USD thay thế. Phụ phí vùng xa cộng thêm.</p>
     <label className="settingToggle"><input type="checkbox" checked={rules.remote_enabled} onChange={e=>setRules({...rules,remote_enabled:e.target.checked})}/><span><b>Vùng xa / APO / FPO / DPO</b><small>Áp dụng cho AK, HI, territory và quân bưu theo USPS.</small></span></label>
     <div className="settingsGrid remotePricingGrid"><label className="field"><span>Phụ phí vùng xa (USD)</span><input type="number" value={rules.remote_amount} onChange={e=>setRules({...rules,remote_amount:Number(e.target.value)})}/></label></div>
   </div>
   <div className="settingsSection pricingActivation"><label className="field"><span>Thời điểm hiệu lực</span><input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/><small>Giờ máy hiện tại. Để trống để áp dụng ngay.</small></label><button className="primaryBtn" disabled={busy||!version} onClick={()=>void post({action:"activate",price_version_id:Number(version),retail_markup:Number(retail),currency:"USD",effective_at:when?new Date(when).toISOString():undefined,surcharges:{...rules,remote_zips:[]}})}>{busy?"Đang xử lý…":"Kích hoạt bảng giá & cấu hình"}</button></div>
   {msg&&<p className="settingsNotice" role="status">{msg}</p>}
   <details className="settingsDisclosure pricingAudit"><summary>Lịch sử kích hoạt</summary>{data?.activations.length?data.activations.map(a=><p key={a.id}>{new Date(a.effective_at).toLocaleString("vi-VN")} · Price #{a.price_version_id} · Config #{a.config_version_id} · User #{a.actor_user_id}</p>):<p>Chưa có lịch sử kích hoạt.</p>}</details>
 </section>;
}
