"use client";
import { normalizeCountry } from "@/lib/epacket-pricing";
import { OperationsWorkspace } from "./operations-workspace";
import { FinancialWorkspace } from "./financial-workspace";
import { ClientPurchasePanel } from "./client-purchase-panel";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { BulkTrackingSheet,OrderDetailPanel,ShipmentStatusPanel,TrackingReplacementSheet } from "./order-workspaces";
import { ManifestScanPanel } from "./manifest-workspace";
import { ServiceConfigurationPanel } from "./service-workspace";
import { TRACKING_REPLACEMENT_REASONS } from "@/lib/order-rules";

type Role = "ADMIN" | "SALES" | "CLIENT" | "WAREHOUSE";
type User = { id:number; username:string; display_name:string; role:Role; sales_user_id?:number|null; sales_display_name?:string|null; active?:number; is_root_admin?:number };
type RowData = Record<string, string | number | null>;
type PagedRows = { items:RowData[]; total:number; page:number; pageSize:number; totalPages:number };
type AppSection = "dashboard"|"orders"|"manifest"|"shipping"|"costs"|"recon"|"ledger"|"accounts"|"masterdata"|"operations";
type Summary = { orders:number; review:number; unmatched:number; ledger:number; receivable:number };
type ManualKind = "order" | "cost" | "balance";
type ImportKind = "orders"|"sales_orders"|"costs"|"tracking_updates"|"balance";
type EnumType = "SERVICE"|"SUB_SERVICE"|"SUPPLIER"|"COUNTRY";
type EnumRow = {
  id:number; enum_type:EnumType; value:string; parent_value:string; active:number;
  sort_order:number; created_at?:string; updated_at?:string;
};

const ENUM_LABELS:Record<EnumType,string>={
  SERVICE:"Dịch vụ",SUB_SERVICE:"Sub-Service",SUPPLIER:"Supplier",COUNTRY:"Nước",
};

function enumOptions(rows:EnumRow[],type:EnumType,parent=""){
  return rows
    .filter(row=>row.enum_type===type&&row.active!==0&&(type!=="SUB_SERVICE"||!parent||row.parent_value.toLowerCase()===parent.toLowerCase()))
    .sort((a,b)=>a.sort_order-b.sort_order||a.value.localeCompare(b.value))
    .map(row=>({value:row.value,label:row.value}));
}

function enumIsValid(rows:EnumRow[],type:EnumType,value:string,parent=""){
  if(!value.trim())return true;
  if(type==="COUNTRY")value=normalizeCountry(value);
  return rows.some(row=>
    row.enum_type===type&&row.active!==0&&row.value.toLowerCase()===value.trim().toLowerCase()&&
    (type!=="SUB_SERVICE"||row.parent_value.toLowerCase()===parent.trim().toLowerCase())
  );
}

const money = (v: unknown) => new Intl.NumberFormat("en-US", {
  style:"currency", currency:"USD", maximumFractionDigits:2,
}).format(Number(v || 0));

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
};

function displayDate(value: unknown) {
  const raw=String(value??"").trim();
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso)return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function isValidDateText(value: string) {
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(value))return false;
  const [day,month,year]=value.split("/").map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}

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

function SmartSelect({
  value,onChange,options,placeholder="Chọn hoặc nhập",compact=false,allowCustom=true,dataCell,onKeyDown,onPaste,invalid=false,
}:{
  value:string;onChange:(value:string)=>void;options:Array<{value:string;label:string}>;
  placeholder?:string;compact?:boolean;allowCustom?:boolean;dataCell?:string;invalid?:boolean;
  onKeyDown?:(e:React.KeyboardEvent<HTMLInputElement>)=>void;
  onPaste?:(e:React.ClipboardEvent<HTMLInputElement>)=>void;
}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const selected=options.find(o=>o.value===value);
  const selectedLabel=selected?.label??value;
  const [query,setQuery]=useState(selectedLabel);
  useEffect(()=>{setQuery(selectedLabel)},[value,selectedLabel]);
  useEffect(()=>{
    function close(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener("mousedown",close);
    return()=>document.removeEventListener("mousedown",close);
  },[]);
  const normalized=query.trim().toLowerCase();
  const selectedNormalized=selectedLabel.trim().toLowerCase();
  // Fixed-choice selects should show the full option list when first opened.
  // Only filter after the user changes the visible query from the selected label.
  const filterQuery=!allowCustom&&normalized===selectedNormalized?"":normalized;
  const filtered=options.filter(o=>!filterQuery||o.label.toLowerCase().includes(filterQuery)||o.value.toLowerCase().includes(filterQuery));
  function commitTyped(){
    const exact=options.find(o=>o.label.toLowerCase()===normalized||o.value.toLowerCase()===normalized);
    if(exact){onChange(exact.value);setQuery(exact.label);return}
    if(allowCustom)onChange(query.trim());
    else setQuery(selected?.label??"");
  }
  return <div className={`${compact?"smartSelect compact":"smartSelect"}${invalid?" invalid":""}`} ref={ref}>
    <div className={open?"smartSelectTrigger open":"smartSelectTrigger"}>
      <input
        data-sheet-cell={dataCell}
        className="smartSelectInput"
        value={query}
        placeholder={placeholder}
        onFocus={()=>setOpen(true)}
        onChange={e=>{setQuery(e.target.value);if(allowCustom)onChange(e.target.value);setOpen(true)}}
        onBlur={()=>setTimeout(commitTyped,0)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <button type="button" tabIndex={-1} className="smartSelectToggle" onMouseDown={e=>e.preventDefault()} onClick={()=>setOpen(x=>!x)}>⌄</button>
    </div>
    {open&&<div className="smartSelectMenu">
      {filtered.length?filtered.map(o=><button type="button" key={o.value} className={o.value===value?"selected":""} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(o.value);setQuery(o.label);setOpen(false)}}>
        <span>{o.label}</span>{o.value===value&&<b>✓</b>}
      </button>):<div className="smartSelectEmpty">Dùng “{query.trim()}”</div>}
    </div>}
  </div>;
}

function SelectField({
  label, name, value, onChange, options, wide=false, allowCustom=true, requireOption=false,
}: {
  label:string; name:string; value:string; onChange:(name:string,value:string)=>void;
  options:Array<{value:string;label:string}>; wide?:boolean; allowCustom?:boolean; requireOption?:boolean;
}) {
  const valid=!requireOption||!value.trim()||options.some(o=>
    o.value.toLowerCase()===value.trim().toLowerCase()||o.label.toLowerCase()===value.trim().toLowerCase()
  );
  return <label className={wide ? "field wide" : "field"}>
    <span>{label}</span>
    <SmartSelect value={value} onChange={v=>onChange(name,v)} options={options} allowCustom={allowCustom} invalid={!valid}/>
    {!valid&&<small className="fieldError">Giá trị không nằm trong danh sách hợp lệ.</small>}
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

type SheetRow = Record<string,string>;
type SheetColumn = { key:string; label:string; width?:number; type?:"text"|"number"|"dateText"|"combo"; options?:Array<{value:string;label:string}> };

function QuickOrderSheet({role,clients,enums,onDone,edit}:{role:Role;clients:User[];enums:EnumRow[];onDone:()=>void;edit?:RowData|null}) {
  const blankRow=():SheetRow=>({
    client_user_id:"",customer:"",order_id:"",route_id:"",supplier:"",service:"",sub_service:"",item:"",material:"",
    carton_count:"",weight:"",length:"",width:"",height:"",manual_volume:"",declared_value:"",recipient_name:"",address1:"",address2:"",phone:"",recipient_email:"",city:"",state:"",
    zip:"",country:"",note:"",internal_note:"",discount:"",discount_note:"",est_net_cost:"",base_cost:"",retail:"",sales_price:"",surcharge:"",import_tax:"", 
  });
  const editRow=():SheetRow=>{
    const row=blankRow();
    if(!edit)return row;
    Object.keys(row).forEach(key=>{
      const value=edit[key];
      row[key]=value===null||value===undefined?"":key==="created_at"?displayDate(value):String(value);
    });
    if(!row.client_user_id&&row.customer){
      const match=clients.find(client=>client.display_name.toLowerCase()===row.customer.toLowerCase()||client.username.toLowerCase()===row.customer.toLowerCase());
      if(match)row.client_user_id=String(match.id);
    }
    row.id=String(edit.id||"");
    return row;
  };
  const [rows,setRows]=useState<SheetRow[]>(()=>edit?[editRow()]:Array.from({length:8},blankRow));
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [errors,setErrors]=useState<Record<number,string>>({});
  const [clientRoutes,setClientRoutes]=useState<Record<string,string[]>>({});
  const selectedClientKeys=rows.map(r=>r.client_user_id).join(",");
  useEffect(()=>{const ids=[...new Set(selectedClientKeys.split(",").filter(Boolean))];for(const id of ids){void fetch(`/api/order-routes?clientId=${id}`).then(r=>r.json()).then(d=>{if(Array.isArray(d))setClientRoutes(prev=>({...prev,[id]:d.map(x=>String(x.id))}))})}},[selectedClientKeys]);
  const [configuredRoutes,setConfiguredRoutes]=useState<RowData[]>([]);
  useEffect(()=>{void fetch("/api/order-routes").then(r=>r.json()).then(d=>{if(Array.isArray(d))setConfiguredRoutes(d)})},[]);
  const [columnWidths,setColumnWidths]=useState<Record<string,number>>({});
  useEffect(()=>{
    try{
      const saved=window.localStorage.getItem("dmd.orderSheetWidths");
      if(saved)setColumnWidths(JSON.parse(saved));
    }catch{}
  },[]);
  useEffect(()=>{
    try{window.localStorage.setItem("dmd.orderSheetWidths",JSON.stringify(columnWidths))}catch{}
  },[columnWidths]);
  const routeOptions=configuredRoutes.map(r=>({value:String(r.id),label:`${r.service} - ${r.sub_service}`}));
  const countryOptions=enumOptions(enums,"COUNTRY");
  const clientOptions=clients
    .filter(client=>client.active!==0||String(edit?.client_user_id||"")===String(client.id))
    .map(client=>({value:String(client.id),label:client.display_name+" (@"+client.username+")"}));

  const common:SheetColumn[]=[
    {key:"client_user_id",label:"Client *",width:185,type:"combo",options:clientOptions},
    {key:"order_id",label:"Client Order ID *",width:145},{key:"route_id",label:"Dịch vụ *",width:220,type:"combo",options:routeOptions},{key:"item",label:"Tên sản phẩm *",width:145},{key:"material",label:"Chất liệu *",width:120},
    {key:"carton_count",label:"Số carton *",width:82,type:"number"},{key:"weight",label:"Tổng kg *",width:78,type:"number"},
    {key:"length",label:"Dài cm",width:76,type:"number"},{key:"width",label:"Rộng cm",width:76,type:"number"},
    {key:"height",label:"Cao cm",width:76,type:"number"},{key:"manual_volume",label:"Thể tích cm³",width:105,type:"number"},{key:"declared_value",label:"Giá trị SX USD",width:105,type:"number"},
    {key:"discount",label:"Discount %",width:88,type:"number"},{key:"discount_note",label:"Lý do discount",width:165},
    {key:"recipient_name",label:"Người nhận",width:145},{key:"phone",label:"Điện thoại",width:125},{key:"recipient_email",label:"Email người nhận",width:170},
    {key:"address1",label:"Địa chỉ 1",width:200},{key:"address2",label:"Địa chỉ 2",width:180},{key:"city",label:"Thành phố",width:115},{key:"state",label:"Bang",width:90},{key:"zip",label:"ZIP",width:90},
    {key:"country",label:"Nước",width:100,type:"combo",options:countryOptions},
    {key:"internal_note",label:"Note Private",width:190},
  ];
  const columns:SheetColumn[]=role==="ADMIN"?[
    ...common,
    {key:"est_net_cost",label:"Net Cost Est",width:95,type:"number"},
    {key:"base_cost",label:"Base Cost",width:90,type:"number"},{key:"retail",label:"Retail Price",width:95,type:"number"},{key:"sales_price",label:"Giá bán",width:95,type:"number"},
    {key:"surcharge",label:"Phụ phí",width:90,type:"number"},{key:"import_tax",label:"Thuế NK",width:90,type:"number"},
  ]:common;

  const dirty=(row:SheetRow)=>Object.entries(row).some(([key,v])=>key!=="created_at"&&String(v||"").trim()!=="");
  const activeRows=rows.map((row,index)=>({row,index})).filter(x=>dirty(x.row));

  function updateCell(rowIndex:number,key:string,value:string){
    setRows(prev=>prev.map((r,i)=>{if(i!==rowIndex)return r;const route=key==="route_id"?configuredRoutes.find(x=>String(x.id)===value):undefined;return {...r,[key]:value,...(route?{service:String(route.service),sub_service:String(route.sub_service),supplier:String(route.supplier||"")}:{})}}));
    setErrors(prev=>{const next={...prev};delete next[rowIndex];return next});
  }
  function addRows(count=5){setRows(prev=>[...prev,...Array.from({length:count},blankRow)])}
  function cloneRow(index:number){
    setRows(prev=>{
      const next=[...prev];
      next.splice(index+1,0,{...prev[index]});
      return next;
    });
    setErrors({});
  }
  function removeRow(index:number){setRows(prev=>prev.length<=1?[blankRow()]:prev.filter((_,i)=>i!==index));setErrors({})}
  function focusCell(row:number,col:number){requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-sheet-cell="${row}-${col}"]`)?.focus())}
  function handleKey(e:React.KeyboardEvent<HTMLInputElement>,row:number,col:number){
    if(e.key==="Enter"){
      e.preventDefault();
      const nextRow=e.shiftKey?Math.max(0,row-1):row+1;
      if(!e.shiftKey&&row===rows.length-1)addRows(1);
      focusCell(nextRow,col);
    }
  }
  function autoFitColumn(key:string,label:string,baseWidth:number){
    const longest=Math.max(label.length,...rows.map(row=>String(row[key]||"").length));
    const next=Math.max(58,Math.min(320,Math.max(baseWidth,longest*7+24)));
    setColumnWidths(prev=>({...prev,[key]:next}));
  }
  function startResize(e:React.MouseEvent,key:string,currentWidth:number){
    e.preventDefault();
    e.stopPropagation();
    const startX=e.clientX;
    const startWidth=columnWidths[key]||currentWidth;
    function move(ev:MouseEvent){
      const next=Math.max(58,Math.min(420,startWidth+(ev.clientX-startX)));
      setColumnWidths(prev=>({...prev,[key]:next}));
    }
    function up(){
      document.removeEventListener("mousemove",move);
      document.removeEventListener("mouseup",up);
      document.body.classList.remove("columnResizing");
    }
    document.body.classList.add("columnResizing");
    document.addEventListener("mousemove",move);
    document.addEventListener("mouseup",up);
  }
  function handlePaste(e:React.ClipboardEvent<HTMLInputElement>,startRow:number,startCol:number){
    const raw=e.clipboardData.getData("text/plain");
    if(!raw.includes("\t")&&!raw.includes("\n"))return;
    e.preventDefault();
    const matrix=raw.replace(/\r/g,"").split("\n").filter((line,i,a)=>!(i===a.length-1&&line==="")).map(line=>line.split("\t"));
    setRows(prev=>{
      const next=[...prev]; while(next.length<startRow+matrix.length)next.push(blankRow());
      matrix.forEach((vals,rOff)=>vals.forEach((value,cOff)=>{
        const col=columns[startCol+cOff]; if(!col)return;
        let normalized=value.trim();
        if(col.key==="client_user_id"){
          const match=clients.find(u=>u.display_name.toLowerCase()===normalized.toLowerCase()||u.username.toLowerCase()===normalized.toLowerCase());
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
      if(!row.client_user_id.trim())invalid[index]="Thiếu Client";
      else if(!row.order_id.trim())invalid[index]="Thiếu Order ID";
      else if(!row.service.trim())invalid[index]="Thiếu Dịch vụ";
      else if(!row.item.trim())invalid[index]="Thiếu tên sản phẩm";
      else if(!row.material.trim())invalid[index]="Thiếu chất liệu";
      else if(Number(row.carton_count||0)<1)invalid[index]="Số carton phải từ 1";
      else if(Number(row.weight||0)<=0)invalid[index]="Khối lượng phải lớn hơn 0";
      else if(([row.length,row.width,row.height].filter(Boolean).length>0&&[row.length,row.width,row.height].filter(Boolean).length<3)||(!row.manual_volume&&![row.length,row.width,row.height].every(Boolean)))invalid[index]="Nhập đủ Dài/Rộng/Cao hoặc Thể tích";
      else if(row.discount&&Number(row.discount)!==0&&!row.discount_note.trim())invalid[index]="Discount ngoại lệ cần lý do";
      else if(row.service&&!enumIsValid(enums,"SERVICE",row.service))invalid[index]="Dịch vụ không hợp lệ";
      else if(row.sub_service&&!enumIsValid(enums,"SUB_SERVICE",row.sub_service,row.service))invalid[index]="Sub-Service không hợp lệ";
      else if(row.country&&!enumIsValid(enums,"COUNTRY",row.country))invalid[index]="Nước không hợp lệ";
      else if(row.supplier&&!enumIsValid(enums,"SUPPLIER",row.supplier))invalid[index]="Supplier không hợp lệ";
    });
    if(Object.keys(invalid).length){setErrors(invalid);setMsg("Có dòng thiếu dữ liệu bắt buộc.");return;}
    setBusy(true);setMsg("");setErrors({});
    const results=await Promise.all(activeRows.map(async({row,index})=>{
      try{
        const client=clients.find(item=>String(item.id)===row.client_user_id);
        await postJson("/api/orders",{...row,customer:client?.display_name||row.customer,country:row.country||"US",auto_pricing:"0",id:row.id||undefined});
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
      <div><b>{edit?"Chỉnh sửa Order":"Nhập nhanh nhiều Order"}</b><span>Paste từ Google Sheets/Excel · Enter xuống dòng · Tab sang ô kế</span></div>
      <div className="sheetTools">
        {!edit&&<button className="secondaryBtn" onClick={()=>addRows(5)}>＋ 5 dòng</button>}
        <button className="primaryBtn" disabled={busy||!activeRows.length} onClick={()=>void saveAll()}>{busy?"Đang lưu…":edit?"Lưu Order":`Lưu ${activeRows.length||""} Order`}</button>
      </div>
    </div>
    <div className="sheetScroll">
      <table className="sheetTable">
        <colgroup>
          <col style={{width:42}}/>
          {columns.map(col=><col key={col.key} style={{width:columnWidths[col.key]||col.width||110}}/>)}
          <col style={{width:54}}/>
        </colgroup>
        <thead><tr><th className="sheetCorner">#</th>{columns.map(col=>{
          const width=columnWidths[col.key]||col.width||110;
          return <th key={col.key} style={{width,minWidth:width,maxWidth:width}}>
            <span>{col.label}</span>
            <i className="columnResizer" title="Kéo để đổi độ rộng · double click để auto-fit" onDoubleClick={()=>autoFitColumn(col.key,col.label,col.width||110)} onMouseDown={e=>startResize(e,col.key,width)} />
          </th>;
        })}<th className="sheetActionHead"></th></tr></thead>
        <tbody>{rows.map((row,r)=><tr key={r} className={errors[r]?"sheetErrorRow":dirty(row)?"sheetDirtyRow":""}>
          <td className="sheetRowNumber"><span>{r+1}</span>{errors[r]&&<i title={errors[r]}>!</i>}</td>
          {columns.map((col,c)=>{
            const options=col.key==="route_id"?routeOptions.filter(r=>clientRoutes[row.client_user_id]?.includes(r.value)):(col.options||[]);
            const enumType:EnumType|undefined=col.key==="service"?"SERVICE":col.key==="sub_service"?"SUB_SERVICE":col.key==="supplier"?"SUPPLIER":col.key==="country"?"COUNTRY":undefined;
            const invalidEnum=Boolean(enumType&&row[col.key]&&!enumIsValid(enums,enumType,row[col.key],enumType==="SUB_SERVICE"?row.service:""));
            return <td key={col.key} className="sheetCell">
            {col.type==="combo"
              ? <SmartSelect
                  value={row[col.key]||""}
                  onChange={v=>updateCell(r,col.key,v)}
                  options={options}
                  allowCustom={false}
                  placeholder="Chọn từ cấu hình"
                  invalid={invalidEnum}
                  dataCell={`${r}-${c}`}
                  onKeyDown={e=>handleKey(e,r,c)}
                  onPaste={e=>handlePaste(e,r,c)}
                />
              : <input
                  data-sheet-cell={`${r}-${c}`}
                  type={col.type==="number"?"number":"text"}
                  inputMode={col.type==="dateText"?"numeric":undefined}
                  step={col.type==="number"?"any":undefined}
                  value={row[col.key]||""}
                  placeholder={col.type==="dateText"?"dd/mm/yyyy":col.key==="service"?"ePacket":col.key==="country"?"US":""}
                  className={col.type==="dateText"&&row[col.key]&&!isValidDateText(row[col.key])?"sheetInputError":""}
                  onChange={e=>updateCell(r,col.key,e.target.value)}
                  onKeyDown={e=>handleKey(e,r,c)}
                  onPaste={e=>handlePaste(e,r,c)}
                />}
          </td>})}
          <td className="sheetRowActions">
            <button tabIndex={-1} title="Clone dòng" onClick={()=>cloneRow(r)}>⧉</button>
            <button tabIndex={-1} title="Xóa dòng" onClick={()=>removeRow(r)}>×</button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="sheetFooter">
      {!edit&&<button className="textBtn" onClick={()=>addRows(10)}>＋ Thêm 10 dòng</button>}
      <div><span>{activeRows.length} dòng có dữ liệu</span>{msg&&<b className={msg.includes("lỗi")||msg.includes("thiếu")?"sheetMsg error":"sheetMsg"}>{msg}</b>}</div>
    </div>
  </div>;
}


type EntrySheetProps={
  title:string;hint:string;columns:SheetColumn[];blank:()=>SheetRow;storageKey:string;
  validate:(row:SheetRow)=>string;save:(row:SheetRow)=>Promise<unknown>;onDone:()=>void;
  optionsFor?:(row:SheetRow,col:SheetColumn)=>Array<{value:string;label:string}>;
};

function EntrySheet({title,hint,columns,blank,storageKey,validate,save,onDone,optionsFor}:EntrySheetProps){
  const [rows,setRows]=useState<SheetRow[]>(()=>Array.from({length:8},blank));
  const [errors,setErrors]=useState<Record<number,string>>({});
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [widths,setWidths]=useState<Record<string,number>>({});
  useEffect(()=>{try{const raw=localStorage.getItem(storageKey);if(raw)setWidths(JSON.parse(raw))}catch{}},[storageKey]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(widths))}catch{}},[widths,storageKey]);
  const dirty=(row:SheetRow)=>Object.values(row).some(v=>String(v||"").trim()!=="");
  const active=rows.map((row,index)=>({row,index})).filter(x=>dirty(x.row));
  function update(row:number,key:string,value:string){setRows(prev=>prev.map((r,i)=>i===row?{...r,[key]:value}:r));setErrors(prev=>{const n={...prev};delete n[row];return n})}
  function add(count=5){setRows(prev=>[...prev,...Array.from({length:count},blank)])}
  function clone(index:number){setRows(prev=>{const n=[...prev];n.splice(index+1,0,{...prev[index],request_key:crypto.randomUUID()});return n})}
  function remove(index:number){setRows(prev=>prev.length<=1?[blank()]:prev.filter((_,i)=>i!==index))}
  function focus(row:number,col:number){requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-entry-cell="${row}-${col}"]`)?.focus())}
  function key(e:React.KeyboardEvent<HTMLInputElement>,row:number,col:number){if(e.key==="Enter"){e.preventDefault();const next=e.shiftKey?Math.max(0,row-1):row+1;if(!e.shiftKey&&row===rows.length-1)add(1);focus(next,col)}}
  function paste(e:React.ClipboardEvent<HTMLInputElement>,startRow:number,startCol:number){
    const raw=e.clipboardData.getData("text/plain");if(!raw.includes("\t")&&!raw.includes("\n"))return;e.preventDefault();
    const matrix=raw.replace(/\r/g,"").split("\n").filter((line,i,a)=>!(i===a.length-1&&line==="")).map(line=>line.split("\t"));
    setRows(prev=>{const n=[...prev];while(n.length<startRow+matrix.length)n.push(blank());matrix.forEach((vals,ro)=>vals.forEach((value,co)=>{const col=columns[startCol+co];if(col)n[startRow+ro]={...n[startRow+ro],[col.key]:value.trim()}}));return n});
  }
  function resize(e:React.MouseEvent,keyName:string,current:number){e.preventDefault();const start=e.clientX,startW=widths[keyName]||current;const move=(ev:MouseEvent)=>setWidths(x=>({...x,[keyName]:Math.max(58,Math.min(420,startW+ev.clientX-start))}));const up=()=>{document.removeEventListener("mousemove",move);document.removeEventListener("mouseup",up)};document.addEventListener("mousemove",move);document.addEventListener("mouseup",up)}
  async function saveAll(){
    if(!active.length){setMsg("Nhập ít nhất 1 dòng.");return}
    const invalid:Record<number,string>={};active.forEach(({row,index})=>{const err=validate(row);if(err)invalid[index]=err});
    if(Object.keys(invalid).length){setErrors(invalid);setMsg("Có dòng dữ liệu chưa hợp lệ.");return}
    setBusy(true);setErrors({});setMsg("");
    const results=await Promise.all(active.map(async({row,index})=>{try{if(!row.request_key)row.request_key=crypto.randomUUID();await save(row);return{index,ok:true as const}}catch(error){return{index,ok:false as const,error:error instanceof Error?error.message:"Không thể lưu"}}}));
    const failed=results.filter(x=>!x.ok);const succeeded=results.filter(x=>x.ok).map(x=>x.index);
    if(failed.length){const next:Record<number,string>={};failed.forEach(x=>{if(!x.ok)next[x.index]=x.error});setErrors(next);setRows(prev=>prev.map((r,i)=>succeeded.includes(i)?blank():r));setMsg(`Đã lưu ${succeeded.length} dòng, ${failed.length} dòng lỗi.`);setBusy(false);return}
    setBusy(false);onDone();
  }
  return <div className="sheetEntry">
    <div className="sheetToolbar"><div><b>{title}</b><span>{hint}</span></div><div className="sheetTools"><button className="secondaryBtn" onClick={()=>add(5)}>＋ 5 dòng</button><button className="primaryBtn" disabled={busy||!active.length} onClick={()=>void saveAll()}>{busy?"Đang lưu…":`Lưu ${active.length||""} dòng`}</button></div></div>
    <div className="sheetScroll"><table className="sheetTable"><colgroup><col style={{width:42}}/>{columns.map(c=><col key={c.key} style={{width:widths[c.key]||c.width||110}}/>)}<col style={{width:54}}/></colgroup>
      <thead><tr><th className="sheetCorner">#</th>{columns.map(c=>{const w=widths[c.key]||c.width||110;return <th key={c.key} style={{width:w,minWidth:w,maxWidth:w}}><span>{c.label}</span><i className="columnResizer" onMouseDown={e=>resize(e,c.key,w)}/></th>})}<th className="sheetActionHead"/></tr></thead>
      <tbody>{rows.map((row,r)=><tr key={r} className={errors[r]?"sheetErrorRow":dirty(row)?"sheetDirtyRow":""}><td className="sheetRowNumber">{r+1}{errors[r]&&<i title={errors[r]}>!</i>}</td>
        {columns.map((col,c)=>{const opts=optionsFor?optionsFor(row,col):(col.options||[]);return <td key={col.key} className="sheetCell">{col.type==="combo"?<SmartSelect value={row[col.key]||""} onChange={v=>update(r,col.key,v)} options={opts} dataCell={`${r}-${c}`} onKeyDown={e=>key(e,r,c)} onPaste={e=>paste(e,r,c)}/>:<input data-entry-cell={`${r}-${c}`} type={col.type==="number"?"number":"text"} step={col.type==="number"?"any":undefined} value={row[col.key]||""} placeholder={col.type==="dateText"?"dd/mm/yyyy":""} className={col.type==="dateText"&&row[col.key]&&!isValidDateText(row[col.key])?"sheetInputError":""} onChange={e=>update(r,col.key,e.target.value)} onKeyDown={e=>key(e,r,c)} onPaste={e=>paste(e,r,c)}/>}</td>})}
        <td className="sheetRowActions"><button tabIndex={-1} title="Clone dòng" onClick={()=>clone(r)}>⧉</button><button tabIndex={-1} title="Xóa dòng" onClick={()=>remove(r)}>×</button></td>
      </tr>)}</tbody></table></div>
    <div className="sheetFooter"><button className="textBtn" onClick={()=>add(10)}>＋ Thêm 10 dòng</button><div><span>{active.length} dòng có dữ liệu</span>{msg&&<b className={msg.includes("lỗi")||msg.includes("chưa")?"sheetMsg error":"sheetMsg"}>{msg}</b>}</div></div>
  </div>;
}

function CostSheet({enums,onDone}:{enums:EnumRow[];onDone:()=>void}){
  const columns:SheetColumn[]=[
    {key:"occurred_at",label:"Ngày",width:115,type:"dateText"},{key:"tracking",label:"Tracking *",width:150},
    {key:"supplier",label:"Supplier",width:130,type:"combo",options:enumOptions(enums,"SUPPLIER")},
    {key:"service",label:"Dịch vụ",width:140,type:"combo",options:enumOptions(enums,"SERVICE")},
    {key:"sub_service",label:"Sub-Service",width:140,type:"combo"},
    {key:"net_price",label:"Net Price",width:95,type:"number"},{key:"fee",label:"Phụ phí",width:90,type:"number"},
    {key:"export_customs",label:"HQ Xuất",width:90,type:"number"},{key:"import_customs",label:"HQ Nhập",width:90,type:"number"},
    {key:"total_net_cost",label:"Total Net",width:100,type:"number"},{key:"extra_surcharge",label:"Phụ phí BS",width:100,type:"number"},
    {key:"surcharge_type",label:"Loại phụ phí",width:150},{key:"import_tax",label:"Thuế NK",width:90,type:"number"},{key:"note",label:"Private Note",width:180},
  ];
  const blank=()=>({occurred_at:today(),tracking:"",supplier:"",service:"",sub_service:"",net_price:"",fee:"",export_customs:"",import_customs:"",total_net_cost:"",extra_surcharge:"",surcharge_type:"",import_tax:"",note:""});
  return <EntrySheet title="Nhập Supplier Cost" hint="Paste nhiều dòng · Tracking là khóa link Order" columns={columns} blank={blank} storageKey="dmd.costSheetWidths"
    optionsFor={(row,col)=>col.key==="sub_service"?enumOptions(enums,"SUB_SERVICE",row.service):(col.options||[])}
    validate={row=>!row.tracking.trim()?"Thiếu Tracking":row.occurred_at&&!isValidDateText(row.occurred_at)?"Ngày sai định dạng":row.service&&!enumIsValid(enums,"SERVICE",row.service)?"Dịch vụ không hợp lệ":row.sub_service&&!enumIsValid(enums,"SUB_SERVICE",row.sub_service,row.service)?"Sub-Service không hợp lệ":row.supplier&&!enumIsValid(enums,"SUPPLIER",row.supplier)?"Supplier không hợp lệ":""}
    save={row=>postJson("/api/costs",row)} onDone={onDone}/>;
}

const BALANCE_TYPES=[
  {value:"ADDITIONAL_FEE",label:"Additional fee (-)"},{value:"PAYMENT",label:"Payment (+)"},{value:"REFUND",label:"Refund (+)"},{value:"SERVICE_COST",label:"Service Cost (-)"},
  {value:"ERROR_PROCESSING",label:"Processing (+)"},{value:"ERROR_REFUND",label:"Error Refund (+)"},{value:"ERROR_CHARGEABLE",label:"Chargeable (-)"},
  {value:"ADJUSTMENT_CREDIT",label:"Adjustment Credit (+)"},{value:"ADJUSTMENT_DEBIT",label:"Adjustment Debit (-)"},
];
function BalanceSheet({clients,onDone,role}:{clients:User[];onDone:()=>void;role:string}){
  const clientOptions=clients.filter(client=>client.active!==0).map(client=>({value:String(client.id),label:client.display_name+" (@"+client.username+")"}));
  const columns:SheetColumn[]=[
    {key:"occurred_at",label:"Ngày",width:115,type:"dateText"},{key:"entry_type",label:"Hạng mục *",width:165,type:"combo",options:role==="SALES"?BALANCE_TYPES.filter(t=>["PAYMENT","ADDITIONAL_FEE"].includes(t.value)):BALANCE_TYPES},
    {key:"amount",label:"Số tiền *",width:100,type:"number"},{key:"client_user_id",label:"Client *",width:185,type:"combo",options:clientOptions},
    {key:"reference_type",label:"Reference type",width:125},{key:"reference_id",label:"Reference ID",width:145},
    {key:"bill_url",label:"Bill URL",width:200},{key:"note",label:"Note",width:200},
  ];
  const blank=()=>({occurred_at:today(),entry_type:"PAYMENT",amount:"",client_user_id:"",customer:"",reference_type:"MANUAL",reference_id:"",bill_url:"",note:""});
  const credit=new Set(["PAYMENT","REFUND","ERROR_REFUND","ERROR_PROCESSING","ADJUSTMENT_CREDIT"]);
  return <EntrySheet title="Ghi Balance" hint="Paste nhiều dòng · CREDIT/DEBIT tự suy ra từ hạng mục" columns={columns} blank={blank} storageKey="dmd.balanceSheetWidths"
    validate={row=>row.occurred_at&&!isValidDateText(row.occurred_at)?"Ngày sai định dạng":!BALANCE_TYPES.some(x=>x.value===row.entry_type)?"Hạng mục không hợp lệ":!row.amount||Number(row.amount)<=0?"Số tiền phải > 0":!row.client_user_id?"Thiếu Client":""}
    save={row=>{const client=clients.find(item=>String(item.id)===row.client_user_id);return postJson("/api/ledger",{...row,customer:client?.display_name||row.customer,direction:credit.has(row.entry_type)?"CREDIT":"DEBIT"})}} onDone={onDone}/>;
}

function ImportCard({ kind, title, detail, templateHref, onDone }:{
  kind:"orders"|"sales_orders"|"costs"|"tracking_updates"|"balance"; title:string; detail:string; templateHref:string; onDone:()=>void
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

function ClientServiceSettingsEditor({client,enums,onClose}:{client:User;enums:EnumRow[];onClose:()=>void}){
  type SettingDraft={is_enabled:boolean;discount_percent:string;default_sub_service:string;default_supplier:string};
  const services=enumOptions(enums,"SERVICE");
  const [settings,setSettings]=useState<Record<string,SettingDraft>>({});
  const [balance,setBalance]=useState(0);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState("");
  const key=(service:string,sub="")=>service+"::"+sub;
  useEffect(()=>{
    let cancelled=false;
    void(async()=>{
      setLoading(true);
      try{
        const res=await fetch("/api/client-services?view=setup&clientUserId="+client.id);
        if(!res.ok)throw new Error("Không thể tải cấu hình dịch vụ.");
        const body=await res.json();const next:Record<string,SettingDraft>={};
        for(const row of body.settings||[])next[key(row.service,row.sub_service)]={is_enabled:Boolean(row.is_enabled),discount_percent:String(row.discount_percent||0),default_sub_service:String(row.default_sub_service||""),default_supplier:String(row.default_supplier||"")};
        if(!cancelled){setSettings(next);setBalance(Number(body.balance||0))}
      }catch(error){if(!cancelled)setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể tải cấu hình dịch vụ."))}
      finally{if(!cancelled)setLoading(false)}
    })();
    return ()=>{cancelled=true};
  },[client.id]);
  function value(service:string,sub=""){
    return settings[key(service,sub)]||{is_enabled:sub?Boolean(settings[key(service)]?.is_enabled):false,discount_percent:"0",default_sub_service:"",default_supplier:""};
  }
  function update(service:string,sub:string,patch:Partial<SettingDraft>){setSettings(prev=>({...prev,[key(service,sub)]:{...value(service,sub),...patch}}))}
  async function save(service:string,sub=""){
    setBusy(true);setMsg("");
    try{
      const current=value(service,sub);
      await postJson("/api/client-services",{client_user_id:client.id,service,sub_service:sub,is_enabled:current.is_enabled,discount_percent:Number(current.discount_percent||0),default_sub_service:sub?"":current.default_sub_service,default_supplier:sub?"":current.default_supplier});
      setMsg("Đã lưu "+service+(sub?" / "+sub:"")+".");
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể lưu"))}
    finally{setBusy(false)}
  }
  if(loading)return <div className="loadingState">Đang tải dịch vụ Client…</div>;
  return <div className="clientServiceEditor">
    <div className="clientServiceSummary"><div><span>Client</span><b>{client.display_name}</b></div><div><span>Balance hiện tại</span><b>{money(balance)}</b></div></div>
    <p className="formHint">Bật dịch vụ mặc định hoặc cấu hình riêng từng Sub-Service. Default Sub-Service/Supplier được dùng khi xử lý mua đơn.</p>
    <div className="serviceSettingList">{services.map(option=>{
      const row=value(option.value);
      const subOptions=enumOptions(enums,"SUB_SERVICE",option.value);
      const enabledSubs=subOptions.filter(sub=>value(option.value,sub.value).is_enabled).length;
      return <section className="serviceSettingBlock" key={option.value}>
        <div className="serviceSettingRow">
          <b>{option.label}{enabledSubs>0&&<small>{enabledSubs} Sub-Service đang bật</small>}</b>
          <label className="serviceToggle"><input type="checkbox" checked={row.is_enabled} onChange={e=>update(option.value,"",{is_enabled:e.target.checked})}/><span>{row.is_enabled?"Dịch vụ mặc định đang bật":"Dịch vụ mặc định đang tắt"}</span></label>
          <label><span>Discount mặc định</span><div><input type="number" min="0" max="100" step="0.01" value={row.discount_percent} onChange={e=>update(option.value,"",{discount_percent:e.target.value})}/><em>%</em></div></label>
          <button className="secondaryBtn" disabled={busy} onClick={()=>void save(option.value)}>Lưu</button>
        </div>
        {row.is_enabled&&<div className="serviceDefaults">
          <label><span>Default Sub-Service</span><select value={row.default_sub_service} onChange={e=>update(option.value,"",{default_sub_service:e.target.value})}><option value="">Không có</option>{subOptions.map(sub=><option key={sub.value}>{sub.value}</option>)}</select></label>

        </div>}
        {subOptions.length>0&&<details className="subDiscounts"><summary>Dịch vụ & discount theo Sub-Service</summary>{subOptions.map(sub=>{const child=value(option.value,sub.value);return <div key={sub.value}><label><input type="checkbox" checked={child.is_enabled} onChange={e=>update(option.value,sub.value,{is_enabled:e.target.checked})}/>{sub.value}</label><label><input aria-label={"Discount "+option.value+" / "+sub.value+" (%)"} type="number" min="0" max="100" step="0.01" value={child.discount_percent} onChange={e=>update(option.value,sub.value,{discount_percent:e.target.value})}/><em>%</em></label><button className="editBtn" disabled={busy} onClick={()=>void save(option.value,sub.value)}>Lưu</button></div>})}</details>}
      </section>;
    })}</div>
    <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><button className="secondaryBtn" onClick={onClose}>Đóng</button></div>
  </div>;
}

function UserManager({users,enums,onDone,currentUser}:{users:User[];enums:EnumRow[];onDone:()=>void;currentUser:User}) {
  const [form,setForm]=useState({display_name:"",username:"",password:"",role:"SALES",sales_user_id:""});
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);
  const [accountSearch,setAccountSearch]=useState("");
  const [accountPage,setAccountPage]=useState(1);
  const [serviceClient,setServiceClient]=useState<User|null>(null);
  const salesUsers=users.filter(user=>user.role==="SALES"&&user.active!==0);
  const filteredUsers=users.filter(u=>{
    const q=accountSearch.trim().toLowerCase();
    return !q || u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || String(u.sales_display_name||"").toLowerCase().includes(q);
  });
  const accountPageSize=10;
  const accountTotalPages=Math.max(1,Math.ceil(filteredUsers.length/accountPageSize));
  const visibleUsers=filteredUsers.slice((accountPage-1)*accountPageSize,accountPage*accountPageSize);
  useEffect(()=>{setAccountPage(1)},[accountSearch,users.length]);

  async function create(e:FormEvent){
    e.preventDefault();setBusy(true);setMsg("");
    try{
      if(form.role==="CLIENT"&&!form.sales_user_id)throw new Error("Client bắt buộc phải chọn Sales phụ trách.");
      await postJson("/api/users",form);
      setForm({display_name:"",username:"",password:"",role:"SALES",sales_user_id:""});
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
    <details className="accountCreateDisclosure settingsDisclosure"><summary>＋ Tạo tài khoản</summary><form className="formCard" onSubmit={create}>
      <div className="formHead"><div><span className="eyebrow">ACCOUNT MANAGEMENT</span><h3>Tạo tài khoản Admin / Sales / Client / Nhân viên kho</h3></div></div>
      <p className="formHint">Nhân viên kho chỉ sử dụng khu vực Manifest. Client được gán bắt buộc cho một Sales và chỉ xem dữ liệu của chính mình.</p>
      <div className="formGrid">
        <Field label="Tên hiển thị" name="display_name" value={form.display_name} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
        <Field label="Username" name="username" value={form.username} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
        <Field label="Mật khẩu ban đầu" name="password" type="password" value={form.password} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} required/>
        <SelectField label="Role" name="role" value={form.role} onChange={(n,v)=>setForm(x=>({...x,[n]:v,sales_user_id:v==="CLIENT"?x.sales_user_id:""}))} allowCustom={false} requireOption options={[{value:"WAREHOUSE",label:"Nhân viên kho"},{value:"SALES",label:"Sales"},{value:"CLIENT",label:"Client"},{value:"ADMIN",label:"Admin"}]}/>
        {form.role==="CLIENT"&&<SelectField label="Sales phụ trách" name="sales_user_id" value={form.sales_user_id} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} allowCustom={false} requireOption options={salesUsers.map(user=>({value:String(user.id),label:user.display_name+" (@"+user.username+")"}))}/>}
      </div>
      <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><button className="primaryBtn" disabled={busy}>{busy?"Đang tạo…":"Tạo tài khoản"}</button></div>
    </form></details>
    <div className="dataToolbar accountsToolbar"><SearchBar value={accountSearch} onChange={setAccountSearch} placeholder="Tìm tên, username, role..."/><span>{filteredUsers.length} accounts</span></div>
    <div className="tableWrap accountTable"><table><thead><tr><th>Tên</th><th>Username</th><th>Role</th><th>Sales phụ trách</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visibleUsers.map(u=><tr key={u.id}><td data-label="Tài khoản">{u.display_name}{u.is_root_admin?<span className="rootBadge">ROOT</span>:null}</td><td data-label="Username">@{u.username}</td><td data-label="Role">{u.role}</td><td data-label="Sales phụ trách">{u.role==="CLIENT"?<SmartSelect compact value={String(u.sales_user_id||"")} onChange={value=>{if(value)void patchUser(u.id,{sales_user_id:Number(value)})}} allowCustom={false} options={salesUsers.map(user=>({value:String(user.id),label:user.display_name}))}/>:"—"}</td><td data-label="Trạng thái"><span className={u.active?"status goodStatus":"status badStatus"}>{u.active?"Active":"Locked"}</span></td><td data-label="Thao tác">
        <button className="editBtn" disabled={Boolean(u.is_root_admin)||u.id===currentUser.id} onClick={()=>void patchUser(u.id,{active:!u.active})}>{u.is_root_admin?"Protected":u.active?"Khóa":"Mở"}</button>
        <button className="editBtn" disabled={Boolean(u.is_root_admin)&&u.id!==currentUser.id} onClick={()=>{const pw=window.prompt("Mật khẩu mới (ít nhất 8 ký tự)");if(pw)void patchUser(u.id,{password:pw})}}>Reset PW</button>
        {u.role==="CLIENT"&&<button className="editBtn" onClick={()=>setServiceClient(u)}>Dịch vụ</button>}
      </td></tr>)}
    </tbody></table></div>
    <Pager data={{items:[],total:filteredUsers.length,page:accountPage,pageSize:accountPageSize,totalPages:accountTotalPages}} onPage={setAccountPage}/>
    {serviceClient&&<Modal title={`Dịch vụ · ${serviceClient.display_name}`} onClose={()=>setServiceClient(null)}><ClientServiceSettingsEditor client={serviceClient} enums={enums} onClose={()=>setServiceClient(null)}/></Modal>}
  </div>;
}

function EnumManager({rows,onDone}:{rows:EnumRow[];onDone:()=>void|Promise<void>}) {
  const [type,setType]=useState<EnumType>("SERVICE");
  const [search,setSearch]=useState("");
  const [form,setForm]=useState({value:"",parent_value:"",sort_order:"0"});
  const [editing,setEditing]=useState<number|null>(null);
  const [draft,setDraft]=useState({value:"",parent_value:"",sort_order:"0"});
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const serviceOptions=enumOptions(rows,"SERVICE");

  const typeRows=rows
    .filter(row=>row.enum_type===type)
    .filter(row=>{
      const q=search.trim().toLowerCase();
      return !q||row.value.toLowerCase().includes(q)||row.parent_value.toLowerCase().includes(q);
    })
    .sort((a,b)=>a.parent_value.localeCompare(b.parent_value)||a.sort_order-b.sort_order||a.value.localeCompare(b.value));

  function switchType(next:EnumType){
    setType(next);setSearch("");setEditing(null);setMsg("");
    setForm({value:"",parent_value:"",sort_order:"0"});
  }

  async function create(e:FormEvent){
    e.preventDefault();
    if(!form.value.trim()){setMsg("Lỗi: Tên danh mục là bắt buộc.");return;}
    if(type==="SUB_SERVICE"&&!form.parent_value){setMsg("Lỗi: Sub-Service cần Dịch vụ cha.");return;}
    setBusy(true);setMsg("");
    try{
      await postJson("/api/enums",{enum_type:type,value:form.value,parent_value:form.parent_value,sort_order:Number(form.sort_order||0)});
      setForm({value:"",parent_value:"",sort_order:"0"});
      setMsg("Đã thêm "+ENUM_LABELS[type]+".");
      await onDone();
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể thêm danh mục"))}
    finally{setBusy(false)}
  }

  function startEdit(row:EnumRow){
    setEditing(row.id);
    setDraft({value:row.value,parent_value:row.parent_value,sort_order:String(row.sort_order||0)});
    setMsg("");
  }

  async function patch(id:number,body:Record<string,unknown>){
    const res=await fetch("/api/enums/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error||"Không thể cập nhật danh mục");
    await onDone();
    return data;
  }

  async function save(row:EnumRow){
    if(!draft.value.trim()){setMsg("Lỗi: Tên danh mục là bắt buộc.");return;}
    setBusy(true);setMsg("");
    try{
      const body:Record<string,unknown>={value:draft.value,sort_order:Number(draft.sort_order||0)};
      await patch(row.id,body);
      setEditing(null);
      setMsg("Đã cập nhật "+ENUM_LABELS[type]+".");
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể cập nhật"))}
    finally{setBusy(false)}
  }

  async function toggle(row:EnumRow){
    setBusy(true);setMsg("");
    try{
      await patch(row.id,{active:!row.active});
      setMsg(row.active?"Đã deactivate. Dữ liệu cũ vẫn được giữ.":"Đã kích hoạt lại.");
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể cập nhật"))}
    finally{setBusy(false)}
  }

  return <div className="enumManager">
    <div className="enumTabs">
      {(["SERVICE","SUB_SERVICE","SUPPLIER","COUNTRY"] as EnumType[]).map(key=>{
        const total=rows.filter(row=>row.enum_type===key).length;
        const active=rows.filter(row=>row.enum_type===key&&row.active!==0).length;
        return <button key={key} className={type===key?"active":""} onClick={()=>switchType(key)}>
          <span>{ENUM_LABELS[key]}</span><small>{active}/{total}</small>
        </button>;
      })}
    </div>

    <form className="enumCreate" onSubmit={create}>
      <div className="enumCreateTitle">
        <b>Thêm {ENUM_LABELS[type]}</b>
        <span>Giá trị mới sẽ dùng ngay ở form nhập liệu.</span>
      </div>
      <input value={form.value} onChange={e=>setForm(x=>({...x,value:e.target.value}))} placeholder={"Tên "+ENUM_LABELS[type]}/>
      {type==="SUB_SERVICE"&&<SmartSelect
        value={form.parent_value}
        onChange={value=>setForm(x=>({...x,parent_value:value}))}
        options={serviceOptions}
        allowCustom={false}
        invalid={Boolean(form.parent_value)&&!enumIsValid(rows,"SERVICE",form.parent_value)}
        placeholder="Dịch vụ cha"
      />}
      <input className="enumSortInput" type="number" value={form.sort_order} onChange={e=>setForm(x=>({...x,sort_order:e.target.value}))} placeholder="Thứ tự"/>
      <button className="primaryBtn" disabled={busy}>＋ Thêm</button>
    </form>

    <div className="enumListHead">
      <SearchBar value={search} onChange={setSearch} placeholder={"Tìm "+ENUM_LABELS[type]+"..."}/>
      <span>{typeRows.length} giá trị · không hỗ trợ xóa</span>
    </div>

    <div className="tableWrap enumTable"><table>
      <thead><tr><th>Tên</th>{type==="SUB_SERVICE"&&<th>Dịch vụ cha</th>}<th>Thứ tự</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>
        {typeRows.length===0?<tr><td className="empty" colSpan={type==="SUB_SERVICE"?5:4}>Chưa có dữ liệu.</td></tr>:typeRows.map(row=><tr key={row.id} className={!row.active?"inactiveEnumRow":""}>
          <td>{editing===row.id?<input className="enumInlineInput" value={draft.value} onChange={e=>setDraft(x=>({...x,value:e.target.value}))}/>:<b>{row.value}</b>}</td>
          {type==="SUB_SERVICE"&&<td>{row.parent_value||"—"}</td>}
          <td>{editing===row.id?<input className="enumInlineInput sort" type="number" value={draft.sort_order} onChange={e=>setDraft(x=>({...x,sort_order:e.target.value}))}/>:row.sort_order}</td>
          <td><span className={row.active?"status goodStatus":"status neutralStatus"}>{row.active?"Active":"Inactive"}</span></td>
          <td className="enumActions">
            {editing===row.id?<>
              <button className="editBtn" disabled={busy} onClick={()=>void save(row)}>Lưu</button>
              <button className="editBtn" onClick={()=>setEditing(null)}>Hủy</button>
            </>:<>
              <button className="editBtn" onClick={()=>startEdit(row)}>Sửa</button>
              <button className={row.active?"deactivateBtn":"activateBtn"} disabled={busy} onClick={()=>void toggle(row)}>{row.active?"Deactivate":"Activate"}</button>
            </>}
          </td>
        </tr>)}
      </tbody>
    </table></div>
    {msg&&<div className={msg.startsWith("Lỗi")?"enumMessage error":"enumMessage"}>{msg}</div>}
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

function OrderSearchBar({value,onChange}:{value:string;onChange:(v:string)=>void}) {
  const count=value.split(/[\n,]+/).map(term=>term.trim()).filter(Boolean).length;
  return <div className="searchBox orderSearchBox"><span>⌕</span><textarea rows={1} value={value} onChange={e=>onChange(e.target.value)} placeholder="Tìm Order ID, Tracking, khách hàng, dịch vụ… Dán nhiều Tracking / Client Order ID bằng dòng hoặc dấu phẩy."/>{count>1&&<em>{count} mã</em>}{value&&<button onClick={()=>onChange("")}>×</button>}</div>;
}

function Modal({title,onClose,children,size="wide"}:{title:string;onClose:()=>void;children:React.ReactNode;size?:"wide"|"compact"|"fullscreen"}) {
  const panelClass=size==="compact"?"modalPanel compactModal":size==="fullscreen"?"modalPanel fullscreenModal":"modalPanel";
  return <div className={size==="fullscreen"?"modalBackdrop fullscreenBackdrop":"modalBackdrop"} onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}>
    <div className={panelClass}>
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

type TrackingDraft={id?:number;tracking:string;label_url:string;lot_number:number;status?:string;is_primary?:number;cost_match_type:string;cost_parent_tracking_id?:number|null;replaced_by_tracking_id?:number|null};

function PurchaseOrderPanel({order,onClose,onDone}:{order:RowData;enums:EnumRow[];onClose:()=>void;onDone:()=>void|Promise<void>}){
  const orderId=Number(order.id||0);
  const [supplier,setSupplier]=useState(String(order.supplier||""));
  const [internalNote,setInternalNote]=useState(String(order.internal_note||""));
  const [expectedLotCount,setExpectedLotCount]=useState(String(order.expected_lot_count||1));
  const [trackings,setTrackings]=useState<TrackingDraft[]>([]);
  const [busy,setBusy]=useState(true);const [msg,setMsg]=useState("");
  const [replaceId,setReplaceId]=useState<number|null>(null);
  const [replacement,setReplacement]=useState({tracking:"",label_url:"",reason:""});

  const load=useCallback(async()=>{
    setBusy(true);setMsg("");
    const res=await fetch(`/api/orders/${orderId}/trackings`);const body=await res.json();
    if(!res.ok){setMsg("Lỗi: "+body.error);setBusy(false);return;}
    setSupplier(String(body.order?.supplier||""));setInternalNote(String(body.order?.internal_note||""));setExpectedLotCount(String(body.order?.expected_lot_count||1));
    const rows=(body.progress_trackings||body.trackings||[]).map((row:Record<string,unknown>)=>({
      id:row.id?Number(row.id):undefined,tracking:String(row.tracking||""),label_url:String(row.label_url||""),lot_number:Number(row.lot_number||1),status:String(row.status||"ACTIVE"),is_primary:Number(row.is_primary||0),cost_match_type:String(row.cost_match_type||"UNKNOWN"),cost_parent_tracking_id:row.cost_parent_tracking_id?Number(row.cost_parent_tracking_id):null,replaced_by_tracking_id:row.replaced_by_tracking_id?Number(row.replaced_by_tracking_id):null,
    }));
    setTrackings(rows.length?rows:[{tracking:"",label_url:"",lot_number:1,cost_match_type:"UNKNOWN"}]);setBusy(false);
  },[orderId]);
  useEffect(()=>{void load()},[load]);

  const active=trackings.filter(row=>row.status!=="REPLACED"&&row.status!=="CANCELLED");
  const history=trackings.filter(row=>row.status==="REPLACED"||row.status==="CANCELLED");
  function update(index:number,key:keyof TrackingDraft,value:string|number|null){setTrackings(prev=>prev.map((row,i)=>i===index?{...row,[key]:value}:row))}
  function addTracking(){setTrackings(prev=>[...prev,{tracking:"",label_url:"",lot_number:1,cost_match_type:"UNKNOWN"}])}
  function removeDraft(index:number){setTrackings(prev=>prev.filter((_,i)=>i!==index))}

  async function save(complete:boolean){
    if(complete&&!active.some(row=>row.tracking.trim())){setMsg("Lỗi: Cần ít nhất một Tracking.");return;}
    const seen=new Set<string>();
    for(const row of active){const key=row.tracking.replace(/[\s-]+/g,"").toUpperCase();if(!key)continue;if(seen.has(key)){setMsg("Lỗi: Tracking bị trùng trong Order.");return;}seen.add(key)}
    setBusy(true);setMsg("");
    try{
      await postJson(`/api/orders/${orderId}/trackings`,{action:"save",supplier,internal_note:internalNote,expected_lot_count:Number(expectedLotCount||1),complete,trackings:active});
      setMsg(complete?"Đã hoàn tất mua đơn.":"Đã lưu nháp.");await load();await onDone();
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể lưu"));setBusy(false)}
  }
  async function replaceTracking(){
    if(!replaceId||!replacement.tracking.trim()){setMsg("Lỗi: Tracking mới là bắt buộc.");return;}
    setBusy(true);setMsg("");
    try{
      await postJson(`/api/orders/${orderId}/trackings`,{action:"replace",old_tracking_id:replaceId,new_tracking:replacement.tracking,new_label_url:replacement.label_url,reason:replacement.reason});
      setReplaceId(null);setReplacement({tracking:"",label_url:"",reason:""});await load();await onDone();
    }catch(error){setMsg("Lỗi: "+(error instanceof Error?error.message:"Không thể đổi Tracking"));setBusy(false)}
  }

  return <div className="purchasePanel">
    <div className="purchaseSummary"><div><span>ORDER</span><b>{String(order.order_id||order.id||"—")}</b></div><div><span>CLIENT</span><b>{String(order.customer||"—")}</b></div><div><span>TRẠNG THÁI</span><b>{String(order.workflow_status||"PENDING_PURCHASE")}</b></div></div>
    <div className="purchaseFields">
      <label className="field"><span>Supplier theo route</span><input value={supplier} readOnly/></label>
      <Field label="Số lượng Lô" name="expected_lot_count" type="number" value={expectedLotCount} onChange={(_,value)=>setExpectedLotCount(value)}/>
      <TextAreaField label="Note nội bộ (chỉ Admin)" name="internal_note" value={internalNote} onChange={(_,value)=>setInternalNote(value)}/>
    </div>
    {busy&&trackings.length===0?<div className="loadingState">Đang tải Tracking…</div>:<div className="lotList">
      <section className="lotCard"><div className="lotHead"><div><span>TRACKING & LABEL</span><b>{active.length}/{String(order.carton_count||"?")} carton</b></div><button className="textBtn" onClick={addTracking}>＋ Thêm Tracking</button></div>
        <div className="trackingRows">{active.map((row,index)=><div className="trackingRow" key={row.id||`new-${index}`}>
          <div className="trackingIndex">{index+1}</div>
          <label><span>Tracking</span><input value={row.tracking} disabled={Boolean(row.id)} onChange={e=>update(index,"tracking",e.target.value)} placeholder="Nhập mã Tracking"/></label>
          <label><span>URL Label</span><input value={row.label_url} onChange={e=>update(index,"label_url",e.target.value)} placeholder="https://..."/></label>
          <div className="trackingActions">{row.label_url&&<a href={row.label_url} target="_blank" rel="noreferrer">Label ↗</a>}{row.id?<button onClick={()=>{setReplaceId(row.id||null);setReplacement({tracking:"",label_url:"",reason:""})}}>Đổi Tracking</button>:<button onClick={()=>removeDraft(index)}>Xóa</button>}</div>
        </div>)}</div>
      </section>
      {history.length>0&&<details className="trackingHistory"><summary>Lịch sử Tracking ({history.length})</summary>{history.map(row=><div key={row.id}><span>{row.tracking}</span><em>{row.status}</em>{row.label_url&&<a href={row.label_url} target="_blank" rel="noreferrer">Label cũ ↗</a>}</div>)}</details>}
    </div>}
    {replaceId&&<div className="replaceBox"><div className="formHead"><div><span className="eyebrow">TRACKING REPLACEMENT</span><h3>Đổi Tracking và Label</h3></div><button className="closeBtn" onClick={()=>setReplaceId(null)}>×</button></div><div className="formGrid"><Field label="Tracking mới" name="tracking" value={replacement.tracking} onChange={(_,value)=>setReplacement(x=>({...x,tracking:value}))}/><Field label="URL Label mới" name="label_url" value={replacement.label_url} onChange={(_,value)=>setReplacement(x=>({...x,label_url:value}))}/><label className="field"><span>Lý do thay đổi (không bắt buộc)</span><select value={replacement.reason} onChange={event=>setReplacement(x=>({...x,reason:event.target.value}))}><option value="">Không ghi lý do</option>{TRACKING_REPLACEMENT_REASONS.map(reason=><option key={reason} value={reason}>{reason}</option>)}</select></label></div><button className="primaryBtn" onClick={()=>void replaceTracking()}>Xác nhận thay thế</button></div>}
    <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><div className="purchaseButtons"><button className="secondaryBtn" onClick={onClose}>Đóng</button><button className="secondaryBtn" disabled={busy} onClick={()=>void save(false)}>Lưu nháp</button><button className="primaryBtn" disabled={busy} onClick={()=>void save(true)}>Hoàn tất mua đơn</button></div></div>
  </div>;
}

function Platform({user,onLogout}:{user:User;onLogout:()=>void}) {
  const role=user.role;
  const [summary,setSummary]=useState<Summary|null>(null);
  const [claimAttention,setClaimAttention]=useState(0);
  const [users,setUsers]=useState<User[]>([]);
  const [enums,setEnums]=useState<EnumRow[]>([]);
  const [allEnums,setAllEnums]=useState<EnumRow[]>([]);
  const [section,setSection]=useState<AppSection>(role==="ADMIN"?"dashboard":role==="WAREHOUSE"?"manifest":"orders");
  const [data,setData]=useState<PagedRows>({items:[],total:0,page:1,pageSize:20,totalPages:1});
  const [recent,setRecent]=useState<RowData[]>([]);
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [loading,setLoading]=useState(false);
  const [entry,setEntry]=useState<ManualKind|null>(null);
  const [editOrder,setEditOrder]=useState<RowData|null>(null);
  const [clientPurchase,setClientPurchase]=useState(false);
  const [clientDraft,setClientDraft]=useState<RowData|null>(null);
  const [purchaseOrder,setPurchaseOrder]=useState<RowData|null>(null);
  const [viewOrder,setViewOrder]=useState<RowData|null>(null);
  const [bulkTracking,setBulkTracking]=useState(false);
  const [bulkReplacement,setBulkReplacement]=useState(false);
  const [importKind,setImportKind]=useState<ImportKind|null>(null);
  const [ordersTab,setOrdersTab]=useState("all");
  const [draftFilter,setDraftFilter]=useState("");
  const [draftClient,setDraftClient]=useState("");
  const [draftSelection,setDraftSelection]=useState<number[]>([]);
  const [draftMessage,setDraftMessage]=useState("");
  const [orderFilters,setOrderFilters]=useState({status:"",service:"",salesUserId:"",reconcile:""});

  useEffect(()=>{
    if(!['ADMIN','SALES'].includes(role))return;
    let live=true;
    const refresh=async()=>{try{const res=await fetch('/api/control-tower');if(!res.ok)return;const t=await res.json();if(live)setClaimAttention(Number(t.counts?.claim_follow_up||0));}catch{}};
    void refresh();const timer=setInterval(()=>void refresh(),30000);
    const focus=()=>void refresh();window.addEventListener('focus',focus);
    return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',focus)};
  },[role]);
  const salesUsers=users.filter(u=>u.role==="SALES"&&u.active!==0);
  const clients=users.filter(u=>u.role==="CLIENT");

  useEffect(()=>{
    const id=setTimeout(()=>setDebouncedSearch(search),300);
    return ()=>clearTimeout(id);
  },[search]);

  useEffect(()=>{setPage(1)},[section,debouncedSearch]);
  useEffect(()=>{setPage(1)},[orderFilters.status,orderFilters.service,orderFilters.salesUserId,orderFilters.reconcile]);

  const loadSummary=useCallback(async()=>{
    if(role!=="ADMIN"){setSummary(null);return;}
    const res=await fetch("/api/summary");
    if(res.status===401){onLogout();return;}
    setSummary(await res.json());
  },[role,onLogout]);

  const loadUsers=useCallback(async()=>{
    if(role==="CLIENT"||role==="WAREHOUSE"){setUsers([]);return;}
    const res=await fetch("/api/users");
    if(res.status===401){onLogout();return;}
    if(res.ok)setUsers(await res.json());
  },[role,onLogout]);

  const loadEnums=useCallback(async()=>{
    const activeRes=await fetch("/api/enums");
    if(activeRes.status===401){onLogout();return;}
    if(activeRes.ok)setEnums(await activeRes.json());
    if(role==="ADMIN"){
      const allRes=await fetch("/api/enums?all=1");
      if(allRes.status===401){onLogout();return;}
      if(allRes.ok)setAllEnums(await allRes.json());
    }else setAllEnums([]);
  },[role,onLogout]);

  const endpointFor=(target:AppSection)=>{
    if(target==="orders")return "/api/orders";
    if(target==="shipping")return "/api/shipment-status";
    if(target==="costs")return "/api/costs";
    if(target==="recon")return "/api/reconciliation";
    if(target==="ledger")return "/api/ledger";
    return "";
  };

  const loadSection=useCallback(async(target:AppSection,currentPage=page,q=debouncedSearch)=>{
    const endpoint=target==="orders"&&ordersTab==="draft"?"/api/client-drafts":endpointFor(target);
    if(!endpoint)return;
    setLoading(true);
    try{
      const params=new URLSearchParams({page:String(currentPage),pageSize:"20",q});
      if(target==="orders"){
        if(ordersTab==="draft"){params.set("view","draft");if(draftFilter)params.set("draftState",draftFilter);if(draftClient)params.set("clientId",draftClient);}
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
  },[page,debouncedSearch,onLogout,orderFilters,ordersTab,draftFilter,draftClient]);

  async function deleteSelectedDrafts(all:boolean){
    try{const result=await postJson('/api/client-drafts',{action:'delete',all,ids:draftSelection,client_id:Number(draftClient)});setDraftMessage(`Đã xóa ${result.deleted} Draft.`);setDraftSelection([]);await loadSection('orders');}catch(e){setDraftMessage((e as Error).message)}
  }

  const loadRecent=useCallback(async()=>{
    if(role!=="ADMIN"){setRecent([]);return;}
    const res=await fetch("/api/orders?page=1&pageSize=10");
    if(res.ok){const body=await res.json();setRecent(body.items||[])}
  },[role]);

  useEffect(()=>{void loadSummary();void loadUsers();void loadEnums();void loadRecent()},[loadSummary,loadUsers,loadEnums,loadRecent]);
  useEffect(()=>{if(["orders","shipping","costs","recon","ledger"].includes(section))void loadSection(section,page,debouncedSearch)},[section,page,debouncedSearch,loadSection]);

  const refresh=useCallback(async()=>{
    await Promise.all([loadSummary(),loadUsers(),loadEnums(),loadRecent()]);
    if(["orders","shipping","costs","recon","ledger"].includes(section))await loadSection(section,page,debouncedSearch);
  },[loadSummary,loadUsers,loadEnums,loadRecent,loadSection,section,page,debouncedSearch]);

  useEffect(()=>{window.scrollTo(0,0)},[section]);

  function navigate(next:AppSection){
    if(role==="WAREHOUSE"&&!["manifest","operations"].includes(next))return;
    if((role==="SALES"||role==="CLIENT")&&!(["orders","ledger","operations"] as AppSection[]).includes(next))return;
    setSection(next);setSearch("");setPage(1);
  }
  function openEntry(kind:ManualKind,row?:RowData){
    if(role==="CLIENT")return;
    setEditOrder(row||null);
    setEntry(kind);
  }
  function closeEntry(){setEntry(null);setEditOrder(null)}
  async function entryDone(){closeEntry();await refresh()}
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});onLogout()}

  const orderCols=role==="ADMIN"
    ?["workflow_status","created_at","system_order_code","order_id","sales","customer","item","service","sub_service","chargeable_weight","tracking","true_net_cost","sales_price","extra_surcharge","extra_import_tax","total_due","reconciliation_status"]
    :["workflow_status","created_at","system_order_code","order_id","customer","item","service","sub_service","chargeable_weight","tracking","sales_price","surcharge","total_due"];

  const nav:Array<{key:AppSection;label:string;icon:string;roles:Role[]}>=[
    {key:"dashboard",label:"Tổng quan",icon:"⌂",roles:["ADMIN"]},
    {key:"orders",label:"Orders",icon:"▤",roles:["ADMIN","SALES","CLIENT"]},
    {key:"manifest",label:"Manifest kho",icon:"▣",roles:["ADMIN","WAREHOUSE"]},
    {key:"shipping",label:"Theo dõi vận chuyển",icon:"⌁",roles:["ADMIN"]},
    {key:"operations",label:"Control Tower",icon:"◎",roles:["ADMIN","SALES","CLIENT","WAREHOUSE"]},
    {key:"ledger",label:"Balance Ledger",icon:"≋",roles:["ADMIN","SALES","CLIENT"]},
    {key:"costs",label:"Supplier Costs",icon:"$ ",roles:["ADMIN"]},
    {key:"recon",label:"Reconciliation",icon:"✓",roles:["ADMIN"]},
    {key:"masterdata",label:"Dịch vụ",icon:"☷",roles:["ADMIN"]},
    {key:"accounts",label:"Tài khoản",icon:"♙",roles:["ADMIN"]},
  ];

  const titleMap:Record<AppSection,string>={
    dashboard:"Tổng quan",orders:"Orders",manifest:"Manifest kho",shipping:"Theo dõi vận chuyển",costs:"Supplier Costs",
    operations:"Control Tower",recon:"Reconciliation",ledger:"Balance Ledger",masterdata:"Dịch vụ",accounts:"Tài khoản",
  };

  return <div className="appShell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">D</div><div><b>DMD Finance</b><span>Operations</span></div></div>
      <nav className="sideNav">
        {nav.filter(n=>n.roles.includes(role)).map(n=><button key={n.key} aria-label={n.label} title={n.label} className={section===n.key?"active":""} onClick={()=>navigate(n.key)}>
          <i>{n.icon}</i><span>{n.label}</span>
          {n.key==="operations"&&claimAttention>0&&<em aria-label="Claims cần lưu tâm">{claimAttention}</em>}
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
        <button className="mobileBrand" onClick={()=>navigate(role==="ADMIN"?"dashboard":role==="WAREHOUSE"?"manifest":"orders")}>DMD</button>
        <div className="crumb"><span>Finance Ops</span><i>/</i><b>{titleMap[section]}</b></div>
        <div className="topUser">
          <span className="topRole">{role}</span>
          <b>{user.display_name}</b>
          <button className="topLogoutBtn" onClick={()=>void logout()} aria-label="Đăng xuất" title="Đăng xuất">↪</button>
        </div>
      </div>

      <div className="pageContent">
        {role==="ADMIN"&&section==="dashboard"&&<>
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
              <Table rows={recent} cols={role==="ADMIN"?["created_at","system_order_code","order_id","customer","sales","service","total_due","workflow_status"]:["created_at","system_order_code","order_id","customer","service","total_due","workflow_status"]} compact onView={setViewOrder}/>
            </div>
            <div className="quickPanel">
              <h3>Thao tác nhanh</h3>
              <button onClick={()=>openEntry("order")}><i>＋</i><div><b>Tạo Order</b><span>Nhập một order mới</span></div></button>
              {role==="ADMIN"&&<button onClick={()=>openEntry("cost")}><i>$</i><div><b>Nhập Supplier Cost</b><span>Reconcile theo Tracking</span></div></button>}
              {role==="ADMIN"&&<button onClick={()=>openEntry("balance")}><i>≋</i><div><b>Ghi Balance</b><span>Payment / Refund / Adjustment</span></div></button>}
            </div>
          </section>
        </>}

        {section==="orders"&&<>
          <PageHeader eyebrow="OPERATIONS" title="Orders" description={role==="ADMIN"?"Quản lý toàn bộ đơn hàng và trạng thái xử lý.":role==="SALES"?"Quản lý Orders của các Client được phân công.":"Theo dõi Orders của tài khoản Client này."}
            actions={role==="CLIENT"?<button className="primaryBtn" onClick={()=>{setClientDraft(null);setClientPurchase(true)}}>＋ Tạo / Import & Đặt mua dịch vụ</button>:<><button className="secondaryBtn" onClick={()=>setImportKind(role==="ADMIN"?"orders":"sales_orders")}>⇩ Import</button>{role==="ADMIN"&&ordersTab==="all"&&<button className="secondaryBtn" onClick={()=>setBulkTracking(true)}>▦ Mua đơn hàng loạt</button>}{role==="ADMIN"&&<button className="secondaryBtn" onClick={()=>setBulkReplacement(true)}>⇄ Đổi Tracking</button>}<button className="primaryBtn" onClick={()=>openEntry("order")}>＋ Tạo Order</button></>}/>
          <div className="templateKindTabs"><button className={ordersTab==="all"?"active":""} onClick={()=>{setOrdersTab("all");setPage(1);setOrderFilters(x=>({...x,status:""}))}}>Mọi đơn hàng</button><button className={ordersTab==="draft"?"active":""} onClick={()=>{setOrdersTab("draft");setPage(1);setOrderFilters(x=>({...x,status:""}))}}>Draft</button></div>
          {ordersTab==="draft"&&<div className="dataToolbar">
            <select value={draftFilter} onChange={e=>{setDraftFilter(e.target.value);setPage(1)}}><option value="">Tất cả Draft</option><option value="incomplete">Chưa hoàn tất</option><option value="failed">Đặt thất bại</option><option value="eligible">Đủ điều kiện</option><option value="support">Cần hỗ trợ</option></select>
            {role!=="CLIENT"&&<select value={draftClient} onChange={e=>{setDraftClient(e.target.value);setDraftSelection([]);setPage(1)}}><option value="">Mọi Client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select>}
            <button disabled={role!=="CLIENT"&&!draftClient||!draftSelection.length} onClick={()=>void deleteSelectedDrafts(false)}>Xóa Draft đã chọn ({draftSelection.length})</button>
            <button disabled={role!=="CLIENT"&&!draftClient} onClick={()=>{if(window.confirm("Xóa tất cả Draft của Client đang chọn?"))void deleteSelectedDrafts(true)}}>Xóa tất cả Draft</button>

            {draftMessage&&<p role="status">{draftMessage}</p>}
          </div>}
          <div className="panel dataPanel">
            <div className="dataToolbar orderToolbar">
              <OrderSearchBar value={search} onChange={setSearch}/>
              {ordersTab==="all"&&<div className="orderFilters">
                <SmartSelect compact allowCustom={false} value={orderFilters.status} onChange={v=>setOrderFilters(x=>({...x,status:v}))} options={[{value:"",label:"Mọi trạng thái"},{value:"PENDING_PURCHASE",label:"Chờ mua đơn"},{value:"PURCHASED",label:"Đã mua đơn"},{value:"RECONCILED",label:"Đã đối soát"},{value:"CANCELLED",label:"Đã huỷ"},{value:"HOLD",label:"Tạm giữ"},{value:"DELIVERED",label:"Đã giao"},{value:"CLOSED",label:"Đã kết thúc"}]}/>
                <SmartSelect compact value={orderFilters.service} onChange={v=>setOrderFilters(x=>({...x,service:v}))} allowCustom={false} options={[{value:"",label:"Mọi dịch vụ"},...enumOptions(enums,"SERVICE")]}/>
                {role==="ADMIN"&&<SmartSelect compact allowCustom={false} value={orderFilters.salesUserId} onChange={v=>setOrderFilters(x=>({...x,salesUserId:v}))} options={[{value:"",label:"Mọi Sales"},...salesUsers.map(u=>({value:String(u.id),label:u.display_name}))]}/>}
                {role==="ADMIN"&&<SmartSelect compact allowCustom={false} value={orderFilters.reconcile} onChange={v=>setOrderFilters(x=>({...x,reconcile:v}))} options={[{value:"",label:"Mọi reconcile"},{value:"PASS",label:"PASS"},{value:"REVIEW",label:"REVIEW"}]}/>}
                {(orderFilters.status||orderFilters.service||orderFilters.salesUserId||orderFilters.reconcile)&&<button className="clearFilters" onClick={()=>setOrderFilters({status:"",service:"",salesUserId:"",reconcile:""})}>Xóa lọc</button>}
              </div>}
              <span>{data.total} records</span>
            </div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={ordersTab==="draft"?["draft_state","created_at","order_id","customer","service","sub_service","failure_reason"]:orderCols} selectedIds={draftSelection} onSelect={ordersTab==="draft"?(id,checked)=>setDraftSelection(prev=>checked?[...prev,id]:prev.filter(x=>x!==id)):undefined} canEdit={row=>role==="CLIENT"||!!row.failure_reason} onView={ordersTab==="all"?setViewOrder:undefined} onEdit={ordersTab==="draft"?row=>{if(role==="CLIENT"||row.failure_reason){setClientDraft(row);setClientPurchase(true)}}:undefined} onPurchase={role==="ADMIN"&&ordersTab==="all"?row=>setPurchaseOrder(row):undefined}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {(role==="ADMIN"||role==="WAREHOUSE")&&section==="manifest"&&<>
          <PageHeader eyebrow="WAREHOUSE OPERATIONS" title="Manifest kho" description="Nhập đơn vào thùng xuất, chốt khi đầy và xuất file Manifest theo từng thùng."/>
          <ManifestScanPanel/>
        </>}

        {role==="ADMIN"&&section==="shipping"&&<>
          <PageHeader eyebrow="OPERATIONS" title="Theo dõi vận chuyển" description="Cập nhật trạng thái theo ETD; Alert và Exception được tách thành view xử lý riêng."/>
          <div className="panel"><ShipmentStatusPanel enums={enums}/></div>
        </>}

        {role==="ADMIN"&&section==="costs"&&<>
          <PageHeader eyebrow="FINANCE" title="Supplier Costs" description="Theo dõi chi phí thực tế và trạng thái link với Orders."
            actions={<><button className="secondaryBtn" onClick={()=>setImportKind("costs")}>⇩ Import</button><button className="primaryBtn" onClick={()=>openEntry("cost")}>＋ Nhập Cost</button></>}/>
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

        {section==="operations"&&<OperationsWorkspace role={role}/>}
        {section==="ledger"&&<>
          <FinancialWorkspace role={role} clients={clients}/>
          <PageHeader eyebrow="FINANCE" title="Balance Ledger" description={role==="ADMIN"?"Dòng tiền Credit / Debit và các order charge tự động.":role==="SALES"?"Balance Ledger của các Client được phân công.":"Balance Ledger của tài khoản Client này."}
            actions={role==="ADMIN"?<><button className="secondaryBtn" onClick={()=>setImportKind("balance")}>⇩ Import</button><button className="primaryBtn" onClick={()=>openEntry("balance")}>＋ Ghi Balance</button></>:role==="SALES"?<button className="primaryBtn" onClick={()=>openEntry("balance")}>＋ Ghi Balance</button>:undefined}/>
          <div className="panel dataPanel">
            <div className="dataToolbar"><SearchBar value={search} onChange={setSearch} placeholder="Tìm loại giao dịch, khách, reference, note..."/><span>{data.total} records</span></div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={["occurred_at","entry_type","direction","amount","customer","reference_type","reference_id","note"]}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {role==="ADMIN"&&section==="masterdata"&&<>
          <PageHeader eyebrow="SERVICE CONFIGURATION" title="Dịch vụ" description="Quản lý dịch vụ, bảng giá, phụ phí và Template xuất file theo từng Supplier."/>
          <ServiceConfigurationPanel enums={allEnums}/>
          <details className="panel masterDataDetails"><summary>Master data: Service, Sub-Service, Supplier và Nước</summary><EnumManager rows={allEnums} onDone={refresh}/></details>
        </>}

        {role==="ADMIN"&&section==="accounts"&&<>
          <PageHeader eyebrow="ACCESS CONTROL" title="Tài khoản" description="Tạo và quản lý quyền truy cập cho Admin / Sales / Client / Nhân viên kho."/>
          <div className="panel"><UserManager users={users} enums={enums} onDone={refresh} currentUser={user}/></div>
        </>}
      </div>
    </div>

    {clientPurchase&&<Modal size="wide" title="Client · Đặt mua dịch vụ" onClose={()=>setClientPurchase(false)}><ClientPurchasePanel support={role!=="CLIENT"} initial={clientDraft} onDone={()=>void refresh()}/></Modal>}
    {viewOrder&&<Modal size="wide" title="Chi tiết Order" onClose={()=>setViewOrder(null)}><OrderDetailPanel orderId={Number(viewOrder.id)} role={role} onDone={refresh} onEdit={row=>{setViewOrder(null);openEntry("order",row as RowData)}} onPurchase={role==="ADMIN"?row=>{setViewOrder(null);setPurchaseOrder(row as RowData)}:undefined}/></Modal>}

    {role==="ADMIN"&&bulkTracking&&<Modal size="fullscreen" title="Mua đơn hàng loạt" onClose={()=>setBulkTracking(false)}><BulkTrackingSheet enums={enums} onDone={refresh}/></Modal>}

    {role==="ADMIN"&&bulkReplacement&&<Modal size="fullscreen" title="Đổi Tracking & Label hàng loạt" onClose={()=>setBulkReplacement(false)}><TrackingReplacementSheet onDone={refresh}/></Modal>}

    {(role==="ADMIN"||role==="SALES")&&importKind&&<Modal size="compact" title={importKind==="costs"?"Import Supplier Costs":importKind==="tracking_updates"?"Import đổi Tracking & Label":importKind==="balance"?"Import Balance":role==="ADMIN"?"Import Orders Admin":"Import Orders Sales"} onClose={()=>setImportKind(null)}>
      <div className="importModalContent">
        {importKind==="orders"&&<ImportCard kind="orders" title="Orders Admin" detail="Import nhiều Order với đầy đủ field vận hành và finance." templateHref="/templates/dmd-admin-orders.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="sales_orders"&&<ImportCard kind="sales_orders" title="Orders Sales" detail="Import nhiều Order của account đang đăng nhập; không nhận field finance Admin." templateHref="/templates/dmd-sales-orders.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="costs"&&<ImportCard kind="costs" title="Supplier Costs" detail="True cost, surcharge và import tax theo Tracking." templateHref="/templates/dmd-supplier-costs.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="tracking_updates"&&<ImportCard kind="tracking_updates" title="Đổi Tracking & Label" detail="Match Tracking cũ, giữ lịch sử và thay bằng Tracking/Label mới." templateHref="/templates/dmd-tracking-updates.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="balance"&&<ImportCard kind="balance" title="Balance" detail="Payment, service cost và error adjustments." templateHref="/templates/dmd-balance.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
      </div>
    </Modal>}

    {role==="ADMIN"&&purchaseOrder&&<Modal size="wide" title="Xử lý mua đơn & Tracking" onClose={()=>setPurchaseOrder(null)}><PurchaseOrderPanel order={purchaseOrder} enums={enums} onClose={()=>setPurchaseOrder(null)} onDone={refresh}/></Modal>}

    {role!=="CLIENT"&&entry&&<Modal size="fullscreen" title={editOrder?"Chỉnh sửa Order":entry==="order"?"Tạo Orders":entry==="cost"?"Nhập Supplier Cost":"Ghi Balance"} onClose={closeEntry}>
      {entry==="order"&&<QuickOrderSheet role={role} clients={clients} enums={enums} onDone={entryDone} edit={editOrder}/>}
      {entry==="cost"&&role==="ADMIN"&&<CostSheet enums={enums} onDone={entryDone}/>}
      {entry==="balance"&&(role==="ADMIN"||role==="SALES")&&<BalanceSheet clients={clients} role={role} onDone={entryDone}/>}
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
  return <main className="authPage"><form className="authCard" onSubmit={submit}><span className="eyebrow">DMD · FINANCE OPS</span><h1>{setup?"Tạo Admin đầu tiên":"Đăng nhập"}</h1><p>{setup?"Khởi tạo tài khoản quản trị. Sau đó Admin sẽ tạo các tài khoản vận hành.":"Dùng tài khoản Admin, Sales, Client hoặc Nhân viên kho được cấp."}</p>
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

function Table({rows,cols,onView,onEdit,onPurchase,compact=false,selectedIds=[],onSelect,canEdit}:{rows:RowData[];cols:string[];onView?:(row:RowData)=>void;onEdit?:(row:RowData)=>void;onPurchase?:(row:RowData)=>void;compact?:boolean;selectedIds?:number[];onSelect?:(id:number,checked:boolean)=>void;canEdit?:(row:RowData)=>boolean}){
  const label=(c:string)=>({
    draft_state:"Nhóm Draft",failure_reason:"Lý do đặt thất bại",workflow_status:"Trạng thái",created_at:"Ngày",system_order_code:"DMD ID",sales:"Sales",customer:"Khách",supplier:"Supplier",service:"Dịch vụ",item:"Sản phẩm",
    sub_service:"Sub-service",tracking:"Tracking / Label",order_id:"Client Order ID",chargeable_weight:"Hạng cân (kg)",est_net_cost:"Net Cost Est",true_net_cost:"Net Cost True",
    base_cost:"Base Cost",retail:"Retail Price",sales_price:"Giá bán",surcharge:"Phụ phí",import_tax:"Thuế NK",extra_surcharge:"Phụ phí PS",extra_import_tax:"Thuế NK PS",
    total_due:"Giá tổng",gross_margin_pct:"Margin %",margin_status:"Margin",reconciliation_status:"Reconcile",
    reconciliation_delta:"Delta",occurred_at:"Ngày",entry_type:"Loại",direction:"Chiều",amount:"Số tiền",
    reference_type:"Ref type",reference_id:"Reference",total_net_cost:"Total Net",matched:"Link",
  } as Record<string,string>)[c]||c.replace(/_/g," ");

  const statusClass=(v:unknown)=>{
    const x=String(v||"");
    if(["REVIEW","LOW_MARGIN","Waiting","DEBIT"].includes(x))return "status badStatus";
    if(["PASS","OK","Linked","CREDIT","RECONCILED","PURCHASED"].includes(x))return "status goodStatus";
    if(["PENDING_PURCHASE","PURCHASING","PENDING"].includes(x))return "status neutralStatus";
    return "";
  };

  const hasActions=Boolean(onView||onEdit||onPurchase);
  return <div className={compact?"tableWrap compactTable":"tableWrap"}><table><thead><tr>{onSelect&&<th>Chọn</th>}{hasActions&&<th>Thao tác</th>}{cols.map(c=><th key={c} className={["amount","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","extra_surcharge","extra_import_tax","total_due","reconciliation_delta","total_net_cost","gross_margin_pct","chargeable_weight"].includes(c)?"numericCell":undefined}>{label(c)}</th>)}</tr></thead><tbody>
    {rows.length===0?<tr><td colSpan={cols.length+(hasActions?1:0)+(onSelect?1:0)} className="empty">Chưa có dữ liệu.</td></tr>
    :rows.map((r,i)=><tr key={String(r.id||r.tracking||r.order_id||i)}>
      {onSelect&&<td><input type="checkbox" aria-label={`Chọn Draft ${r.order_id||r.draft_id}`} checked={selectedIds.includes(Number(r.draft_id))} onChange={e=>onSelect(Number(r.draft_id),e.target.checked)}/></td>}
      {hasActions&&<td className="actionCell"><div className="rowActions">{onView&&<button className="rowAction" onClick={()=>onView(r)}>View</button>}{onEdit&&(!canEdit||canEdit(r))&&r.workflow_status!=="CANCELLED"&&<button className="rowAction" onClick={()=>onEdit(r)}>Sửa</button>}{onPurchase&&r.workflow_status!=="CANCELLED"&&<button className="rowAction primaryRowAction" onClick={()=>onPurchase(r)}>{Number(r.tracking_count||0)>0?"Tracking":"Mua đơn"}</button>}</div></td>}
      {cols.map(c=>{
        if(c==="workflow_status"&&r.pricing_eligibility_json&&!r.service_purchased_at){
          let eligibility:{eligible?:boolean;reasons?:string[]}={};try{eligibility=JSON.parse(String(r.pricing_eligibility_json))}catch{}
          if(eligibility.eligible===false)return <td key={c}><span className="status badStatus" title={eligibility.reasons?.join(" ")}>Không đủ điều kiện mua dịch vụ</span></td>;
        }
        const v=c==="draft_state"?({incomplete:"Chưa hoàn tất",failed:"Đặt thất bại",eligible:"Đủ điều kiện",support:"Cần hỗ trợ"} as Record<string,string>)[String(r[c])]:r[c];
        const isMoney=["amount","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","extra_surcharge","extra_import_tax","total_due","reconciliation_delta","total_net_cost"].includes(c);
        const isStatus=["workflow_status","margin_status","reconciliation_status","direction","matched"].includes(c);
        const display=c==="matched"?(Number(v)?"Linked":"Waiting"):isMoney?money(v):["created_at","occurred_at"].includes(c)?(v?displayDate(v):"—"):String(v??"—");
        if(c==="tracking"){
          let trackingRows:Array<{id?:number;tracking?:string;label_url?:string;status?:string;lot_number?:number}>=[];
          try{trackingRows=JSON.parse(String(r.tracking_data||"[]"))}catch{}
          const active=trackingRows.filter(row=>row.status==="ACTIVE"||!row.status);
          if(!active.length)return <td key={c}>—</td>;
          return <td key={c}><details className="trackingCell"><summary>{active[0].tracking}{active.length>1?` +${active.length-1}`:""}</summary><div>{active.map(row=><span key={row.id||row.tracking}><b>Lô {row.lot_number||1}</b>{row.tracking}{row.label_url&&<a href={row.label_url} target="_blank" rel="noreferrer">Label ↗</a>}</span>)}</div></details></td>;
        }
        return <td key={c} className={isMoney||["gross_margin_pct","chargeable_weight"].includes(c)?"numericCell":undefined}>{isStatus?<span className={statusClass(display)}>{display}</span>:display}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}
