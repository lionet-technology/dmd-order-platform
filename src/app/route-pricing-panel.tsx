"use client";
import { useEffect,useState } from "react";
import { DEFAULT_SURCHARGES,type SurchargeRules } from "@/lib/epacket-pricing";
type Version={id:number;version_number:number;created_at:string;created_by_user_id:number};
type Pricing={service:string;sub_service:string;supplier:string;pricing_engine:string|null;active?:{price_version_id:number;base_markup:number;retail_markup:number;effective_at:string;surcharges_json:string};versions:Version[];client_self_purchase:number;activations:Array<{id:number;effective_at:string;price_version_id:number;config_version_id:number;actor_user_id:number}>};
export function RoutePricingPanel({routeId}:{routeId:number}){
 const [data,setData]=useState<Pricing|null>(null),[version,setVersion]=useState(""),[base,setBase]=useState("6"),[retail,setRetail]=useState("16"),[when,setWhen]=useState(""),[rules,setRules]=useState<SurchargeRules>(DEFAULT_SURCHARGES),[file,setFile]=useState<File|null>(null),[msg,setMsg]=useState(""),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch("/api/route-pricing?route_id="+routeId),d=await r.json();if(!r.ok)throw Error(d.error);setData(d);if(d.active){setVersion(String(d.active.price_version_id));setBase(String(d.active.base_markup));setRetail(String(d.active.retail_markup));const s=JSON.parse(d.active.surcharges_json);setRules(s)}}
 useEffect(()=>{void load().catch(e=>setMsg(e.message))},[routeId]); // eslint-disable-line react-hooks/exhaustive-deps
 async function post(body:object|FormData){
 setBusy(true);setMsg("");try{const r=await fetch("/api/route-pricing",{method:"POST",...(body instanceof FormData?{body}:{headers:{"content-type":"application/json"},body:JSON.stringify({route_id:routeId,...body})})}),d=await r.json();if(!r.ok)throw Error(d.error);await load();if(d.version_number)setVersion(String(d.id));setMsg(d.version_number?"Đã tạo version "+d.version_number+"; chọn Activate để áp dụng.":"Đã lưu cấu hình có thời điểm hiệu lực.")}catch(e){setMsg((e as Error).message)}finally{setBusy(false)}}
 if(!data&&!msg)return <div className="panel loadingState">Đang tải cấu hình giá…</div>;
 const supported=data?.pricing_engine==="EPACKET_US"||(data?.service.toLowerCase()==="epacket"&&["standard","eco"].includes(data.sub_service.toLowerCase())&&data.supplier.toLowerCase()==="dmd");
 return <section className="routePricingPanel">
   {data&&!supported&&<p className="settingsNotice" role="note">Giá tự động chưa hỗ trợ dịch vụ này. Chưa mở Client tự đặt mua hoặc đổi sang dịch vụ này cho đến khi có bộ quy tắc giá phù hợp.</p>}
   <div className="settingsSectionHead"><div><span className="eyebrow">PRICING</span><h3>Bảng giá & phụ phí</h3><p>Quản lý bảng Net, mức markup và thời điểm áp dụng cho dịch vụ.</p></div><span className={data?.active?"status goodStatus":"status neutralStatus"}>{data?.active?"Đang áp dụng":"Chưa kích hoạt"}</span></div>
   <div className="settingsSection">
     <div className="settingsSectionTitle"><h3>Giá dịch vụ · USD</h3><p>Chọn phiên bản bảng Net và mức markup trước khi kích hoạt.</p></div>
     <label className="settingToggle"><input type="checkbox" checked={!!data?.client_self_purchase} disabled={busy||!data||!supported} onChange={e=>void post({action:"self-purchase",enabled:e.target.checked})}/><span><b>Client tự đặt mua</b><small>Cho phép Client đặt mua dịch vụ bằng Balance.</small></span></label>
     <div className="settingsGrid">
       <label className="field"><span>Base markup (%)</span><input type="number" value={base} onChange={e=>setBase(e.target.value)}/></label>
       <label className="field"><span>Retail markup (%)</span><input type="number" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
       <label className="field"><span>Phiên bản bảng Net</span><select value={version} onChange={e=>setVersion(e.target.value)}><option value="">Chọn version</option>{data?.versions.map(v=><option key={v.id} value={v.id}>v{v.version_number} · {v.created_at}</option>)}</select></label>
     </div>
     <p className="settingsHint">Đang áp dụng: {data?.active?"v"+data.versions.find(v=>v.id===data.active?.price_version_id)?.version_number+" · "+new Date(data.active.effective_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"}):"Chưa có"}. Đơn đã mua giữ nguyên giá tại thời điểm mua.</p>
     <div className="pricingUploadBox"><div><b>Nhập bảng Net mới</b><p>Chọn CSV hoặc XLSX để tạo phiên bản mới. Kích hoạt sau khi kiểm tra dữ liệu.</p></div><div className="settingsActions"><a className="secondaryBtn" href={"/api/route-pricing?route_id="+routeId+"&download=1"}>↓ Tải bảng Net hiện tại</a><label className="file"><input type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"＋ Chọn CSV / XLSX"}</span></label><button className="secondaryBtn" disabled={!file||busy} onClick={()=>{const f=new FormData();f.set("route_id",String(routeId));f.set("file",file!);void post(f)}}>Upload & kiểm tra</button></div></div>
   </div>
   <div className="settingsSection">
     <div className="settingsSectionTitle"><h3>Phụ phí</h3><p>Cấu hình ngưỡng quá khổ và phụ phí vùng xa.</p></div>
     <label className="settingToggle"><input type="checkbox" checked={rules.oversize_enabled} onChange={e=>setRules({...rules,oversize_enabled:e.target.checked})}/><span><b>Phụ phí quá khổ</b><small>Chỉ áp dụng một ngưỡng quá khổ cho mỗi đơn.</small></span></label>
     <div className="surchargeGrid">{(["length_55","amount_55","length_75","amount_75"] as const).map(k=><label className="field" key={k}><span>{({length_55:"Ngưỡng dài 1 (cm)",amount_55:"Phụ phí 1 (USD)",length_75:"Ngưỡng dài 2 (cm)",amount_75:"Phụ phí 2 (USD)"}[k])}</span><input type="number" value={rules[k]} onChange={e=>setRules({...rules,[k]:Number(e.target.value)})}/></label>)}</div>
     <p className="settingsHint">Dài &gt;{rules.length_55}cm: {rules.amount_55} USD; dài &gt;{rules.length_75}cm: {rules.amount_75} USD thay thế. Phụ phí vùng xa cộng thêm.</p>
     <label className="settingToggle"><input type="checkbox" checked={rules.remote_enabled} onChange={e=>setRules({...rules,remote_enabled:e.target.checked})}/><span><b>Vùng xa / APO / FPO / DPO</b><small>Áp dụng cho AK, HI, territory và quân bưu theo USPS.</small></span></label>
     <div className="settingsGrid remotePricingGrid"><label className="field"><span>Phụ phí vùng xa (USD)</span><input type="number" value={rules.remote_amount} onChange={e=>setRules({...rules,remote_amount:Number(e.target.value)})}/></label></div>
   </div>
   <div className="settingsSection pricingActivation"><label className="field"><span>Thời điểm hiệu lực</span><input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/><small>Giờ máy hiện tại. Để trống để áp dụng ngay.</small></label><button className="primaryBtn" disabled={busy||!version} onClick={()=>void post({action:"activate",price_version_id:Number(version),base_markup:Number(base),retail_markup:Number(retail),currency:"USD",effective_at:when?new Date(when).toISOString():undefined,surcharges:{...rules,remote_zips:[]}})}>{busy?"Đang xử lý…":"Kích hoạt bảng giá & cấu hình"}</button></div>
   {msg&&<p className="settingsNotice" role="status">{msg}</p>}
   <details className="settingsDisclosure pricingAudit"><summary>Lịch sử kích hoạt</summary>{data?.activations.length?data.activations.map(a=><p key={a.id}>{new Date(a.effective_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})} · Price #{a.price_version_id} · Config #{a.config_version_id} · User #{a.actor_user_id}</p>):<p>Chưa có lịch sử kích hoạt.</p>}</details>
 </section>;
}
