"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "SALES";
type User = { id:number; username:string; display_name:string; role:Role; active?:number };
type RowData = Record<string, string | number | null>;
type PagedRows = { items:RowData[]; total:number; page:number; pageSize:number; totalPages:number };
type AppSection = "dashboard"|"orders"|"imports"|"costs"|"recon"|"ledger"|"accounts";
type Summary = { orders:number; review:number; unmatched:number; ledger:number; receivable:number };
type ManualKind = "order" | "cost" | "balance";
type InputMode = "manual" | "import";

const money = (v: unknown) => new Intl.NumberFormat("en-US", {
  style:"currency", currency:"USD", maximumFractionDigits:2,
}).format(Number(v || 0));

const today = () => new Date().toISOString().slice(0, 10);

async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Không thể lưu dữ liệu");
  return data;
}

function Field({
  label, name, value, onChange, type="text", placeholder, required=false, wide=false,
}: {
  label:string; name:string; value:string; onChange:(name:string,value:string)=>void;
  type?:string; placeholder?:string; required?:boolean; wide?:boolean;
}) {
  return <label className={wide ? "field wide" : "field"}>
    <span>{label}{required && <b> *</b>}</span>
    <input
      name={name}
      type={type}
      value={value}
      placeholder={placeholder}
      required={required}
      step={type==="number"?"any":undefined}
      onChange={(e)=>onChange(name,e.target.value)}
    />
  </label>;
}

function SelectField({
  label, name, value, onChange, options, wide=false,
}: {
  label:string; name:string; value:string; onChange:(name:string,value:string)=>void;
  options:Array<{value:string;label:string}>; wide?:boolean;
}) {
  return <label className={wide ? "field wide" : "field"}>
    <span>{label}</span>
    <select value={value} onChange={(e)=>onChange(name,e.target.value)}>
      {options.map((o)=><option value={o.value} key={o.value}>{o.label}</option>)}
    </select>
  </label>;
}

function TextAreaField({
  label, name, value, onChange,
}: {
  label:string; name:string; value:string; onChange:(name:string,value:string)=>void;
}) {
  return <label className="field wide">
    <span>{label}</span>
    <textarea value={value} rows={2} onChange={(e)=>onChange(name,e.target.value)} />
  </label>;
}

function OrderForm({
  role, currentUser, salesUsers, edit, onDone, onCancelEdit,
}: {
  role:Role; currentUser:User; salesUsers:User[]; edit:RowData|null; onDone:()=>void; onCancelEdit:()=>void;
}) {
  const blank = useMemo(()=>({
    id:"", created_at:today(), sales:"", sales_user_id:"", customer:"", order_id:"", service:"ePacket", sub_service:"",
    item:"", recipient_name:"", country:"US", weight:"", length:"", width:"", height:"",
    supplier:"", tracking:"", label:"", est_net_cost:"", base_cost:"", retail:"", discount:"",
    sales_price:"", surcharge:"", import_tax:"", auto_pricing:"1", note:"",
  }),[]);
  const [form,setForm]=useState(blank);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");

  useEffect(()=>{
    if (!edit) { setForm(blank); return; }
    const next = { ...blank };
    Object.keys(next).forEach((key)=>{
      const v=edit[key];
      (next as Record<string,string>)[key]=v===null||v===undefined?"":String(v);
    });
    next.id=String(edit.id || "");
    setForm(next);
    setMsg("");
  },[edit,blank]);

  const change=(name:string,value:string)=>setForm((x)=>({...x,[name]:value}));

  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setMsg("");
    try {
      const saved=await postJson("/api/orders",form);
      setMsg(edit?"Đã cập nhật order #"+saved.id:"Đã tạo order #"+saved.id);
      setForm(blank); onCancelEdit(); onDone();
    } catch(error) {
      setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể lưu"));
    } finally { setBusy(false); }
  }

  return <form className="formCard" onSubmit={submit}>
    <div className="formHead">
      <div><span className="eyebrow">ORDER INTAKE</span><h3>{edit?"Chỉnh sửa Order":"Tạo Order mới"}</h3></div>
      {edit && <button type="button" className="linkBtn" onClick={()=>{setForm(blank);onCancelEdit();}}>Hủy sửa</button>}
    </div>
    <p className="formHint">Sales tạo draft trước. Admin bổ sung Tracking / Supplier / Cost sau; hệ thống tự merge và sync.</p>
    <div className="formGrid">
      <Field label="Ngày tạo" name="created_at" type="date" value={form.created_at} onChange={change}/>
      {role==="ADMIN"
        ? <SelectField label="Sales account" name="sales_user_id" value={form.sales_user_id} onChange={change} options={[{value:"",label:"-- Chọn Sales --"},...salesUsers.map(u=>({value:String(u.id),label:u.display_name+" (@"+u.username+")"}))]}/>
        : <label className="field"><span>Sales account</span><input value={currentUser.display_name+" (@"+currentUser.username+")"} disabled/></label>}
      <Field label="Khách" name="customer" value={form.customer} onChange={change} required/>
      <Field label="Order ID" name="order_id" value={form.order_id} onChange={change} required={!form.tracking}/>
      <Field label="Dịch vụ" name="service" value={form.service} onChange={change} required/>
      <Field label="Sub-Service" name="sub_service" value={form.sub_service} onChange={change}/>
      <Field label="Mặt hàng" name="item" value={form.item} onChange={change}/>
      <Field label="Người nhận" name="recipient_name" value={form.recipient_name} onChange={change}/>
      <Field label="Nước" name="country" value={form.country} onChange={change}/>
      <Field label="Khối lượng (kg)" name="weight" type="number" value={form.weight} onChange={change}/>
      <Field label="Dài (cm)" name="length" type="number" value={form.length} onChange={change}/>
      <Field label="Rộng (cm)" name="width" type="number" value={form.width} onChange={change}/>
      <Field label="Cao (cm)" name="height" type="number" value={form.height} onChange={change}/>
    </div>

    {role==="ADMIN" && <div className="adminBlock">
      <div className="adminTitle"><span>Admin finance / fulfilment</span><small>Tự động sync sang Sales view</small></div>
      <div className="formGrid">
        <Field label="Supplier" name="supplier" value={form.supplier} onChange={change}/>
        <Field label="Tracking" name="tracking" value={form.tracking} onChange={change} required={!form.order_id}/>
        <Field label="Label URL" name="label" value={form.label} onChange={change} wide/>
        <Field label="Estimated Net Cost" name="est_net_cost" type="number" value={form.est_net_cost} onChange={change}/>
        <label className="checkField"><input type="checkbox" checked={form.auto_pricing!=="0"} onChange={e=>change("auto_pricing",e.target.checked?"1":"0")}/><span>Auto pricing<br/><small>Tự tính Base / Retail / Sales Price khi Net Cost đổi</small></span></label>
        <Field label="Base Cost" name="base_cost" type="number" value={form.base_cost} onChange={change} placeholder="Auto nếu trống"/>
        <Field label="Retail" name="retail" type="number" value={form.retail} onChange={change} placeholder="Auto nếu trống"/>
        <Field label="Discount (%)" name="discount" type="number" value={form.discount} onChange={change}/>
        <Field label="Sales Price" name="sales_price" type="number" value={form.sales_price} onChange={change} placeholder="Auto nếu trống"/>
        <Field label="Phụ phí" name="surcharge" type="number" value={form.surcharge} onChange={change}/>
        <Field label="Thuế NK" name="import_tax" type="number" value={form.import_tax} onChange={change}/>
      </div>
    </div>}
    <TextAreaField label="Note" name="note" value={form.note} onChange={change}/>
    <div className="formFooter">
      <span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span>
      <button className="primaryBtn" disabled={busy}>{busy?"Đang lưu…":edit?"Lưu thay đổi":"Tạo Order"}</button>
    </div>
  </form>;
}


type SheetRow = Record<string,string>;
type SheetColumn = { key:string; label:string; width?:number; type?:"text"|"number"|"date"|"select"; options?:Array<{value:string;label:string}> };

function QuickOrderSheet({role,salesUsers,onDone,onAdvanced}:{role:Role;salesUsers:User[];onDone:()=>void;onAdvanced:()=>void}) {
  const blankRow=():SheetRow=>({
    created_at:"",sales_user_id:"",customer:"",order_id:"",service:"",sub_service:"",item:"",
    carton_count:"",weight:"",length:"",width:"",height:"",recipient_name:"",city:"",state:"",
    zip:"",country:"",note:"",supplier:"",tracking:"",est_net_cost:"",discount:"",surcharge:"",import_tax:"",
  });
  const [rows,setRows]=useState<SheetRow[]>(()=>Array.from({length:8},blankRow));
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [errors,setErrors]=useState<Record<number,string>>({});

  const common:SheetColumn[]=[
    {key:"created_at",label:"Ngày",width:118,type:"date"},{key:"customer",label:"Khách *",width:150},
    {key:"order_id",label:"Order ID *",width:135},{key:"service",label:"Dịch vụ",width:125},
    {key:"sub_service",label:"Sub-Service",width:120},{key:"item",label:"Mặt hàng",width:135},
    {key:"carton_count",label:"Carton",width:75,type:"number"},{key:"weight",label:"Kg",width:72,type:"number"},
    {key:"length",label:"Dài",width:72,type:"number"},{key:"width",label:"Rộng",width:72,type:"number"},
    {key:"height",label:"Cao",width:72,type:"number"},{key:"recipient_name",label:"Người nhận",width:145},
    {key:"city",label:"Thành phố",width:115},{key:"state",label:"Bang",width:90},{key:"zip",label:"ZIP",width:90},
    {key:"country",label:"Nước",width:85},{key:"note",label:"Note",width:180},
  ];
  const columns:SheetColumn[]=role==="ADMIN"?[
    {key:"sales_user_id",label:"Sales",width:160,type:"select",options:[{value:"",label:"— Chọn Sales —"},...salesUsers.map(u=>({value:String(u.id),label:u.display_name}))]},
    ...common,
    {key:"supplier",label:"Supplier",width:120},{key:"tracking",label:"Tracking",width:145},
    {key:"est_net_cost",label:"Est. Net",width:90,type:"number"},{key:"discount",label:"Discount %",width:90,type:"number"},
    {key:"surcharge",label:"Phụ phí",width:90,type:"number"},{key:"import_tax",label:"Thuế NK",width:90,type:"number"},
  ]:common;

  const dirty=(row:SheetRow)=>Object.entries(row).some(([key,v])=>key!=="created_at"&&String(v||"").trim()!=="");
  const activeRows=rows.map((row,index)=>({row,index})).filter(x=>dirty(x.row));

  function updateCell(rowIndex:number,key:string,value:string){
    setRows(prev=>prev.map((r,i)=>i===rowIndex?{...r,[key]:value}:r));
    setErrors(prev=>{const next={...prev};delete next[rowIndex];return next});
  }
  function addRows(count=5){setRows(prev=>[...prev,...Array.from({length:count},blankRow)])}
  function removeRow(index:number){setRows(prev=>prev.length<=1?[blankRow()]:prev.filter((_,i)=>i!==index));setErrors({})}
  function focusCell(row:number,col:number){requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-sheet-cell="${row}-${col}"]`)?.focus())}
  function handleKey(e:React.KeyboardEvent<HTMLInputElement|HTMLSelectElement>,row:number,col:number){
    if(e.key==="Enter"){e.preventDefault();if(row===rows.length-1)addRows(1);focusCell(row+1,col)}
  }
  function handlePaste(e:React.ClipboardEvent<HTMLInputElement|HTMLSelectElement>,startRow:number,startCol:number){
    const raw=e.clipboardData.getData("text/plain");
    if(!raw.includes("\t")&&!raw.includes("\n"))return;
    e.preventDefault();
    const matrix=raw.replace(/\r/g,"").split("\n").filter((line,i,a)=>!(i===a.length-1&&line==="")).map(line=>line.split("\t"));
    setRows(prev=>{
      const next=[...prev]; while(next.length<startRow+matrix.length)next.push(blankRow());
      matrix.forEach((vals,rOff)=>vals.forEach((value,cOff)=>{
        const col=columns[startCol+cOff]; if(!col)return;
        let normalized=value.trim();
        if(col.key==="sales_user_id"){
          const match=salesUsers.find(u=>u.display_name.toLowerCase()===normalized.toLowerCase()||u.username.toLowerCase()===normalized.toLowerCase());
          if(match)normalized=String(match.id);
        }
        next[startRow+rOff]={...next[startRow+rOff],[col.key]:normalized};
      }));
      return next;
    });
  }

  async function saveAll(){
    if(!activeRows.length){setMsg("Nhập ít nhất 1 dòng Order.");return;}
    const invalid:Record<number,string>={};
    activeRows.forEach(({row,index})=>{
      if(!row.customer.trim())invalid[index]="Thiếu Khách";
      else if(!row.order_id.trim())invalid[index]="Thiếu Order ID";
    });
    if(Object.keys(invalid).length){setErrors(invalid);setMsg("Có dòng thiếu dữ liệu bắt buộc.");return;}
    setBusy(true);setMsg("");setErrors({});
    const results=await Promise.all(activeRows.map(async({row,index})=>{
      try{
        await postJson("/api/orders",{...row,created_at:row.created_at||today(),service:row.service||"ePacket",country:row.country||"US",auto_pricing:true});
        return {index,ok:true as const};
      }catch(error){return {index,ok:false as const,error:error instanceof Error?error.message:"Không thể lưu"}}
    }));
    const failed=results.filter(x=>!x.ok);
    const succeeded=results.filter(x=>x.ok).map(x=>x.index);
    if(failed.length){
      const nextErrors:Record<number,string>={};
      failed.forEach(x=>{if(!x.ok)nextErrors[x.index]=x.error});
      setErrors(nextErrors);setRows(prev=>prev.map((r,i)=>succeeded.includes(i)?blankRow():r));
      setMsg(`Đã lưu ${succeeded.length} dòng, ${failed.length} dòng lỗi.`);setBusy(false);return;
    }
    setBusy(false);onDone();
  }

  return <div className="sheetEntry">
    <div className="sheetToolbar">
      <div><b>Nhập nhanh nhiều Order</b><span>Paste từ Google Sheets/Excel · Enter xuống dòng · Tab sang ô kế</span></div>
      <div className="sheetTools">
        <button className="secondaryBtn" onClick={()=>addRows(5)}>＋ 5 dòng</button>
        <button className="secondaryBtn" onClick={onAdvanced}>Form chi tiết</button>
        <button className="primaryBtn" disabled={busy||!activeRows.length} onClick={()=>void saveAll()}>{busy?"Đang lưu…":`Lưu ${activeRows.length||""} Order`}</button>
      </div>
    </div>
    <div className="sheetScroll">
      <table className="sheetTable">
        <thead><tr><th className="sheetCorner">#</th>{columns.map(col=><th key={col.key} style={{minWidth:col.width||110}}>{col.label}</th>)}<th></th></tr></thead>
        <tbody>{rows.map((row,r)=><tr key={r} className={errors[r]?"sheetErrorRow":dirty(row)?"sheetDirtyRow":""}>
          <td className="sheetRowNumber"><span>{r+1}</span>{errors[r]&&<i title={errors[r]}>!</i>}</td>
          {columns.map((col,c)=><td key={col.key} className="sheetCell">
            {col.type==="select"
              ? <select data-sheet-cell={`${r}-${c}`} value={row[col.key]||""} onChange={e=>updateCell(r,col.key,e.target.value)} onKeyDown={e=>handleKey(e,r,c)} onPaste={e=>handlePaste(e,r,c)}>{col.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <input data-sheet-cell={`${r}-${c}`} type={col.type||"text"} step={col.type==="number"?"any":undefined} value={row[col.key]||""} placeholder={col.key==="service"?"ePacket":col.key==="country"?"US":""} onChange={e=>updateCell(r,col.key,e.target.value)} onKeyDown={e=>handleKey(e,r,c)} onPaste={e=>handlePaste(e,r,c)}/>}
          </td>)}
          <td className="sheetRemove"><button title="Xóa dòng" onClick={()=>removeRow(r)}>×</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="sheetFooter">
      <button className="textBtn" onClick={()=>addRows(10)}>＋ Thêm 10 dòng</button>
      <div><span>{activeRows.length} dòng có dữ liệu</span>{msg&&<b className={msg.includes("lỗi")||msg.includes("thiếu")?"sheetMsg error":"sheetMsg"}>{msg}</b>}</div>
    </div>
  </div>;
}

function CostForm({onDone}:{onDone:()=>void}) {
  const blank={occurred_at:today(),supplier:"",service:"",sub_service:"",tracking:"",net_price:"",fee:"",export_customs:"",import_customs:"",total_net_cost:"",extra_surcharge:"",import_tax:"",note:""};
  const [form,setForm]=useState(blank); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState("");
  const change=(name:string,value:string)=>setForm((x)=>({...x,[name]:value}));
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMsg("");
    try{
      const r=await postJson("/api/costs",form);
      setMsg(r.matched?"Đã lưu và link vào Order.":"Đã lưu; chờ Order cùng Tracking để auto-link.");
      setForm(blank);onDone();
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể lưu"))}
    finally{setBusy(false)}
  }
  return <form className="formCard" onSubmit={submit}>
    <div className="formHead"><div><span className="eyebrow">SUPPLIER COST</span><h3>Nhập chi phí thực tế</h3></div></div>
    <p className="formHint">Tracking là link chính. Cost nhập trước Order cũng được; khi Order xuất hiện hệ thống tự reconcile.</p>
    <div className="formGrid">
      <Field label="Ngày" name="occurred_at" type="date" value={form.occurred_at} onChange={change}/>
      <Field label="Tracking" name="tracking" value={form.tracking} onChange={change} required/>
      <Field label="Supplier" name="supplier" value={form.supplier} onChange={change}/>
      <Field label="Dịch vụ" name="service" value={form.service} onChange={change}/>
      <Field label="Sub-Service" name="sub_service" value={form.sub_service} onChange={change}/>
      <Field label="Net Price" name="net_price" type="number" value={form.net_price} onChange={change}/>
      <Field label="Phụ phí supplier" name="fee" type="number" value={form.fee} onChange={change}/>
      <Field label="HQ Xuất khẩu" name="export_customs" type="number" value={form.export_customs} onChange={change}/>
      <Field label="HQ Nhập khẩu" name="import_customs" type="number" value={form.import_customs} onChange={change}/>
      <Field label="True / Total Net Cost" name="total_net_cost" type="number" value={form.total_net_cost} onChange={change} placeholder="Auto sum nếu trống"/>
      <Field label="Phụ phí bổ sung" name="extra_surcharge" type="number" value={form.extra_surcharge} onChange={change}/>
      <Field label="Thuế NK bổ sung" name="import_tax" type="number" value={form.import_tax} onChange={change}/>
    </div>
    <TextAreaField label="Note" name="note" value={form.note} onChange={change}/>
    <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><button className="primaryBtn" disabled={busy}>{busy?"Đang lưu…":"Lưu Chi phí"}</button></div>
  </form>;
}

function BalanceForm({onDone}:{onDone:()=>void}) {
  const blank={occurred_at:today(),entry_type:"PAYMENT",amount:"",customer:"",reference_type:"MANUAL",reference_id:"",bill_url:"",note:""};
  const [form,setForm]=useState(blank); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState("");
  const change=(name:string,value:string)=>setForm((x)=>({...x,[name]:value}));
  const direction=["PAYMENT","REFUND","ERROR_REFUND","ERROR_PROCESSING","ADJUSTMENT_CREDIT"].includes(form.entry_type)?"CREDIT":"DEBIT";
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMsg("");
    try{
      await postJson("/api/ledger",{...form,direction});
      setMsg("Đã ghi "+(direction==="CREDIT"?"+":"-")+" Balance.");
      setForm(blank);onDone();
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể lưu"))}
    finally{setBusy(false)}
  }
  return <form className="formCard" onSubmit={submit}>
    <div className="formHead"><div><span className="eyebrow">BALANCE LEDGER</span><h3>Nhập giao dịch Balance</h3></div><span className={direction==="CREDIT"?"direction credit":"direction debit"}>{direction==="CREDIT"?"+ CREDIT":"− DEBIT"}</span></div>
    <p className="formHint">Ledger append-only. Order Charge được tạo tự động; form này dùng cho payment/refund/service/error/adjustment.</p>
    <div className="formGrid">
      <Field label="Ngày" name="occurred_at" type="date" value={form.occurred_at} onChange={change}/>
      <SelectField label="Hạng mục" name="entry_type" value={form.entry_type} onChange={change} options={[
        {value:"PAYMENT",label:"Payment (+)"},
        {value:"REFUND",label:"Refund (+)"},
        {value:"SERVICE_COST",label:"Service Cost (-)"},
        {value:"ERROR_PROCESSING",label:"Processing (+)"},
        {value:"ERROR_REFUND",label:"Error Refund (+)"},
        {value:"ERROR_CHARGEABLE",label:"Chargeable (-)"},
        {value:"ADJUSTMENT_CREDIT",label:"Adjustment Credit (+)"},
        {value:"ADJUSTMENT_DEBIT",label:"Adjustment Debit (-)"},
      ]}/>
      <Field label="Số tiền" name="amount" type="number" value={form.amount} onChange={change} required/>
      <Field label="Customer/User" name="customer" value={form.customer} onChange={change} placeholder="Nên có trước production"/>
      <Field label="Reference type" name="reference_type" value={form.reference_type} onChange={change}/>
      <Field label="Reference ID" name="reference_id" value={form.reference_id} onChange={change} placeholder="Tracking / Bill / Ticket ID"/>
      <Field label="Bill URL" name="bill_url" value={form.bill_url} onChange={change} wide/>
    </div>
    <TextAreaField label="Note" name="note" value={form.note} onChange={change}/>
    <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><button className="primaryBtn" disabled={busy}>{busy?"Đang lưu…":"Ghi Balance"}</button></div>
  </form>;
}

function ManualEntry({
  role, currentUser, salesUsers, kind, setKind, onDone, editOrder, onCancelEdit,
}: {
  role:Role;currentUser:User;salesUsers:User[];kind:ManualKind;setKind:(k:ManualKind)=>void;onDone:()=>void;
  editOrder:RowData|null;onCancelEdit:()=>void;
}) {
  useEffect(()=>{ if(editOrder) setKind("order") },[editOrder,setKind]);
  return <div className="entryPanel">
    <div className="entryTabs">
      <button className={kind==="order"?"active":""} onClick={()=>setKind("order")}>+ Order</button>
      {role==="ADMIN"&&<button className={kind==="cost"?"active":""} onClick={()=>setKind("cost")}>+ Chi phí</button>}
      {role==="ADMIN"&&<button className={kind==="balance"?"active":""} onClick={()=>setKind("balance")}>+ Balance</button>}
    </div>
    {kind==="order"&&<OrderForm role={role} currentUser={currentUser} salesUsers={salesUsers} edit={editOrder} onDone={onDone} onCancelEdit={onCancelEdit}/>}
    {kind==="cost"&&<CostForm onDone={onDone}/>}
    {kind==="balance"&&<BalanceForm onDone={onDone}/>}
  </div>;
}

function ImportCard({ kind, title, detail, templateHref, onDone }:{
  kind:"orders"|"sales_orders"|"costs"|"balance"; title:string; detail:string; templateHref:string; onDone:()=>void
}) {
  const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState("");
  async function upload(){
    if(!file)return; setBusy(true); setMsg("");
    const form=new FormData(); form.set("kind",kind); form.set("file",file);
    const res=await fetch("/api/import",{method:"POST",body:form}); const body=await res.json(); setBusy(false);
    if(!res.ok){setMsg("Lỗi: "+body.error);return;}
    const warnings=(body.warnings||[]).join(" · "); setMsg("Đã nhập "+body.imported+" dòng"+(warnings?" · "+warnings:"")); onDone();
  }
  return <div className="importCard">
    <div><span className="eyebrow">{kind.toUpperCase()}</span><h3>{title}</h3><p>{detail}</p></div>
    <label className="file"><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"Chọn file .xlsx"}</span></label>
    <div className="importActions">
      <a className="templateBtn" href={templateHref} download>↓ Download template</a>
      <button disabled={!file||busy} onClick={upload}>{busy?"Đang nhập…":"Import Excel"}</button>
    </div>
    {msg&&<small>{msg}</small>}
  </div>
}

function UserManager({users,onDone,currentUser}:{users:User[];onDone:()=>void;currentUser:User}) {
  const [form,setForm]=useState({display_name:"",username:"",password:"",role:"SALES"});
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [accountSearch,setAccountSearch]=useState("");
  const [accountPage,setAccountPage]=useState(1);
  const filteredUsers=users.filter(u=>{
    const q=accountSearch.trim().toLowerCase();
    return !q || u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });
  const accountPageSize=10;
  const accountTotalPages=Math.max(1,Math.ceil(filteredUsers.length/accountPageSize));
  const visibleUsers=filteredUsers.slice((accountPage-1)*accountPageSize,accountPage*accountPageSize);
  useEffect(()=>{setAccountPage(1)},[accountSearch,users.length]);

  async function create(e:FormEvent){
    e.preventDefault();setBusy(true);setMsg("");
    try{
      await postJson("/api/users",form);
      setForm({display_name:"",username:"",password:"",role:"SALES"});
      setMsg("Đã tạo tài khoản.");
      onDone();
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể tạo tài khoản"))}
    finally{setBusy(false)}
  }

  async function patchUser(id:number,body:Record<string,unknown>){
    const res=await fetch("/api/users/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await res.json();
    if(!res.ok){setMsg("Lỗi: "+data.error);return;}
    setMsg("Đã cập nhật tài khoản.");onDone();
  }

  return <div className="accountPanel">
    <form className="formCard" onSubmit={create}>
      <div className="formHead"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h3>Tạo tài khoản Sales / Admin</h3></div></div>
      <p className="formHint">Admin tạo tài khoản, khóa/mở lại và reset password. Sales chỉ nhìn dữ liệu Order của chính mình.</p>
      <div className="formGrid">
        <Field label="Tên hiển thị" name="display_name" value={form.display_name} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
        <Field label="Username" name="username" value={form.username} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
        <Field label="Mật khẩu ban đầu" name="password" type="password" value={form.password} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
        <SelectField label="Role" name="role" value={form.role} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} options={[{value:"SALES",label:"Sales"},{value:"ADMIN",label:"Admin"}]}/>
      </div>
      <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><button className="primaryBtn" disabled={busy}>{busy?"Đang tạo…":"Tạo tài khoản"}</button></div>
    </form>
    <div className="dataToolbar accountsToolbar"><SearchBar value={accountSearch} onChange={setAccountSearch} placeholder="Tìm tên, username, role..."/><span>{filteredUsers.length} accounts</span></div>
    <div className="tableWrap accountTable"><table><thead><tr><th>Tên</th><th>Username</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visibleUsers.map(u=><tr key={u.id}><td>{u.display_name}</td><td>@{u.username}</td><td>{u.role}</td><td><span className={u.active?"status goodStatus":"status badStatus"}>{u.active?"Active":"Locked"}</span></td><td>
        <button className="editBtn" disabled={u.id===currentUser.id} onClick={()=>void patchUser(u.id,{active:!u.active})}>{u.active?"Khóa":"Mở"}</button>
        <button className="editBtn" onClick={()=>{const pw=window.prompt("Mật khẩu mới (ít nhất 8 ký tự)");if(pw)void patchUser(u.id,{password:pw})}}>Reset PW</button>
      </td></tr>)}
    </tbody></table></div>
    <Pager data={{items:[],total:filteredUsers.length,page:accountPage,pageSize:accountPageSize,totalPages:accountTotalPages}} onPage={setAccountPage}/>
  </div>;
}

function Pager({data,onPage}:{data:PagedRows;onPage:(page:number)=>void}) {
  const from=data.total===0?0:(data.page-1)*data.pageSize+1;
  const to=Math.min(data.page*data.pageSize,data.total);
  return <div className="pager">
    <span>{from}-{to} / {data.total}</span>
    <div>
      <button disabled={data.page<=1} onClick={()=>onPage(data.page-1)}>← Trước</button>
      <b>{data.page} / {data.totalPages}</b>
      <button disabled={data.page>=data.totalPages} onClick={()=>onPage(data.page+1)}>Sau →</button>
    </div>
  </div>;
}

function SearchBar({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}) {
  return <div className="searchBox"><span>⌕</span><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{value&&<button onClick={()=>onChange("")}>×</button>}</div>;
}

function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}) {
  return <div className="modalBackdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}>
    <div className="modalPanel">
      <div className="modalHeader"><div><span className="eyebrow">DATA ENTRY</span><h2>{title}</h2></div><button className="iconBtn" onClick={onClose}>×</button></div>
      <div className="modalBody">{children}</div>
    </div>
  </div>;
}

function PageHeader({eyebrow,title,description,actions}:{eyebrow:string;title:string;description:string;actions?:React.ReactNode}) {
  return <div className="pageHeader">
    <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    {actions&&<div className="pageActions">{actions}</div>}
  </div>;
}

function Platform({user,onLogout}:{user:User;onLogout:()=>void}) {
  const role=user.role;
  const [summary,setSummary]=useState<Summary|null>(null);
  const [users,setUsers]=useState<User[]>([]);
  const [section,setSection]=useState<AppSection>("dashboard");
  const [data,setData]=useState<PagedRows>({items:[],total:0,page:1,pageSize:20,totalPages:1});
  const [recent,setRecent]=useState<RowData[]>([]);
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [loading,setLoading]=useState(false);
  const [entry,setEntry]=useState<ManualKind|null>(null);
  const [editOrder,setEditOrder]=useState<RowData|null>(null);
  const [orderEntryMode,setOrderEntryMode]=useState<"sheet"|"form">("sheet");
  const [orderFilters,setOrderFilters]=useState({status:"",service:"",salesUserId:"",reconcile:""});

  const salesUsers=users.filter(u=>u.role==="SALES"&&u.active!==0);

  useEffect(()=>{
    const id=setTimeout(()=>setDebouncedSearch(search),300);
    return ()=>clearTimeout(id);
  },[search]);

  useEffect(()=>{setPage(1)},[section,debouncedSearch]);
  useEffect(()=>{setPage(1)},[orderFilters.status,orderFilters.service,orderFilters.salesUserId,orderFilters.reconcile]);

  const loadSummary=useCallback(async()=>{
    const res=await fetch("/api/summary");
    if(res.status===401){onLogout();return;}
    setSummary(await res.json());
  },[onLogout]);

  const loadUsers=useCallback(async()=>{
    if(role!=="ADMIN"){setUsers([]);return;}
    const res=await fetch("/api/users");
    if(res.status===401){onLogout();return;}
    setUsers(await res.json());
  },[role,onLogout]);

  const endpointFor=(target:AppSection)=>{
    if(target==="orders")return "/api/orders";
    if(target==="costs")return "/api/costs";
    if(target==="recon")return "/api/reconciliation";
    if(target==="ledger")return "/api/ledger";
    return "";
  };

  const loadSection=useCallback(async(target:AppSection,currentPage=page,q=debouncedSearch)=>{
    const endpoint=endpointFor(target);
    if(!endpoint)return;
    setLoading(true);
    try{
      const params=new URLSearchParams({page:String(currentPage),pageSize:"20",q});
      if(target==="orders"){
        if(orderFilters.status)params.set("status",orderFilters.status);
        if(orderFilters.service)params.set("service",orderFilters.service);
        if(orderFilters.salesUserId)params.set("salesUserId",orderFilters.salesUserId);
        if(orderFilters.reconcile)params.set("reconcile",orderFilters.reconcile);
      }
      const res=await fetch(endpoint+"?"+params.toString());
      if(res.status===401){onLogout();return;}
      if(!res.ok)return;
      setData(await res.json());
    } finally {setLoading(false)}
  },[page,debouncedSearch,onLogout,orderFilters]);

  const loadRecent=useCallback(async()=>{
    const res=await fetch("/api/orders?page=1&pageSize=10");
    if(res.ok){const body=await res.json();setRecent(body.items||[])}
  },[]);

  useEffect(()=>{void loadSummary();void loadUsers();void loadRecent()},[loadSummary,loadUsers,loadRecent]);
  useEffect(()=>{if(["orders","costs","recon","ledger"].includes(section))void loadSection(section,page,debouncedSearch)},[section,page,debouncedSearch,loadSection]);

  const refresh=useCallback(async()=>{
    await Promise.all([loadSummary(),loadUsers(),loadRecent()]);
    if(["orders","costs","recon","ledger"].includes(section))await loadSection(section,page,debouncedSearch);
  },[loadSummary,loadUsers,loadRecent,loadSection,section,page,debouncedSearch]);

  function navigate(next:AppSection){
    setSection(next);setSearch("");setPage(1);
  }
  function openEntry(kind:ManualKind,row?:RowData){
    setEditOrder(row||null);
    if(kind==="order")setOrderEntryMode(row?"form":"sheet");
    setEntry(kind);
  }
  function closeEntry(){setEntry(null);setEditOrder(null);setOrderEntryMode("sheet")}
  async function entryDone(){closeEntry();await refresh()}
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});onLogout()}

  const orderCols=role==="ADMIN"
    ?["workflow_status","created_at","sales","customer","service","tracking","order_id","true_net_cost","sales_price","total_due","margin_status","reconciliation_status"]
    :["workflow_status","created_at","customer","service","sub_service","order_id","total_due"];

  const nav:Array<{key:AppSection;label:string;icon:string;admin?:boolean}>=[
    {key:"dashboard",label:"Tổng quan",icon:"⌂"},
    {key:"orders",label:"Orders",icon:"▤"},
    {key:"imports",label:"Import dữ liệu",icon:"⇩"},
    {key:"costs",label:"Supplier Costs",icon:"$ ",admin:true},
    {key:"recon",label:"Reconciliation",icon:"✓",admin:true},
    {key:"ledger",label:"Balance Ledger",icon:"≋",admin:true},
    {key:"accounts",label:"Tài khoản",icon:"♙",admin:true},
  ];

  const titleMap:Record<AppSection,string>={
    dashboard:"Tổng quan",orders:"Orders",imports:"Import dữ liệu",costs:"Supplier Costs",
    recon:"Reconciliation",ledger:"Balance Ledger",accounts:"Tài khoản",
  };

  return <div className="appShell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">D</div><div><b>DMD Finance</b><span>Operations</span></div></div>
      <nav className="sideNav">
        {nav.filter(n=>!n.admin||role==="ADMIN").map(n=><button key={n.key} className={section===n.key?"active":""} onClick={()=>navigate(n.key)}>
          <i>{n.icon}</i><span>{n.label}</span>
          {n.key==="recon"&&Number(summary?.review||0)>0&&<em>{summary?.review}</em>}
        </button>)}
      </nav>
      <div className="sideFooter">
        <div className="avatar">{user.display_name.slice(0,1).toUpperCase()}</div>
        <div className="sideUser"><b>{user.display_name}</b><span>{user.role} · @{user.username}</span></div>
        <button className="logoutBtn" onClick={()=>void logout()} title="Đăng xuất">↪</button>
      </div>
    </aside>

    <div className="appMain">
      <div className="topbar">
        <button className="mobileBrand" onClick={()=>navigate("dashboard")}>DMD</button>
        <div className="crumb"><span>Finance Ops</span><i>/</i><b>{titleMap[section]}</b></div>
        <div className="topUser">
          <span className="topRole">{role}</span>
          <b>{user.display_name}</b>
        </div>
      </div>

      <div className="pageContent">
        {section==="dashboard"&&<>
          <PageHeader eyebrow="OVERVIEW" title={"Chào, "+user.display_name} description="Theo dõi nhanh Orders, doanh thu và các mục cần xử lý."/>
          <section className={role==="ADMIN"?"metricGrid":"metricGrid salesMetricGrid"}>
            <div className="metricCard"><span>Orders</span><b>{summary?.orders??0}</b><small>Tổng order hiện có</small></div>
            <div className="metricCard"><span>Total due</span><b>{money(summary?.receivable)}</b><small>Tổng cần thu</small></div>
            {role==="ADMIN"&&<>
              <div className="metricCard"><span>Ledger balance</span><b>{money(summary?.ledger)}</b><small>Credit − Debit</small></div>
              <div className={Number(summary?.review||0)>0?"metricCard alert":"metricCard"}><span>Need review</span><b>{summary?.review??0}</b><small>Reconciliation cần kiểm tra</small></div>
              <div className="metricCard"><span>Unmatched cost</span><b>{summary?.unmatched??0}</b><small>Cost chưa match Tracking</small></div>
            </>}
          </section>

          <section className="dashboardGrid">
            <div className="panel">
              <div className="panelHead"><div><h3>Order gần đây</h3><p>10 order mới nhất</p></div><button className="textBtn" onClick={()=>navigate("orders")}>Xem tất cả →</button></div>
              <Table rows={recent} cols={role==="ADMIN"?["created_at","order_id","customer","sales","service","total_due","workflow_status"]:["created_at","order_id","customer","service","total_due","workflow_status"]} compact onEdit={row=>openEntry("order",row)}/>
            </div>
            <div className="quickPanel">
              <h3>Thao tác nhanh</h3>
              <button onClick={()=>openEntry("order")}><i>＋</i><div><b>Tạo Order</b><span>Nhập một order mới</span></div></button>
              <button onClick={()=>navigate("imports")}><i>⇩</i><div><b>Import Excel</b><span>Nhập dữ liệu hàng loạt</span></div></button>
              {role==="ADMIN"&&<button onClick={()=>openEntry("cost")}><i>$</i><div><b>Nhập Supplier Cost</b><span>Reconcile theo Tracking</span></div></button>}
              {role==="ADMIN"&&<button onClick={()=>openEntry("balance")}><i>≋</i><div><b>Ghi Balance</b><span>Payment / Refund / Adjustment</span></div></button>}
            </div>
          </section>
        </>}

        {section==="orders"&&<>
          <PageHeader eyebrow="OPERATIONS" title="Orders" description={role==="ADMIN"?"Quản lý toàn bộ đơn hàng và trạng thái xử lý.":"Quản lý các order thuộc tài khoản của bạn."}
            actions={<><button className="secondaryBtn" onClick={()=>navigate("imports")}>⇩ Import</button><button className="primaryBtn" onClick={()=>openEntry("order")}>＋ Tạo Order</button></>}/>
          <div className="panel dataPanel">
            <div className="dataToolbar orderToolbar">
              <SearchBar value={search} onChange={setSearch} placeholder="Tìm Order ID, Tracking, khách hàng, dịch vụ..."/>
              <div className="orderFilters">
                <select value={orderFilters.status} onChange={e=>setOrderFilters(x=>({...x,status:e.target.value}))}><option value="">Mọi trạng thái</option><option value="SALES_DRAFT">Sales draft</option><option value="TRACKING_ASSIGNED">Tracking assigned</option><option value="ADMIN_READY">Admin ready</option><option value="RECONCILED">Reconciled</option></select>
                <select value={orderFilters.service} onChange={e=>setOrderFilters(x=>({...x,service:e.target.value}))}><option value="">Mọi dịch vụ</option><option value="ePacket">ePacket</option><option value="UPS">UPS</option><option value="Yun Express">Yun Express</option><option value="Chuyên tuyến">Chuyên tuyến</option></select>
                {role==="ADMIN"&&<select value={orderFilters.salesUserId} onChange={e=>setOrderFilters(x=>({...x,salesUserId:e.target.value}))}><option value="">Mọi Sales</option>{salesUsers.map(u=><option key={u.id} value={u.id}>{u.display_name}</option>)}</select>}
                {role==="ADMIN"&&<select value={orderFilters.reconcile} onChange={e=>setOrderFilters(x=>({...x,reconcile:e.target.value}))}><option value="">Mọi reconcile</option><option value="PASS">PASS</option><option value="REVIEW">REVIEW</option></select>}
                {(orderFilters.status||orderFilters.service||orderFilters.salesUserId||orderFilters.reconcile)&&<button className="clearFilters" onClick={()=>setOrderFilters({status:"",service:"",salesUserId:"",reconcile:""})}>Xóa lọc</button>}
              </div>
              <span>{data.total} records</span>
            </div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={orderCols} onEdit={row=>openEntry("order",row)}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {section==="imports"&&<>
          <PageHeader eyebrow="BULK DATA" title="Import dữ liệu" description="Tải template chuẩn, điền dữ liệu rồi import. Hệ thống vẫn dùng cùng business logic với nhập thủ công."/>
          {role==="ADMIN"
            ? <div className="imports">
                <ImportCard kind="orders" title="Orders Admin" detail="Order với đầy đủ field vận hành và finance." templateHref="/templates/dmd-admin-orders.xlsx" onDone={refresh}/>
                <ImportCard kind="costs" title="Supplier Costs" detail="True cost, surcharge và import tax theo Tracking." templateHref="/templates/dmd-supplier-costs.xlsx" onDone={refresh}/>
                <ImportCard kind="balance" title="Balance" detail="Payment, service cost và error adjustments." templateHref="/templates/dmd-balance.xlsx" onDone={refresh}/>
              </div>
            : <div className="imports salesImports"><ImportCard kind="sales_orders" title="Orders Sales" detail="Chỉ import order của account đang đăng nhập; không nhận field finance Admin." templateHref="/templates/dmd-sales-orders.xlsx" onDone={refresh}/></div>}
        </>}

        {role==="ADMIN"&&section==="costs"&&<>
          <PageHeader eyebrow="FINANCE" title="Supplier Costs" description="Theo dõi chi phí thực tế và trạng thái link với Orders."
            actions={<><button className="secondaryBtn" onClick={()=>navigate("imports")}>⇩ Import</button><button className="primaryBtn" onClick={()=>openEntry("cost")}>＋ Nhập Cost</button></>}/>
          <div className="panel dataPanel">
            <div className="dataToolbar"><SearchBar value={search} onChange={setSearch} placeholder="Tìm Tracking, supplier, service, Order ID..."/><span>{data.total} records</span></div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={["occurred_at","tracking","matched","order_id","customer","supplier","service","total_net_cost","reconciliation_status"]}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {role==="ADMIN"&&section==="recon"&&<>
          <PageHeader eyebrow="FINANCE CONTROL" title="Reconciliation" description="So sánh Estimated Net và True Net Cost, ưu tiên các order REVIEW."/>
          <div className="panel dataPanel">
            <div className="dataToolbar"><SearchBar value={search} onChange={setSearch} placeholder="Tìm Tracking, Order ID, khách, supplier, status..."/><span>{data.total} records</span></div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={["reconciliation_status","tracking","order_id","customer","supplier","service","est_net_cost","true_net_cost","reconciliation_delta","gross_margin_pct","margin_status","total_due"]}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {role==="ADMIN"&&section==="ledger"&&<>
          <PageHeader eyebrow="FINANCE" title="Balance Ledger" description="Dòng tiền Credit / Debit và các order charge tự động."
            actions={<button className="primaryBtn" onClick={()=>openEntry("balance")}>＋ Ghi Balance</button>}/>
          <div className="panel dataPanel">
            <div className="dataToolbar"><SearchBar value={search} onChange={setSearch} placeholder="Tìm loại giao dịch, khách, reference, note..."/><span>{data.total} records</span></div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={["occurred_at","entry_type","direction","amount","customer","reference_type","reference_id","note"]}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {role==="ADMIN"&&section==="accounts"&&<>
          <PageHeader eyebrow="ACCESS CONTROL" title="Tài khoản" description="Tạo và quản lý quyền truy cập cho Admin / Sales."/>
          <div className="panel"><UserManager users={users} onDone={refresh} currentUser={user}/></div>
        </>}
      </div>
    </div>

    {entry&&<Modal title={editOrder?"Chỉnh sửa Order":entry==="order"?(orderEntryMode==="sheet"?"Tạo Orders nhanh":"Tạo Order chi tiết"):entry==="cost"?"Nhập Supplier Cost":"Ghi Balance"} onClose={closeEntry}>
      {entry==="order"&&!editOrder&&orderEntryMode==="sheet"&&<QuickOrderSheet role={role} salesUsers={salesUsers} onDone={entryDone} onAdvanced={()=>setOrderEntryMode("form")}/>}
      {entry==="order"&&(editOrder||orderEntryMode==="form")&&<OrderForm role={role} currentUser={user} salesUsers={salesUsers} edit={editOrder} onDone={entryDone} onCancelEdit={closeEntry}/>}
      {entry==="cost"&&role==="ADMIN"&&<CostForm onDone={entryDone}/>}
      {entry==="balance"&&role==="ADMIN"&&<BalanceForm onDone={entryDone}/>}
    </Modal>}
  </div>;
}

function AuthScreen({setup,onSuccess}:{setup:boolean;onSuccess:()=>void}){
  const [form,setForm]=useState({display_name:"",username:"",password:""});
  const [msg,setMsg]=useState("");const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setMsg("");
    try{
      const res=await fetch(setup?"/api/auth/setup":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"Không đăng nhập được");
      onSuccess();
    }catch(error){setMsg(error instanceof Error?error.message:"Không đăng nhập được")}
    finally{setBusy(false)}
  }
  return <main className="authPage"><form className="authCard" onSubmit={submit}><span className="eyebrow">DMD · FINANCE OPS</span><h1>{setup?"Tạo Admin đầu tiên":"Đăng nhập"}</h1><p>{setup?"Khởi tạo tài khoản quản trị. Sau đó Admin sẽ tạo tài khoản cho Sales.":"Dùng tài khoản Admin hoặc Sales được cấp."}</p>
    {setup&&<Field label="Tên hiển thị" name="display_name" value={form.display_name} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>}
    <Field label="Username" name="username" value={form.username} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
    <Field label="Password" name="password" type="password" value={form.password} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
    {msg&&<div className="authError">{msg}</div>}<button className="primaryBtn" disabled={busy}>{busy?"Đang xử lý…":setup?"Khởi tạo Admin":"Đăng nhập"}</button>
  </form></main>;
}

export default function Home(){
  const [status,setStatus]=useState<{setup_required:boolean;user:User|null}|null>(null);
  const refresh=useCallback(async()=>{const res=await fetch("/api/auth/status");setStatus(await res.json())},[]);
  const clearUser=useCallback(()=>setStatus(prev=>prev?{...prev,user:null}:prev),[]);
  useEffect(()=>{void refresh()},[refresh]);
  if(!status)return <main className="authPage"><div className="authCard"><p>Đang tải…</p></div></main>;
  if(status.setup_required||!status.user)return <AuthScreen setup={status.setup_required} onSuccess={refresh}/>;
  return <Platform user={status.user} onLogout={clearUser}/>;
}

function Table({rows,cols,onEdit,compact=false}:{rows:RowData[];cols:string[];onEdit?:(row:RowData)=>void;compact?:boolean}){
  const label=(c:string)=>({
    workflow_status:"Trạng thái",created_at:"Ngày",sales:"Sales",customer:"Khách",supplier:"Supplier",service:"Dịch vụ",
    sub_service:"Sub-service",tracking:"Tracking",order_id:"Order ID",est_net_cost:"Est. Net",true_net_cost:"True Net",
    base_cost:"Base",retail:"Retail",sales_price:"Sales Price",surcharge:"Phụ phí",import_tax:"Thuế NK",
    total_due:"Total Due",gross_margin_pct:"Margin %",margin_status:"Margin",reconciliation_status:"Reconcile",
    reconciliation_delta:"Delta",occurred_at:"Ngày",entry_type:"Loại",direction:"Chiều",amount:"Số tiền",
    reference_type:"Ref type",reference_id:"Reference",total_net_cost:"Total Net",matched:"Link",
  } as Record<string,string>)[c]||c.replaceAll("_"," ");

  const statusClass=(v:unknown)=>{
    const x=String(v||"");
    if(["REVIEW","LOW_MARGIN","Waiting","DEBIT"].includes(x))return "status badStatus";
    if(["PASS","OK","Linked","CREDIT","RECONCILED","ADMIN_READY"].includes(x))return "status goodStatus";
    if(["SALES_DRAFT","TRACKING_ASSIGNED","PENDING"].includes(x))return "status neutralStatus";
    return "";
  };

  return <div className={compact?"tableWrap compactTable":"tableWrap"}><table><thead><tr>{onEdit&&<th></th>}{cols.map(c=><th key={c}>{label(c)}</th>)}</tr></thead><tbody>
    {rows.length===0?<tr><td colSpan={cols.length+(onEdit?1:0)} className="empty">Chưa có dữ liệu.</td></tr>
    :rows.map((r,i)=><tr key={String(r.id||r.tracking||r.order_id||i)}>
      {onEdit&&<td className="actionCell"><button className="rowAction" onClick={()=>onEdit(r)}>Sửa</button></td>}
      {cols.map(c=>{
        const v=r[c];
        const isMoney=["amount","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","extra_surcharge","extra_import_tax","total_due","reconciliation_delta","total_net_cost"].includes(c);
        const isStatus=["workflow_status","margin_status","reconciliation_status","direction","matched"].includes(c);
        const display=c==="matched"?(Number(v)?"Linked":"Waiting"):isMoney?money(v):String(v??"—");
        return <td key={c}>{isStatus?<span className={statusClass(display)}>{display}</span>:display}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}
