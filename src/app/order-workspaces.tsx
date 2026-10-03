"use client";

import { useCallback,useEffect,useState } from "react";
import { TRACKING_REPLACEMENT_REASONS } from "@/lib/order-rules";

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
type ShipmentItemDraft={sku:string;description:string;material:string;quantity:string;unit_manufacturing_value:string;currency:string};
type ShipmentCartonDraft={id?:number;carton_number:number;lot_number:number;weight:string;length:string;width:string;height:string;volume:string;chargeable_weight:string;items:ShipmentItemDraft[]};
const blankShipmentItem=():ShipmentItemDraft=>({sku:"",description:"",material:"",quantity:"1",unit_manufacturing_value:"",currency:"USD"});

function ShipmentStructureEditor({orderId,role}:{orderId:number;role:Role}){
  const [cartons,setCartons]=useState<ShipmentCartonDraft[]>([]);
  const [lotCount,setLotCount]=useState(1);
  const [busy,setBusy]=useState(true);
  const [message,setMessage]=useState("");
  const load=useCallback(async()=>{
    setBusy(true);setMessage("");
    try{
      const body=await json("/api/orders/"+orderId+"/shipment-structure");
      const allocations=Array.isArray(body.allocations)?body.allocations as GenericRow[]:[];
      const next=(body.cartons as GenericRow[]).map(carton=>({
        id:Number(carton.id),carton_number:Number(carton.carton_number),lot_number:Number(carton.lot_number||1),
        weight:String(carton.weight??""),length:String(carton.length??""),width:String(carton.width??""),height:String(carton.height??""),
        volume:String(carton.volume??""),chargeable_weight:String(carton.chargeable_weight??""),
        items:allocations.filter(row=>Number(row.carton_id)===Number(carton.id)).map(row=>({
          sku:String(row.sku||""),description:String(row.description||""),material:String(row.material||""),quantity:String(row.quantity||1),
          unit_manufacturing_value:String(row.unit_manufacturing_value??""),currency:String(row.currency||"USD"),
        })),
      })) as ShipmentCartonDraft[];
      setCartons(next.map(row=>({...row,items:row.items.length?row.items:[blankShipmentItem()]})));
      setLotCount(Math.max(1,(body.lots||[]).length));
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  },[orderId]);
  useEffect(()=>{void load()},[load]);
  function updateCarton(index:number,key:keyof Omit<ShipmentCartonDraft,"items">,value:string|number){setCartons(prev=>prev.map((row,i)=>i===index?{...row,[key]:value}:row))}
  function updateItem(cartonIndex:number,itemIndex:number,key:keyof ShipmentItemDraft,value:string){setCartons(prev=>prev.map((row,i)=>i===cartonIndex?{...row,items:row.items.map((item,j)=>j===itemIndex?{...item,[key]:value}:item)}:row))}
  function addCarton(){setCartons(prev=>[...prev,{carton_number:prev.length+1,lot_number:1,weight:"",length:"",width:"",height:"",volume:"",chargeable_weight:"",items:[blankShipmentItem()]}])}
  function removeCarton(index:number){setCartons(prev=>prev.filter((_,i)=>i!==index).map((row,i)=>({...row,carton_number:i+1})))}
  const valueOf=(item:ShipmentItemDraft)=>Number(item.quantity||0)*Number(item.unit_manufacturing_value||0);
  const total=cartons.reduce((sum,carton)=>sum+carton.items.reduce((subtotal,item)=>subtotal+valueOf(item),0),0);
  async function save(){
    setBusy(true);setMessage("");
    try{
      const payload={lot_count:cartons.length===1?1:lotCount,cartons:cartons.map(carton=>({...carton,lot_number:cartons.length===1?1:carton.lot_number,weight:Number(carton.weight)||null,length:Number(carton.length)||null,width:Number(carton.width)||null,height:Number(carton.height)||null,volume:Number(carton.volume)||null,chargeable_weight:Number(carton.chargeable_weight)||null,items:carton.items.map(item=>({...item,quantity:Number(item.quantity)||1,unit_manufacturing_value:item.unit_manufacturing_value===""?null:Number(item.unit_manufacturing_value)}))}))};
      const response=await fetch("/api/orders/"+orderId+"/shipment-structure",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const body=await response.json();if(!response.ok)throw new Error(body.error);
      setMessage("Đã lưu khai báo "+cartons.length+" carton / "+(cartons.length===1?1:lotCount)+" lô.");await load();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  if(busy&&!cartons.length)return <div className="loadingState">Đang tải khai báo Carton…</div>;
  return <div className="shipmentStructure">
    <div className="shipmentStructureHead"><div><h3>Khai báo Carton & SKU</h3><p>{cartons.length===1?"Chế độ nhanh: một Order, một Carton, tự động thuộc Lot 1.":"Mỗi carton cần cân nặng, kích thước, Lot và hàng hóa bên trong."}</p></div><div><span>Tổng giá trị sản xuất</span><b>{money(total)}</b></div></div>
    {cartons.length>1&&role!=="CLIENT"&&<div className="lotCountControl"><label>Số lượng lô <input type="number" min="1" max={cartons.length} value={lotCount} onChange={e=>setLotCount(Math.max(1,Number(e.target.value||1)))}/></label><span>Các lô dùng chung Service, Sub-Service và Supplier của Order.</span></div>}
    <div className="cartonEditorList">{cartons.map((carton,cartonIndex)=><section className="cartonEditor" key={carton.id||carton.carton_number}>
      <div className="cartonEditorHead"><div><b>{cartons.length===1?"Thông tin kiện hàng":"Carton "+carton.carton_number}</b>{cartons.length>1&&<span>Lot {carton.lot_number}</span>}</div>{role!=="CLIENT"&&cartons.length>1&&<button className="editBtn" onClick={()=>removeCarton(cartonIndex)}>Bỏ carton</button>}</div>
      <div className="cartonMeasureGrid">
        {cartons.length>1&&<label><span>Thuộc Lot</span><select disabled={role==="CLIENT"} value={carton.lot_number} onChange={e=>updateCarton(cartonIndex,"lot_number",Number(e.target.value))}>{Array.from({length:lotCount},(_,i)=><option key={i+1} value={i+1}>Lot {i+1}</option>)}</select></label>}
        <label><span>Weight (kg)</span><input disabled={role==="CLIENT"} type="number" step="0.001" value={carton.weight} onChange={e=>updateCarton(cartonIndex,"weight",e.target.value)}/></label>
        <label><span>Dài (cm)</span><input disabled={role==="CLIENT"} type="number" step="0.1" value={carton.length} onChange={e=>updateCarton(cartonIndex,"length",e.target.value)}/></label>
        <label><span>Rộng (cm)</span><input disabled={role==="CLIENT"} type="number" step="0.1" value={carton.width} onChange={e=>updateCarton(cartonIndex,"width",e.target.value)}/></label>
        <label><span>Cao (cm)</span><input disabled={role==="CLIENT"} type="number" step="0.1" value={carton.height} onChange={e=>updateCarton(cartonIndex,"height",e.target.value)}/></label>
        <label><span>Thể tích (cm³)</span><input disabled={role==="CLIENT"} type="number" value={carton.volume} onChange={e=>updateCarton(cartonIndex,"volume",e.target.value)}/></label>
        <label><span>Chargeable Weight</span><input disabled={role==="CLIENT"} type="number" step="0.001" value={carton.chargeable_weight} onChange={e=>updateCarton(cartonIndex,"chargeable_weight",e.target.value)}/></label>
      </div>
      <div className="cartonItems"><div className="cartonItemHead"><b>Sản phẩm trong {cartons.length===1?"kiện":"carton"}</b><span>Tổng: {money(carton.items.reduce((sum,item)=>sum+valueOf(item),0))}</span></div>
        {carton.items.map((item,itemIndex)=><div className="cartonItemRow" key={itemIndex}>
          <input disabled={role==="CLIENT"} placeholder="SKU" value={item.sku} onChange={e=>updateItem(cartonIndex,itemIndex,"sku",e.target.value)}/>
          <input disabled={role==="CLIENT"} placeholder="Tên sản phẩm" value={item.description} onChange={e=>updateItem(cartonIndex,itemIndex,"description",e.target.value)}/>
          <input disabled={role==="CLIENT"} placeholder="Chất liệu" value={item.material} onChange={e=>updateItem(cartonIndex,itemIndex,"material",e.target.value)}/>
          <input disabled={role==="CLIENT"} type="number" min="0.001" step="0.001" placeholder="SL" value={item.quantity} onChange={e=>updateItem(cartonIndex,itemIndex,"quantity",e.target.value)}/>
          <input disabled={role==="CLIENT"} type="number" min="0" step="0.01" placeholder="Giá trị/đơn vị" value={item.unit_manufacturing_value} onChange={e=>updateItem(cartonIndex,itemIndex,"unit_manufacturing_value",e.target.value)}/>
          <b>{money(valueOf(item))}</b>
          {role!=="CLIENT"&&carton.items.length>1&&<button className="editBtn" onClick={()=>setCartons(prev=>prev.map((row,i)=>i===cartonIndex?{...row,items:row.items.filter((_,j)=>j!==itemIndex)}:row))}>Bỏ</button>}
        </div>)}
        {role!=="CLIENT"&&<button className="textBtn" onClick={()=>setCartons(prev=>prev.map((row,i)=>i===cartonIndex?{...row,items:[...row.items,blankShipmentItem()]}:row))}>＋ Thêm sản phẩm</button>}
      </div>
    </section>)}</div>
    {role!=="CLIENT"&&<div className="shipmentStructureActions"><button className="secondaryBtn" onClick={addCarton}>＋ Thêm carton</button><button className="primaryBtn" disabled={busy} onClick={()=>void save()}>Lưu khai báo kiện hàng</button></div>}
    {message&&<p className={message.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{message}</p>}
  </div>;
}

export function OrderDetailPanel({orderId,role,onEdit,onPurchase,onDone}:{orderId:number;role:Role;onEdit:(row:GenericRow)=>void;onPurchase?:(row:GenericRow)=>void;onDone?:()=>void|Promise<void>}){
  const [data,setData]=useState<GenericRow|null>(null);
  const [tab,setTab]=useState("overview");
  const [historyScope,setHistoryScope]=useState<"all"|"public"|"internal">("all");
  const [cancelOpen,setCancelOpen]=useState(false),[cancelError,setCancelError]=useState(""),[cancelBusy,setCancelBusy]=useState(false);
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
      await post("/api/orders/"+orderId+"/cancel",{});
      setData(await json("/api/orders/"+orderId));setCancelOpen(false);setTab("history");await onDone?.();
    }catch(error){setCancelError(error instanceof Error?error.message:"Không thể huỷ đơn.")}
    finally{setCancelBusy(false)}
  }
  const active=trackings.filter(row=>row.status==="ACTIVE");
  const events=Array.isArray(data.events)?data.events as GenericRow[]:[];
  const visibleEvents=role==="ADMIN"&&historyScope!=="all"
    ?events.filter(event=>historyScope==="public"?event.visibility==="PUBLIC":event.visibility!=="PUBLIC")
    :events;
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
    {cancelled&&<div className="cancellationSummary"><b>Đã huỷ · Hoàn {String(data.cancellation_refund_percent||0)}%: {money(data.cancellation_refund_amount)}</b><p>{Number(data.cancellation_refund_percent||0)===90?"Khấu trừ 10% do Tracking/Label đã được cấp.":"Đơn chưa được cấp Tracking/Label nên được hoàn 100%."}</p></div>}
    {cancelOpen&&<section className="cancellationConfirm"><h3>Xác nhận huỷ đơn</h3><p>Hoàn {policy.refund_percent}% vào Balance: <b>{money(policy.refund_amount)}</b>. Đơn sẽ ngừng xử lý trên hệ thống.</p><p>{Number(policy.refund_percent||0)===90?"Đơn đã được cấp Tracking/Label nên hoàn 90%; 10% còn lại là phí đã phát sinh.":"Đơn chưa được cấp Tracking/Label nên được hoàn 100%."}</p>{cancelError&&<p role="alert">{cancelError}</p>}<div className="detailActions"><button className="secondaryBtn" disabled={cancelBusy} onClick={()=>setCancelOpen(false)}>Đóng</button><button className="primaryBtn" disabled={cancelBusy} onClick={()=>void submitCancellation()}>{cancelBusy?"Đang huỷ…":"Xác nhận huỷ đơn"}</button></div></section>}
    <div className="detailTabs">
      {[["overview","Tổng quan"],["cartons","Carton & SKU"],["tracking","Tracking & Label"],["finance","Giá & Đối soát"],["history","Lịch sử"]].filter(item=>role==="ADMIN"||item[0]!=="finance").map(item=><button key={item[0]} className={tab===item[0]?"active":""} onClick={()=>setTab(item[0])}>{item[1]}</button>)}
    </div>
    {tab==="overview"&&<div className="detailBody">
      <section className="detailGrid">
        <article className="detailCard"><h3>Người nhận</h3><b>{String(data.recipient_name||"—")}</b><p>{String(data.address1||"")}{data.address2?<><br/>{String(data.address2)}</>:null}</p><p>{[data.city,data.state,data.zip].filter(Boolean).join(", ")}</p><p>{String(data.country||"")} · {String(data.phone||"")}</p>{data.recipient_email?<p>{String(data.recipient_email)}</p>:null}</article>
        <article className="detailCard"><h3>Hàng hóa</h3><dl><dt>Sản phẩm</dt><dd>{String(data.item||"—")}</dd><dt>Chất liệu</dt><dd>{String(data.material||"—")}</dd><dt>Số lượng Carton</dt><dd>{String(data.carton_count||0)}</dd><dt>Khối lượng</dt><dd>{String(data.weight||0)} kg</dd><dt>Kích thước</dt><dd>{data.length&&data.width&&data.height?String(data.length)+" × "+String(data.width)+" × "+String(data.height)+" cm":"Nhập thể tích tổng"}</dd><dt>Thể tích</dt><dd>{Number(data.volume||0).toLocaleString("en-US")} cm³</dd><dt>Hạng cân</dt><dd><b>{String(data.chargeable_weight||0)} kg</b></dd></dl></article>
        <article className="detailCard"><h3>Dịch vụ</h3><dl><dt>Client</dt><dd>{String(data.customer||"—")}</dd><dt>Sales</dt><dd>{String(data.sales||"—")}</dd><dt>Supplier</dt><dd>{role==="ADMIN"?String(data.supplier||"Chưa chọn"):"—"}</dd><dt>Service</dt><dd>{String(data.service||"—")}</dd><dt>Sub-Service</dt><dd>{String(data.sub_service||"—")}</dd><dt>Tracking/Label</dt><dd>{active.filter(row=>row.label_url).length}/{String(data.carton_count||0)}</dd><dt>Số lượng Lô</dt><dd>{String(data.expected_lot_count||1)}</dd></dl></article>
      </section>
      <section className="notesSection">
        <div className="publicSystemNote"><h3>Note</h3><p>{String(data.public_note||"Chưa có cập nhật công khai.")}</p></div>
        {role!=="CLIENT"&&<div className="internalNote"><h3>Note Private</h3><p>{String(data.internal_note||"Chưa có note private.")}</p></div>}
      </section>
    </div>}
    {tab==="cartons"&&<div className="detailBody"><ShipmentStructureEditor orderId={orderId} role={role}/></div>}
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
    {tab==="history"&&<div className="detailBody">
      {role==="ADMIN"&&<div className="historyFilters">{[["all","Tất cả"],["public","Khách hàng thấy"],["internal","Nội bộ"]].map(([key,label])=><button key={key} className={historyScope===key?"active":""} onClick={()=>setHistoryScope(key as "all"|"public"|"internal")}>{label}</button>)}</div>}
      <div className="historyTimeline">{visibleEvents.length?visibleEvents.map(event=><article key={String(event.id)} className={event.visibility!=="PUBLIC"?"internalEvent":"publicEvent"}>
        <i></i><div><time>{displayDate(event.created_at)}{role==="ADMIN"?" · "+String(event.actor_display_name||event.actor_username||"Hệ thống"):""}{role==="ADMIN"&&event.actor_username?" · @"+String(event.actor_username):""}{role==="ADMIN"&&event.actor_role?" · "+String(event.actor_role):""}</time><b>{String(event.summary||event.event_type)}</b><span>{role==="ADMIN"&&<em className={event.visibility!=="PUBLIC"?"historyBadge internal":"historyBadge public"}>{event.visibility==="ADMIN"?"Admin Audit":event.visibility==="INTERNAL"?"Nội bộ":"Khách hàng thấy"}</em>}{String(event.source||"UI")}</span></div>
      </article>):<p>Không có History log trong nhóm này.</p>}</div>
    </div>}
  </div>;
}

type QueueRow={
  order_pk:number;system_order_code:string;client_order_id:string;customer:string;recipient_name:string;
  service:string;sub_service:string;carton_count:number;carton_slot:number;carton_id:number|null;supplier:string;
  expected_lot_count:number;tracking_id:number|null;tracking:string;label_url:string;
  purchase_status:string;purchase_issue:string;manifest_status:string;manifest_issue:string;
};

export function BulkTrackingSheet({enums,onDone}:{enums:EnumRow[];onDone:()=>void|Promise<void>}){
  const [rows,setRows]=useState<QueueRow[]>([]);
  const [mode,setMode]=useState<"PURCHASE"|"MANIFEST">("PURCHASE");
  const [service,setService]=useState("");
  const [subService,setSubService]=useState("");
  const [supplierFilter,setSupplierFilter]=useState("");
  const [selectedOrders,setSelectedOrders]=useState<number[]>([]);
  const [quickPaste,setQuickPaste]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const suppliers=enums.filter(row=>row.enum_type==="SUPPLIER"&&row.active!==0);
  const services=enums.filter(row=>row.enum_type==="SERVICE"&&row.active!==0);
  const subs=enums.filter(row=>row.enum_type==="SUB_SERVICE"&&row.active!==0&&(!service||row.parent_value===service));
  const subsFor=(parent:string)=>enums.filter(row=>row.enum_type==="SUB_SERVICE"&&row.active!==0&&row.parent_value===parent);
  const load=useCallback(async()=>{
    setBusy(true);setMessage("");
    try{
      const params=new URLSearchParams();
      if(service)params.set("service",service);
      if(subService)params.set("sub_service",subService);
      if(supplierFilter)params.set("supplier",supplierFilter);
      params.set("mode",mode);
      const body=await json("/api/orders/tracking-queue?"+params);
      const nextRows=body.rows||[];
      setRows(nextRows);
      const ids=new Set<number>(nextRows.map((row:QueueRow)=>row.order_pk));
      setSelectedOrders(prev=>prev.filter(id=>ids.has(id)));
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  },[service,subService,supplierFilter,mode]);
  useEffect(()=>{void load()},[load]);

  function update(index:number,key:keyof QueueRow,value:string){
    setRows(prev=>prev.map((row,i)=>i===index?{
      ...row,[key]:key==="expected_lot_count"?Number(value||1):value,
    }:row));
  }
  function updateOrder(orderPk:number,key:"sub_service"|"supplier"|"expected_lot_count",value:string){
    setRows(prev=>prev.map(row=>row.order_pk===orderPk?{
      ...row,[key]:key==="expected_lot_count"?Number(value||1):value,
      purchase_status:key==="expected_lot_count"?row.purchase_status:"CHECK_AFTER_SAVE",
      purchase_issue:key==="expected_lot_count"?row.purchase_issue:"Lưu thay đổi để kiểm tra lại template",
    }:row));
  }
  function parseTrackingPaste(raw:string){
    return raw.replace(/\r/g,"").split("\n")
      .map(line=>line.trim())
      .filter(Boolean)
      .map(line=>{
        const values=line.split("\t");
        if(values.length===1){
          const match=line.match(/^(\S+)\s+(https?:\/\/\S+)$/i);
          if(match)return [match[1],match[2]];
        }
        return values;
      })
      .filter((values,index)=>!(index===0&&String(values[0]||"").trim().toLowerCase()==="tracking"));
  }
  function applyTrackingPaste(matrix:string[][],start=0){
    setRows(prev=>{
      const next=[...prev];
      matrix.forEach((values,offset)=>{
        const index=start+offset;
        if(!next[index])return;
        next[index]={
          ...next[index],
          tracking:next[index].tracking_id?next[index].tracking:String(values[0]||"").trim(),
          label_url:String(values[1]||"").trim(),
        };
      });
      return next;
    });
  }
  function pasteTracking(e:React.ClipboardEvent<HTMLInputElement>,start:number){
    const raw=e.clipboardData.getData("text/plain");
    if(!raw.includes("\n")&&!raw.includes("\t"))return;
    e.preventDefault();
    applyTrackingPaste(parseTrackingPaste(raw),start);
  }
  function applyQuickPaste(){
    const matrix=parseTrackingPaste(quickPaste);
    if(!matrix.length){setMessage("Lỗi: Chưa có dữ liệu để dán.");return}
    const applied=Math.min(matrix.length,rows.length);
    applyTrackingPaste(matrix);setQuickPaste("");
    setMessage("Đã áp dụng "+applied+" dòng vào sheet"+(matrix.length>rows.length?"; bỏ qua "+(matrix.length-rows.length)+" dòng vượt quá hàng chờ.":". Kiểm tra trước khi lưu."));
  }
  async function upload(file:File){
    setBusy(true);setMessage("");
    try{
      const form=new FormData();form.set("file",file);
      const response=await fetch("/api/orders/tracking-queue",{method:"PUT",body:form});
      const body=await response.json();if(!response.ok)throw new Error(body.error);
      setRows(body.rows||[]);setMessage("Đã nạp file vào sheet. Kiểm tra trước khi lưu.");
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  async function persist(){
    return post("/api/orders/tracking-queue",{rows});
  }
  async function save(){
    setBusy(true);setMessage("");
    try{
      const body=await persist();
      setMessage("Đã lưu "+body.saved+" Tracking/Label cho "+body.orders+" Order.");
      await load();await onDone();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  function downloadBlob(response:Response,blob:Blob){
    const disposition=response.headers.get("content-disposition")||"";
    const filename=disposition.match(/filename="?([^";]+)"?/)?.[1]||"purchase-export.xlsx";
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function skippedDetail(header:string|null){
    if(!header)return [] as Array<{dmd_id:string;reason:string}>;
    try{
      const bytes=Uint8Array.from(atob(header),char=>char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes)) as Array<{dmd_id:string;reason:string}>;
    }catch{return [] as Array<{dmd_id:string;reason:string}>}
  }
  async function exportOrders(generic=false){
    if(!selectedOrders.length){setMessage("Lỗi: Chọn ít nhất một Order.");return}
    setBusy(true);setMessage("");
    try{
      if(mode==="PURCHASE")await persist();
      const endpoint=mode==="MANIFEST"?"/api/manifest-export":generic?"/api/purchase-export/generic":"/api/purchase-export";
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_ids:selectedOrders})});
      if(!response.ok){const body=await response.json();throw new Error(body.error+(body.missing?.length?" · "+body.missing.map((row:{dmd_id:string;reason:string})=>row.dmd_id+": "+row.reason).join(" | "):""))}
      downloadBlob(response,await response.blob());
      const skipped=skippedDetail(response.headers.get("x-dmd-skipped-detail"));
      setMessage(mode==="MANIFEST"
        ?"Đã xuất Manifest"+(skipped.length?"; bỏ qua "+skipped.map(row=>row.dmd_id+" ("+row.reason+")").join(", "):".")
        :generic?"Đã xuất Generic cho "+selectedOrders.length+" Order.":"Đã xuất file mua đơn"+(skipped.length?"; bỏ qua "+skipped.map(row=>row.dmd_id+" ("+row.reason+")").join(", "):"."));
      await load();await onDone();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }

  const params=new URLSearchParams();
  if(service)params.set("service",service);
  if(subService)params.set("sub_service",subService);
  if(supplierFilter)params.set("supplier",supplierFilter);
  params.set("mode",mode);params.set("format","xlsx");
  const orderGroups=Array.from(rows.reduce((groups,row)=>{
    const group=groups.get(row.order_pk)||[];group.push(row);groups.set(row.order_pk,group);return groups;
  },new Map<number,QueueRow[]>()).values());
  const allIds=orderGroups.map(group=>group[0].order_pk);
  const allSelected=Boolean(allIds.length)&&allIds.every(id=>selectedOrders.includes(id));
  function toggleOrder(id:number){setSelectedOrders(prev=>prev.includes(id)?prev.filter(value=>value!==id):[...prev,id])}

  return <div className="bulkSheet">
    <div className="bulkSheetToolbar"><div><b>Mua đơn & Manifest hàng loạt</b><span>Purchase: xuất file mua label rồi nhập Tracking. Manifest: xuất hồ sơ sau khi đã có Tracking.</span></div><div className="bulkFilters">
      <label className="bulkFilterField"><span>Dịch vụ</span><select value={service} onChange={e=>{setService(e.target.value);setSubService("")}}><option value="">Tất cả dịch vụ</option>{services.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
      <label className="bulkFilterField"><span>Sub-Service</span><select value={subService} onChange={e=>setSubService(e.target.value)}><option value="">Tất cả Sub-Service</option>{subs.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
      <label className="bulkFilterField"><span>Supplier</span><select value={supplierFilter} onChange={e=>setSupplierFilter(e.target.value)}><option value="">Tất cả Supplier</option>{suppliers.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
      {mode==="PURCHASE"&&<button className="secondaryBtn" disabled={busy||!selectedOrders.length} onClick={()=>void exportOrders(true)}>Xuất Generic</button>}
      <button className="primaryBtn" disabled={busy||!selectedOrders.length} onClick={()=>void exportOrders(false)}>{mode==="MANIFEST"?"Xuất Manifest":"Xuất file mua đơn"} ({selectedOrders.length})</button>
    </div></div>
    <div className="purchaseModeTabs"><button className={mode==="PURCHASE"?"active":""} onClick={()=>{setMode("PURCHASE");setSelectedOrders([])}}>1–3 · Mua Label & Tracking</button><button className={mode==="MANIFEST"?"active":""} onClick={()=>{setMode("MANIFEST");setSelectedOrders([])}}>4 · Manifest hải quan</button></div>
    <div className="purchaseSelectionBar">
      <label><input type="checkbox" checked={allSelected} onChange={()=>setSelectedOrders(allSelected?[]:allIds)}/> Chọn tất cả {orderGroups.length} Order sau filter</label>
      {mode==="PURCHASE"?<div>
        <a className="secondaryBtn" href={"/api/orders/tracking-queue?"+params.toString()}>Tải file Tracking</a>
        <label className="secondaryBtn fileButton">Upload Tracking<input type="file" accept=".xlsx" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file)}}/></label>
        <button className="secondaryBtn" disabled={busy||!rows.length} onClick={()=>void save()}>Lưu Tracking/Label</button>
      </div>:<div><span>Chỉ hiển thị Order đã có Tracking. Chọn các Order thực tế gửi đi rồi xuất Manifest.</span></div>}
    </div>
    {mode==="PURCHASE"&&<div className="bulkPasteBar">
      <div><b>Dán nhanh từ Excel/Google Sheets</b><span>Copy 2 cột Tracking + URL Label, mỗi carton một dòng. Có thể dán trực tiếp vào ô Tracking đầu tiên.</span></div>
      <textarea value={quickPaste} onChange={e=>setQuickPaste(e.target.value)} placeholder={"TRACKING-001\thttps://.../label-001.pdf\nTRACKING-002\thttps://.../label-002.pdf"}/>
      <button className="secondaryBtn" disabled={!quickPaste.trim()||!rows.length} onClick={applyQuickPaste}>Áp dụng vào sheet</button>
    </div>}
    <div className="bulkSheetScroll"><table><thead><tr><th>Chọn</th><th>DMD ID</th><th>Client Order ID</th><th>Client</th><th>Người nhận</th><th>Template</th><th>Carton</th><th>Service</th><th>Sub-Service (Order)</th><th>Supplier (Order)</th><th>Số lô (Order)</th><th>Tracking</th><th>URL Label</th></tr></thead>
      <tbody>{orderGroups.map((group,groupIndex)=>group.map((row,rowIndex)=>{
        const index=rows.indexOf(row);
        const rowClass=(groupIndex%2?"orderGroupAlt":"orderGroupBase")+" "+(rowIndex===0?"orderGroupStart":"");
        return <tr key={row.system_order_code+"-"+row.carton_slot} className={rowClass}>
          {rowIndex===0&&<td rowSpan={group.length} className="orderLevelField"><input type="checkbox" checked={selectedOrders.includes(row.order_pk)} onChange={()=>toggleOrder(row.order_pk)}/></td>}
          <td><b>{row.system_order_code}</b></td>
          <td>{row.client_order_id}</td><td>{row.customer}</td><td>{row.recipient_name}</td>
          {rowIndex===0&&<td rowSpan={group.length} className="orderLevelField">{(()=>{const status=mode==="MANIFEST"?row.manifest_status:row.purchase_status;const issue=mode==="MANIFEST"?row.manifest_issue:row.purchase_issue;return <><span className={"templateState "+String(status||"MISSING_TEMPLATE").toLowerCase()}>{status==="READY"?"Ready":status==="MISSING_DATA"?"Thiếu dữ liệu":status==="CHECK_AFTER_SAVE"?"Cần lưu lại":"Chưa có Template"}</span>{issue&&<small>{issue}</small>}</>})()}</td>}
          <td>{row.carton_slot}/{row.carton_count}</td>
          <td>{row.service}</td>
          {rowIndex===0&&<>
            <td rowSpan={group.length} className="orderLevelField"><label><span>Áp dụng toàn Order</span><select disabled={mode==="MANIFEST"} value={row.sub_service} onChange={e=>updateOrder(row.order_pk,"sub_service",e.target.value)}><option value="">Không có</option>{subsFor(row.service).map(item=><option key={item.id}>{item.value}</option>)}</select></label></td>
            <td rowSpan={group.length} className="orderLevelField"><label><span>Áp dụng toàn Order</span><select disabled={mode==="MANIFEST"} value={row.supplier} onChange={e=>updateOrder(row.order_pk,"supplier",e.target.value)}><option value="">Chọn Supplier</option>{suppliers.map(item=><option key={item.id}>{item.value}</option>)}</select></label></td>
            <td rowSpan={group.length} className="orderLevelField"><label><span>Áp dụng toàn Order</span><input disabled={mode==="MANIFEST"} type="number" min="1" value={row.expected_lot_count} onChange={e=>updateOrder(row.order_pk,"expected_lot_count",e.target.value)}/></label></td>
          </>}
          <td><input value={row.tracking} disabled={mode==="MANIFEST"||Boolean(row.tracking_id)} onPaste={e=>pasteTracking(e,index)} onChange={e=>update(index,"tracking",e.target.value)}/></td>
          <td><input value={row.label_url} disabled={mode==="MANIFEST"} onChange={e=>update(index,"label_url",e.target.value)}/></td>
        </tr>;
      }))}</tbody>
    </table></div>
    <div className="bulkSheetFooter"><span>{orderGroups.length} Order · {rows.length} carton đang chờ · đã chọn {selectedOrders.length} Order</span><b className={message.startsWith("Lỗi")?"error":""}>{busy?"Đang xử lý…":message}</b></div>
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
  const ready=active.length>0&&active.every(row=>row.system_order_code&&!row.error&&row.old_tracking&&row.new_tracking);
  return <div className="bulkSheet">
    <div className="bulkSheetToolbar"><div><b>Đổi Tracking & Label hàng loạt</b><span>Match bằng Tracking cũ · Lý do không bắt buộc và chỉ được chọn từ danh sách công khai.</span></div><div className="bulkFilters"><a className="secondaryBtn" href="/templates/dmd-tracking-updates.xlsx">Tải template</a><button className="secondaryBtn" disabled={busy||!active.length} onClick={()=>void preview()}>Kiểm tra dữ liệu</button><button className="primaryBtn" disabled={busy||!ready} onClick={()=>void save()}>Xác nhận thay thế</button></div></div>
    <div className="bulkSheetScroll"><table><thead><tr><th>Tracking cũ</th><th>Tracking mới</th><th>URL Label mới</th><th>Lý do công khai (không bắt buộc)</th><th>DMD ID</th><th>Client Order ID</th><th>Client</th><th>Người nhận</th><th>Kết quả</th></tr></thead><tbody>
      {rows.map((row,index)=><tr key={index} className={row.error?"rowError":""}><td><input value={row.old_tracking} onPaste={e=>paste(e,index)} onChange={e=>update(index,"old_tracking",e.target.value)}/></td><td><input value={row.new_tracking} onChange={e=>update(index,"new_tracking",e.target.value)}/></td><td><input value={row.new_label_url} onChange={e=>update(index,"new_label_url",e.target.value)}/></td><td><select value={row.reason} onChange={e=>update(index,"reason",e.target.value)}><option value="">Không ghi lý do</option>{TRACKING_REPLACEMENT_REASONS.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select></td><td>{row.system_order_code||"—"}</td><td>{row.order_id||"—"}</td><td>{row.customer||"—"}</td><td>{row.recipient_name||"—"}</td><td>{row.error?row.error:row.system_order_code?"✓":"—"}</td></tr>)}
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
