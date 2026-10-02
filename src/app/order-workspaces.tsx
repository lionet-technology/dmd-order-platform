"use client";

import { useCallback,useEffect,useState } from "react";

type Role="ADMIN"|"SALES"|"CLIENT";
type EnumRow={id:number;enum_type:string;value:string;parent_value:string;active:number;sort_order:number};
type GenericRow=Record<string,unknown>;

const statusLabels:Record<string,string>={
  WAITING_HANDOVER:"Chờ nhận hàng",RECEIVED:"Đã nhận hàng",IN_TRANSIT:"Đang vận chuyển",
  DELIVERED:"Delivered",ALERT:"Alert",EXCEPTION:"Exception",
};
const statusOptions=Object.entries(statusLabels);

function money(value:unknown){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(value||0))}
function displayDate(value:unknown){const raw=String(value||"");const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);return match?match[3]+"/"+match[2]+"/"+match[1]:raw||"—"}
async function json(url:string,options?:RequestInit){const response=await fetch(url,options);const data=await response.json();if(!response.ok)throw new Error(data.error||"Không thể xử lý dữ liệu");return data}
async function post(url:string,body:unknown){return json(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})}
export function OrderDetailPanel({orderId,role,onEdit,onPurchase,onDone}:{orderId:number;role:Role;onEdit:(row:GenericRow)=>void;onPurchase?:(row:GenericRow)=>void;onDone?:()=>void|Promise<void>}){
  const [data,setData]=useState<GenericRow|null>(null);
  const [tab,setTab]=useState("overview");
  const [cancelOpen,setCancelOpen]=useState(false),[cancelReason,setCancelReason]=useState(""),[cancelError,setCancelError]=useState(""),[cancelBusy,setCancelBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{void json("/api/orders/"+orderId).then(setData).catch(error=>setError(error.message))},[orderId]);
  if(error)return <div className="loadingState">Lỗi: {error}</div>;
  if(!data)return <div className="loadingState">Đang tải chi tiết Order…</div>;
  const trackings=Array.isArray(data.trackings)?data.trackings as GenericRow[]:[];
  const cancelled=data.workflow_status==="CANCELLED";
  const policy=(data.cancellation||{}) as {allowed?:boolean;reason?:string;refund_percent?:number;refund_amount?:number};
  async function submitCancellation(){
    setCancelBusy(true);setCancelError("");
    try{
      await post("/api/orders/"+orderId+"/cancel",{reason:cancelReason});
      setData(await json("/api/orders/"+orderId));setCancelOpen(false);setTab("history");await onDone?.();
    }catch(error){setCancelError(error instanceof Error?error.message:"Không thể huỷ đơn.")}
    finally{setCancelBusy(false)}
  }
  const active=trackings.filter(row=>row.status==="ACTIVE");
  const events=Array.isArray(data.events)?data.events as GenericRow[]:[];
  async function copyAll(){await navigator.clipboard.writeText(active.map(row=>String(row.tracking||"")).filter(Boolean).join("\n"))}
  return <div className="orderDetail">
    <div className="detailHero">
      <div><span>DMD ORDER ID</span><h2>{String(data.system_order_code||"—")}</h2><p>Client Order ID: <b>{String(data.order_id||"—")}</b> · Tạo {displayDate(data.created_at)}</p></div>
      <div className="detailHeroMeta"><span>{String(data.service||"—")} {data.sub_service?"· "+String(data.sub_service):""}</span><b className="status neutralStatus">{String(data.workflow_status||"PENDING")}</b></div>
    </div>
    <div className="detailActions">
      <button className="secondaryBtn" disabled={!active.length} onClick={()=>void copyAll()}>Copy tất cả Tracking</button>
      {!cancelled&&role==="ADMIN"&&onPurchase&&<button className="secondaryBtn" onClick={()=>onPurchase(data)}>Tracking & Label</button>}
      {!cancelled&&role!=="CLIENT"&&<button className="primaryBtn" onClick={()=>onEdit(data)}>Sửa Order</button>}
      {!cancelled&&<span className="cancelBtnWrap" title={!policy.allowed?policy.reason:""}><button className="secondaryBtn cancelOrderBtn" disabled={!policy.allowed||cancelBusy} aria-disabled={!policy.allowed||cancelBusy} onClick={()=>{setCancelOpen(true);setCancelError("")}}>Huỷ đơn</button></span>}
    </div>
    {cancelled&&<div className="cancellationSummary"><b>Đã huỷ · Hoàn {String(data.cancellation_refund_percent||0)}%: {money(data.cancellation_refund_amount)}</b><p>Phí giữ lại: {money(data.total_due)}. {data.cancellation_reason?String(data.cancellation_reason):""}</p></div>}
    {cancelOpen&&<section className="cancellationConfirm"><h3>Xác nhận huỷ đơn</h3><p>Hoàn {policy.refund_percent}% vào Balance: <b>{money(policy.refund_amount)}</b>. Đơn sẽ ngừng xử lý trên hệ thống.</p><p>Tracking/label đã cấp vẫn được lưu trong lịch sử; nhà cung cấp cần xử lý huỷ label riêng.</p><label>Lý do huỷ (không bắt buộc)<textarea maxLength={2000} value={cancelReason} disabled={cancelBusy} onChange={event=>setCancelReason(event.target.value)}/></label>{cancelError&&<p role="alert">{cancelError}</p>}<div className="detailActions"><button className="secondaryBtn" disabled={cancelBusy} onClick={()=>setCancelOpen(false)}>Đóng</button><button className="primaryBtn" disabled={cancelBusy} onClick={()=>void submitCancellation()}>{cancelBusy?"Đang huỷ…":"Xác nhận huỷ đơn"}</button></div></section>}
    <div className="detailTabs">
      {[["overview","Tổng quan"],["tracking","Tracking & Label"],["finance","Giá & Đối soát"],["history","Lịch sử"]].filter(item=>role==="ADMIN"||item[0]!=="finance").map(item=><button key={item[0]} className={tab===item[0]?"active":""} onClick={()=>setTab(item[0])}>{item[1]}</button>)}
    </div>
    {tab==="overview"&&<div className="detailBody">
      <section className="detailGrid">
        <article className="detailCard"><h3>Người nhận</h3><b>{String(data.recipient_name||"—")}</b><p>{String(data.address1||"")}{data.address2?<><br/>{String(data.address2)}</>:null}</p><p>{[data.city,data.state,data.zip].filter(Boolean).join(", ")}</p><p>{String(data.country||"")} · {String(data.phone||"")}</p></article>
        <article className="detailCard"><h3>Hàng hóa</h3><dl><dt>Sản phẩm</dt><dd>{String(data.item||"—")}</dd><dt>Chất liệu</dt><dd>{String(data.material||"—")}</dd><dt>Số lượng Carton</dt><dd>{String(data.carton_count||0)}</dd><dt>Khối lượng</dt><dd>{String(data.weight||0)} kg</dd><dt>Kích thước</dt><dd>{data.length&&data.width&&data.height?String(data.length)+" × "+String(data.width)+" × "+String(data.height)+" cm":"Nhập thể tích tổng"}</dd><dt>Thể tích</dt><dd>{Number(data.volume||0).toLocaleString("en-US")} cm³</dd><dt>Hạng cân</dt><dd><b>{String(data.chargeable_weight||0)} kg</b></dd></dl></article>
        <article className="detailCard"><h3>Dịch vụ</h3><dl><dt>Client</dt><dd>{String(data.customer||"—")}</dd><dt>Sales</dt><dd>{String(data.sales||"—")}</dd><dt>Supplier</dt><dd>{role==="ADMIN"?String(data.supplier||"Chưa chọn"):"—"}</dd><dt>Service</dt><dd>{String(data.service||"—")}</dd><dt>Sub-Service</dt><dd>{String(data.sub_service||"—")}</dd><dt>Tracking/Label</dt><dd>{active.filter(row=>row.label_url).length}/{String(data.carton_count||0)}</dd><dt>Số lượng Lô</dt><dd>{String(data.expected_lot_count||1)}</dd></dl></article>
      </section>
      <section className="notesSection"><div><h3>Note Order</h3><p>{String(data.note||"Chưa có note.")}</p></div>{role==="ADMIN"&&<div className="internalNote"><h3>Note nội bộ</h3><p>{String(data.internal_note||"Chưa có note nội bộ.")}</p></div>}</section>
    </div>}
    {tab==="tracking"&&<div className="detailBody">
      <div className="trackingDetailHead"><div><h3>Tracking & Label</h3><p>{active.length} Tracking active · {active.filter(row=>row.label_url).length}/{String(data.carton_count||0)} Label</p></div><button className="secondaryBtn" disabled={!active.length} onClick={()=>void copyAll()}>Copy Tracking</button></div>
      <div className="trackingDetailList">{trackings.map(row=><article key={String(row.id)} className={row.status==="ACTIVE"?"trackingDetailRow":"trackingDetailRow inactive"}>
        <div><span>{String(row.status||"")}</span><b>{String(row.tracking||"—")}</b></div>
        <div><span>Shipment status</span><b>{statusLabels[String(row.shipment_status||"WAITING_HANDOVER")]||String(row.shipment_status||"—")}</b></div>
        <div><span>ETD</span><b>{displayDate(row.etd_at)}</b></div>
        {row.label_url?<a href={String(row.label_url)} target="_blank" rel="noreferrer">{cancelled?"Label lưu trữ · không sử dụng ↗":"Xem/Tải Label ↗"}</a>:<em>Thiếu Label</em>}
      </article>)}</div>
    </div>}
    {tab==="finance"&&role==="ADMIN"&&<div className="detailBody"><section className="financeCards">
      {[["Net Cost Est",data.est_net_cost],["Net Cost True",data.true_net_cost],["Base Cost",data.base_cost],["Retail Price",data.retail],["Discount",String(data.discount||0)+"%"],["Giá bán",data.sales_price],["Phụ phí PS",data.extra_surcharge],["Thuế NK PS",data.extra_import_tax],["Giá tổng",data.total_due]].map(([label,value])=><article key={String(label)}><span>{String(label)}</span><b>{String(label)==="Discount"?String(value):money(value)}</b></article>)}
    </section><div className="reconcileStrip"><span>Đối soát</span><b>{String(data.reconciliation_status||"PENDING")}</b><span>Chi phí có thể về sau và không chặn hoàn tất Order.</span></div></div>}
    {tab==="history"&&<div className="detailBody"><div className="historyTimeline">{events.length?events.map(event=><article key={String(event.id)}>
      <i></i><div><time>{displayDate(event.created_at)} · {String(event.actor_display_name||event.actor_username||"Hệ thống")}{event.actor_username?" · @"+String(event.actor_username):""}{event.actor_role?" · "+String(event.actor_role):""}</time><b>{String(event.summary||event.event_type)}</b><span>{String(event.source||"UI")}</span></div>
    </article>):<p>Order chưa có History log.</p>}</div></div>}
  </div>;
}

type QueueRow={
  order_pk:number;system_order_code:string;client_order_id:string;customer:string;recipient_name:string;
  service:string;sub_service:string;carton_count:number;carton_slot:number;supplier:string;
  expected_lot_count:number;tracking_id:number|null;tracking:string;label_url:string;
};

export function BulkTrackingSheet({enums,onDone}:{enums:EnumRow[];onDone:()=>void|Promise<void>}){
  const [rows,setRows]=useState<QueueRow[]>([]);
  const [service,setService]=useState("");
  const [subService,setSubService]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const suppliers=enums.filter(row=>row.enum_type==="SUPPLIER"&&row.active!==0);
  const services=enums.filter(row=>row.enum_type==="SERVICE"&&row.active!==0);
  const subs=enums.filter(row=>row.enum_type==="SUB_SERVICE"&&row.active!==0&&(!service||row.parent_value===service));
  const load=useCallback(async()=>{setBusy(true);setMessage("");try{const params=new URLSearchParams();if(service)params.set("service",service);if(subService)params.set("sub_service",subService);const body=await json("/api/orders/tracking-queue?"+params);setRows(body.rows||[])}catch(error){setMessage("Lỗi: "+(error as Error).message)}finally{setBusy(false)}},[service,subService]);
  useEffect(()=>{void load()},[load]);
  function update(index:number,key:keyof QueueRow,value:string){setRows(prev=>prev.map((row,i)=>i===index?{...row,[key]:key==="expected_lot_count"?Number(value||1):value}:row))}
  function pasteTracking(e:React.ClipboardEvent<HTMLInputElement>,start:number){const raw=e.clipboardData.getData("text/plain");if(!raw.includes("\n")&&!raw.includes("\t"))return;e.preventDefault();const matrix=raw.replace(/\r/g,"").split("\n").filter(Boolean).map(line=>line.split("\t"));setRows(prev=>{const next=[...prev];matrix.forEach((values,offset)=>{if(!next[start+offset])return;next[start+offset]={...next[start+offset],tracking:String(values[0]||"").trim(),label_url:String(values[1]||"").trim()}});return next})}
  async function upload(file:File){setBusy(true);setMessage("");try{const form=new FormData();form.set("file",file);const response=await fetch("/api/orders/tracking-queue",{method:"PUT",body:form});const body=await response.json();if(!response.ok)throw new Error(body.error);setRows(body.rows||[]);setMessage("Đã nạp file vào sheet. Kiểm tra trước khi lưu.")}catch(error){setMessage("Lỗi: "+(error as Error).message)}finally{setBusy(false)}}
  async function save(){setBusy(true);setMessage("");try{const body=await post("/api/orders/tracking-queue",{rows});setMessage("Đã lưu "+body.saved+" Tracking/Label cho "+body.orders+" Order.");await load();await onDone()}catch(error){setMessage("Lỗi: "+(error as Error).message)}finally{setBusy(false)}}
  const params=new URLSearchParams();if(service)params.set("service",service);if(subService)params.set("sub_service",subService);params.set("format","xlsx");
  return <div className="bulkSheet">
    <div className="bulkSheetToolbar"><div><b>Hàng chờ Tracking & Label</b><span>Sheet được tạo sẵn theo từng carton; paste 2 cột Tracking + URL Label.</span></div><div className="bulkFilters">
      <select value={service} onChange={e=>{setService(e.target.value);setSubService("")}}><option value="">Mọi dịch vụ</option>{services.map(row=><option key={row.id}>{row.value}</option>)}</select>
      <select value={subService} onChange={e=>setSubService(e.target.value)}><option value="">Mọi Sub-Service</option>{subs.map(row=><option key={row.id}>{row.value}</option>)}</select>
      <a className="secondaryBtn" href={"/api/orders/tracking-queue?"+params.toString()}>Tải Excel</a>
      <label className="secondaryBtn fileButton">Upload Excel<input type="file" accept=".xlsx" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file)}}/></label>
      <button className="primaryBtn" disabled={busy||!rows.length} onClick={()=>void save()}>Lưu Tracking/Label</button>
    </div></div>
    <div className="bulkSheetScroll"><table><thead><tr><th>DMD ID</th><th>Client Order ID</th><th>Client</th><th>Người nhận</th><th>Số lượng Carton</th><th>Carton số</th><th>Service</th><th>Supplier</th><th>Số lượng Lô</th><th>Tracking</th><th>URL Label</th></tr></thead>
      <tbody>{rows.map((row,index)=><tr key={row.system_order_code+"-"+row.carton_slot}><td><b>{row.system_order_code}</b></td><td>{row.client_order_id}</td><td>{row.customer}</td><td>{row.recipient_name}</td><td>{row.carton_count}</td><td>{row.carton_slot}</td><td>{row.service}<small>{row.sub_service}</small></td><td><select value={row.supplier} onChange={e=>update(index,"supplier",e.target.value)}><option value="">Chọn</option>{suppliers.map(item=><option key={item.id}>{item.value}</option>)}</select></td><td><input type="number" min="1" value={row.expected_lot_count} onChange={e=>update(index,"expected_lot_count",e.target.value)}/></td><td><input value={row.tracking} disabled={Boolean(row.tracking_id)} onPaste={e=>pasteTracking(e,index)} onChange={e=>update(index,"tracking",e.target.value)}/></td><td><input value={row.label_url} onChange={e=>update(index,"label_url",e.target.value)}/></td></tr>)}</tbody>
    </table></div>
    <div className="bulkSheetFooter"><span>{rows.length} carton đang chờ xử lý</span><b className={message.startsWith("Lỗi")?"error":""}>{busy?"Đang xử lý…":message}</b></div>
  </div>;
}

type ReplacementRow={old_tracking:string;new_tracking:string;new_label_url:string;reason:string;error?:string;system_order_code?:string;order_id?:string;customer?:string;recipient_name?:string};
const blankReplacement=():ReplacementRow=>({old_tracking:"",new_tracking:"",new_label_url:"",reason:""});

export function TrackingReplacementSheet({onDone}:{onDone:()=>void|Promise<void>}){
  const [rows,setRows]=useState<ReplacementRow[]>(()=>Array.from({length:8},blankReplacement));
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const active=rows.filter(row=>row.old_tracking||row.new_tracking||row.new_label_url||row.reason);
  function update(index:number,key:keyof ReplacementRow,value:string){setRows(prev=>prev.map((row,i)=>i===index?{...row,[key]:value,error:undefined,system_order_code:undefined}:row))}
  function paste(e:React.ClipboardEvent<HTMLInputElement>,start:number){const raw=e.clipboardData.getData("text/plain");if(!raw.includes("\n")&&!raw.includes("\t"))return;e.preventDefault();const matrix=raw.replace(/\r/g,"").split("\n").filter(Boolean).map(line=>line.split("\t"));setRows(prev=>{const next=[...prev];while(next.length<start+matrix.length)next.push(blankReplacement());matrix.forEach((values,offset)=>{next[start+offset]={...next[start+offset],old_tracking:String(values[0]||"").trim(),new_tracking:String(values[1]||"").trim(),new_label_url:String(values[2]||"").trim(),reason:String(values[3]||"").trim()}});return next})}
  async function preview(){setBusy(true);setMessage("");try{const body=await post("/api/orders/tracking-replacements",{preview:true,rows:active});setRows([...(body.rows||[]),...Array.from({length:Math.max(2,8-(body.rows||[]).length)},blankReplacement)]);setMessage("Đã match Tracking cũ. Kiểm tra Client/người nhận trước khi lưu.")}catch(error){setMessage("Lỗi: "+(error as Error).message)}finally{setBusy(false)}}
  async function save(){setBusy(true);setMessage("");try{const body=await post("/api/orders/tracking-replacements",{rows:active});setMessage("Đã đổi "+body.updated+" Tracking/Label.");setRows(Array.from({length:8},blankReplacement));await onDone()}catch(error){setMessage("Lỗi: "+(error as Error).message)}finally{setBusy(false)}}
  const ready=active.length>0&&active.every(row=>row.system_order_code&&!row.error&&row.old_tracking&&row.new_tracking&&row.reason);
  return <div className="bulkSheet">
    <div className="bulkSheetToolbar"><div><b>Đổi Tracking & Label hàng loạt</b><span>Match bằng Tracking cũ · Lý do được ghi vào Note chung và History log.</span></div><div className="bulkFilters"><a className="secondaryBtn" href="/templates/dmd-tracking-updates.xlsx">Tải template</a><button className="secondaryBtn" disabled={busy||!active.length} onClick={()=>void preview()}>Kiểm tra dữ liệu</button><button className="primaryBtn" disabled={busy||!ready} onClick={()=>void save()}>Xác nhận thay thế</button></div></div>
    <div className="bulkSheetScroll"><table><thead><tr><th>Tracking cũ</th><th>Tracking mới</th><th>URL Label mới</th><th>Lý do (public)</th><th>DMD ID</th><th>Client Order ID</th><th>Client</th><th>Người nhận</th><th>Kết quả</th></tr></thead><tbody>
      {rows.map((row,index)=><tr key={index} className={row.error?"rowError":""}><td><input value={row.old_tracking} onPaste={e=>paste(e,index)} onChange={e=>update(index,"old_tracking",e.target.value)}/></td><td><input value={row.new_tracking} onChange={e=>update(index,"new_tracking",e.target.value)}/></td><td><input value={row.new_label_url} onChange={e=>update(index,"new_label_url",e.target.value)}/></td><td><input value={row.reason} onChange={e=>update(index,"reason",e.target.value)}/></td><td>{row.system_order_code||"—"}</td><td>{row.order_id||"—"}</td><td>{row.customer||"—"}</td><td>{row.recipient_name||"—"}</td><td>{row.error?row.error:row.system_order_code?"✓":"—"}</td></tr>)}
    </tbody></table></div><div className="bulkSheetFooter"><span>{active.length} dòng có dữ liệu</span><b className={message.startsWith("Lỗi")?"error":""}>{busy?"Đang xử lý…":message}</b></div>
  </div>;
}

type ShipmentRow={tracking_id:number;tracking:string;shipment_status:string;etd_at:string;delivered_at?:string;order_id:string;system_order_code:string;service:string;sub_service:string;customer:string;recipient_name:string};

function travelDays(row:ShipmentRow){const start=new Date(row.etd_at+"T00:00:00");const end=row.shipment_status==="DELIVERED"&&row.delivered_at?new Date(row.delivered_at+"T00:00:00"):new Date();return Math.max(0,Math.floor((end.getTime()-start.getTime())/86400000))}
const blankStatus=()=>({tracking:"",etd_at:"",shipment_status:"IN_TRANSIT"});

function StatusUpdateSheet({onDone}:{onDone:()=>void|Promise<void>}){
  const [rows,setRows]=useState(()=>Array.from({length:8},blankStatus));
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const active=rows.filter(row=>row.tracking||row.etd_at);
  function update(index:number,key:string,value:string){setRows(prev=>prev.map((row,i)=>i===index?{...row,[key]:value}:row))}
  function paste(e:React.ClipboardEvent<HTMLInputElement>,start:number){const raw=e.clipboardData.getData("text/plain");if(!raw.includes("\n")&&!raw.includes("\t"))return;e.preventDefault();const matrix=raw.replace(/\r/g,"").split("\n").filter(Boolean).map(line=>line.split("\t"));setRows(prev=>{const next=[...prev];while(next.length<start+matrix.length)next.push(blankStatus());matrix.forEach((values,offset)=>{next[start+offset]={tracking:String(values[0]||"").trim(),etd_at:String(values[1]||"").trim(),shipment_status:String(values[2]||"IN_TRANSIT").trim()}});return next})}
  async function save(){setBusy(true);try{const body=await post("/api/shipment-status",{updates:active});setMessage("Đã cập nhật "+body.updated+" Tracking.");setRows(Array.from({length:8},blankStatus));await onDone()}catch(error){setMessage("Lỗi: "+(error as Error).message)}finally{setBusy(false)}}
  return <div className="statusUpdateSheet"><p>Paste ba cột: Tracking, ETD (dd/mm/yyyy), Status. Có thể dùng để gán ETD lần đầu.</p><table><thead><tr><th>Tracking</th><th>ETD</th><th>Status</th></tr></thead><tbody>{rows.map((row,index)=><tr key={index}><td><input value={row.tracking} onPaste={e=>paste(e,index)} onChange={e=>update(index,"tracking",e.target.value)}/></td><td><input value={row.etd_at} placeholder="dd/mm/yyyy" onChange={e=>update(index,"etd_at",e.target.value)}/></td><td><select value={row.shipment_status} onChange={e=>update(index,"shipment_status",e.target.value)}>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td></tr>)}</tbody></table><div className="bulkSheetFooter"><b className={message.startsWith("Lỗi")?"error":""}>{busy?"Đang lưu…":message}</b><button className="primaryBtn" disabled={busy||!active.length} onClick={()=>void save()}>Lưu status</button></div></div>;
}

export function ShipmentStatusPanel({enums}:{enums:EnumRow[]}){
  const [rows,setRows]=useState<ShipmentRow[]>([]);
  const [view,setView]=useState("active");
  const [query,setQuery]=useState("");
  const [service,setService]=useState("");
  const [selected,setSelected]=useState<Set<number>>(new Set());
  const [message,setMessage]=useState("");
  const [showBulk,setShowBulk]=useState(false);
  const services=enums.filter(row=>row.enum_type==="SERVICE"&&row.active!==0);
  const load=useCallback(async()=>{try{const params=new URLSearchParams({view});if(query)params.set("q",query);if(service)params.set("service",service);const body=await json("/api/shipment-status?"+params);setRows(body.items||[])}catch(error){setMessage("Lỗi: "+(error as Error).message)}},[view,query,service]);
  useEffect(()=>{const id=setTimeout(()=>void load(),250);return()=>clearTimeout(id)},[load]);
  async function update(row:ShipmentRow,status:string){try{await post("/api/shipment-status",{tracking_id:row.tracking_id,shipment_status:status});setMessage("Đã cập nhật "+row.tracking+".");await load()}catch(error){setMessage("Lỗi: "+(error as Error).message)}}
  async function copy(ids?:Set<number>){const source=ids&&ids.size?rows.filter(row=>ids.has(row.tracking_id)):rows;await navigator.clipboard.writeText([...new Set(source.map(row=>row.tracking))].join("\n"));setMessage("Đã copy "+source.length+" Tracking.")}
  return <div className="shipmentWorkspace">
    <div className="shipmentToolbar"><div className="shipmentViews">{[["active","Theo ETD"],["alerts","Alert"],["exceptions","Exception"],["delivered","Delivered"]].map(([key,label])=><button key={key} className={view===key?"active":""} onClick={()=>{setView(key);setSelected(new Set())}}>{label}</button>)}</div><div className="shipmentTools"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm Tracking, Client Order ID…"/><select value={service} onChange={e=>setService(e.target.value)}><option value="">Mọi dịch vụ</option>{services.map(row=><option key={row.id}>{row.value}</option>)}</select><button className="secondaryBtn" onClick={()=>void copy(selected)}>Copy Tracking{selected.size?" ("+selected.size+")":""}</button><button className="primaryBtn" onClick={()=>setShowBulk(x=>!x)}>Cập nhật ETD/Status</button></div></div>
    {showBulk&&<StatusUpdateSheet onDone={async()=>{await load();setShowBulk(false)}}/>}
    <div className="shipmentTable"><table><thead><tr><th></th><th>Tracking</th><th>Status</th><th>Thời gian vận chuyển</th><th>Client Order ID</th><th>Service</th><th>Client</th><th>DMD ID</th></tr></thead><tbody>{rows.length?rows.map(row=><tr key={row.tracking_id}><td><input type="checkbox" checked={selected.has(row.tracking_id)} onChange={e=>setSelected(prev=>{const next=new Set(prev);if(e.target.checked)next.add(row.tracking_id);else next.delete(row.tracking_id);return next})}/></td><td><div className="trackingPrimary"><b>{row.tracking}</b><button onClick={()=>void navigator.clipboard.writeText(row.tracking)}>Copy</button></div></td><td><select value={row.shipment_status} onChange={e=>void update(row,e.target.value)}>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td><td><b>{travelDays(row)} ngày</b><small>ETD {displayDate(row.etd_at)}{row.delivered_at?" · Delivered "+displayDate(row.delivered_at):""}</small></td><td>{row.order_id||"—"}</td><td>{row.service}<small>{row.sub_service}</small></td><td>{row.customer}<small>{row.recipient_name}</small></td><td>{row.system_order_code}</td></tr>):<tr><td colSpan={8} className="empty">Không có Tracking trong view này.</td></tr>}</tbody></table></div>
    <div className="bulkSheetFooter"><span>{rows.length} Tracking có ETD</span><b className={message.startsWith("Lỗi")?"error":""}>{message}</b></div>
  </div>;
}
