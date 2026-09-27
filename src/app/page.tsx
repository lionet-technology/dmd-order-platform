"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Role = "ADMIN" | "SALES";
type User = { id:number; username:string; display_name:string; role:Role; active?:number; is_root_admin?:number };
type RowData = Record<string, string | number | null>;
type PagedRows = { items:RowData[]; total:number; page:number; pageSize:number; totalPages:number };
type AppSection = "dashboard"|"orders"|"costs"|"recon"|"ledger"|"accounts"|"masterdata";
type Summary = { orders:number; review:number; unmatched:number; ledger:number; receivable:number };
type ManualKind = "order" | "cost" | "balance";
type ImportKind = "orders"|"sales_orders"|"costs"|"balance";
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
  const filtered=options.filter(o=>!normalized||o.label.toLowerCase().includes(normalized)||o.value.toLowerCase().includes(normalized));
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

function EnumField({
  label,name,value,onChange,options,type,parent="",required=false,wide=false,existingValue="",
}:{
  label:string;name:string;value:string;onChange:(name:string,value:string)=>void;
  options:Array<{value:string;label:string}>;type:EnumType;parent?:string;required?:boolean;wide?:boolean;existingValue?:string;
}) {
  const exactExisting=existingValue&&value.trim().toLowerCase()===existingValue.trim().toLowerCase();
  const valid=!value.trim()||options.some(o=>o.value.toLowerCase()===value.trim().toLowerCase())||Boolean(exactExisting);
  return <label className={wide?"field wide":"field"}>
    <span>{label}{required&&<b> *</b>}</span>
    <SmartSelect value={value} onChange={v=>onChange(name,v)} options={options} invalid={!valid} placeholder="Nhập hoặc chọn"/>
    {!valid&&<small className="fieldError">{ENUM_LABELS[type]} không hợp lệ{parent?` cho ${parent}`:""}.</small>}
  </label>;
}

function DateField({label,name,value,onChange,required=false}:{
  label:string;name:string;value:string;onChange:(name:string,value:string)=>void;required?:boolean;
}) {
  const invalid=Boolean(value)&&!isValidDateText(value);
  return <label className="field">
    <span>{label}{required&&<b> *</b>}</span>
    <input
      name={name}
      type="text"
      inputMode="numeric"
      value={value}
      placeholder="dd/mm/yyyy"
      required={required}
      className={invalid?"inputError":""}
      onChange={e=>onChange(name,e.target.value)}
    />
    {invalid&&<small className="fieldError">Ngày không hợp lệ, dùng dd/mm/yyyy.</small>}
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

function QuickOrderSheet({role,salesUsers,enums,onDone,edit}:{role:Role;salesUsers:User[];enums:EnumRow[];onDone:()=>void;edit?:RowData|null}) {
  const blankRow=():SheetRow=>({
    created_at:"",sales_user_id:"",customer:"",order_id:"",service:"",sub_service:"",item:"",
    carton_count:"",weight:"",length:"",width:"",height:"",recipient_name:"",city:"",state:"",
    zip:"",country:"",note:"",supplier:"",tracking:"",label:"",est_net_cost:"",base_cost:"",retail:"",discount:"",sales_price:"",auto_pricing:"1",surcharge:"",import_tax:"",
  });
  const editRow=():SheetRow=>{
    const row=blankRow();
    if(!edit)return row;
    Object.keys(row).forEach(key=>{
      const value=edit[key];
      row[key]=value===null||value===undefined?"":key==="created_at"?displayDate(value):String(value);
    });
    row.id=String(edit.id||"");
    return row;
  };
  const [rows,setRows]=useState<SheetRow[]>(()=>edit?[editRow()]:Array.from({length:8},blankRow));
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState("");
  const [errors,setErrors]=useState<Record<number,string>>({});
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
  const serviceOptions=enumOptions(enums,"SERVICE");
  const countryOptions=enumOptions(enums,"COUNTRY");
  const supplierOptions=enumOptions(enums,"SUPPLIER");

  const common:SheetColumn[]=[
    {key:"created_at",label:"Ngày",width:118,type:"dateText"},{key:"customer",label:"Khách *",width:150},
    {key:"order_id",label:"Order ID *",width:135},{key:"service",label:"Dịch vụ",width:140,type:"combo",options:serviceOptions},
    {key:"sub_service",label:"Sub-Service",width:140,type:"combo"},{key:"item",label:"Mặt hàng",width:135},
    {key:"carton_count",label:"Carton",width:75,type:"number"},{key:"weight",label:"Kg",width:72,type:"number"},
    {key:"length",label:"Dài",width:72,type:"number"},{key:"width",label:"Rộng",width:72,type:"number"},
    {key:"height",label:"Cao",width:72,type:"number"},{key:"recipient_name",label:"Người nhận",width:145},
    {key:"city",label:"Thành phố",width:115},{key:"state",label:"Bang",width:90},{key:"zip",label:"ZIP",width:90},
    {key:"country",label:"Nước",width:100,type:"combo",options:countryOptions},{key:"note",label:"Note",width:180},
  ];
  const columns:SheetColumn[]=role==="ADMIN"?[
    {key:"sales_user_id",label:"Sales",width:180,type:"combo",options:[{value:"",label:"— Chọn / nhập Sales —"},...salesUsers.map(u=>({value:String(u.id),label:u.display_name+" (@"+u.username+")"}))]},
    ...common,
    {key:"supplier",label:"Supplier",width:130,type:"combo",options:supplierOptions},{key:"tracking",label:"Tracking",width:145},{key:"label",label:"Label URL",width:190},
    {key:"est_net_cost",label:"Est. Net",width:90,type:"number"},{key:"auto_pricing",label:"Auto Pricing",width:105,type:"combo",options:[{value:"1",label:"Auto"},{value:"0",label:"Manual"}]},
    {key:"base_cost",label:"Base Cost",width:90,type:"number"},{key:"retail",label:"Retail",width:90,type:"number"},{key:"discount",label:"Discount %",width:90,type:"number"},{key:"sales_price",label:"Sales Price",width:95,type:"number"},
    {key:"surcharge",label:"Phụ phí",width:90,type:"number"},{key:"import_tax",label:"Thuế NK",width:90,type:"number"},
  ]:common;

  const dirty=(row:SheetRow)=>Object.entries(row).some(([key,v])=>key!=="created_at"&&String(v||"").trim()!=="");
  const activeRows=rows.map((row,index)=>({row,index})).filter(x=>dirty(x.row));

  function updateCell(rowIndex:number,key:string,value:string){
    setRows(prev=>prev.map((r,i)=>i===rowIndex?{...r,[key]:value}:r));
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
      else if(row.created_at&&!isValidDateText(row.created_at))invalid[index]="Ngày phải đúng dd/mm/yyyy";
      else if(row.service&&!enumIsValid(enums,"SERVICE",row.service))invalid[index]="Dịch vụ không hợp lệ";
      else if(row.sub_service&&!enumIsValid(enums,"SUB_SERVICE",row.sub_service,row.service))invalid[index]="Sub-Service không hợp lệ";
      else if(row.country&&!enumIsValid(enums,"COUNTRY",row.country))invalid[index]="Nước không hợp lệ";
      else if(row.supplier&&!enumIsValid(enums,"SUPPLIER",row.supplier))invalid[index]="Supplier không hợp lệ";
    });
    if(Object.keys(invalid).length){setErrors(invalid);setMsg("Có dòng thiếu dữ liệu bắt buộc.");return;}
    setBusy(true);setMsg("");setErrors({});
    const results=await Promise.all(activeRows.map(async({row,index})=>{
      try{
        await postJson("/api/orders",{...row,created_at:row.created_at||today(),service:row.service||"ePacket",country:row.country||"US",auto_pricing:row.auto_pricing||"1",id:row.id||undefined});
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
            const options=col.key==="sub_service"?enumOptions(enums,"SUB_SERVICE",row.service):(col.options||[]);
            const enumType:EnumType|undefined=col.key==="service"?"SERVICE":col.key==="sub_service"?"SUB_SERVICE":col.key==="supplier"?"SUPPLIER":col.key==="country"?"COUNTRY":undefined;
            const invalidEnum=Boolean(enumType&&row[col.key]&&!enumIsValid(enums,enumType,row[col.key],enumType==="SUB_SERVICE"?row.service:""));
            return <td key={col.key} className="sheetCell">
            {col.type==="combo"
              ? <SmartSelect
                  value={row[col.key]||""}
                  onChange={v=>updateCell(r,col.key,v)}
                  options={options}
                  placeholder="Nhập hoặc chọn"
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
  function clone(index:number){setRows(prev=>{const n=[...prev];n.splice(index+1,0,{...prev[index]});return n})}
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
    const results=await Promise.all(active.map(async({row,index})=>{try{await save(row);return{index,ok:true as const}}catch(error){return{index,ok:false as const,error:error instanceof Error?error.message:"Không thể lưu"}}}));
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
    {key:"import_tax",label:"Thuế NK",width:90,type:"number"},{key:"note",label:"Note",width:180},
  ];
  const blank=()=>({occurred_at:today(),tracking:"",supplier:"",service:"",sub_service:"",net_price:"",fee:"",export_customs:"",import_customs:"",total_net_cost:"",extra_surcharge:"",import_tax:"",note:""});
  return <EntrySheet title="Nhập Supplier Cost" hint="Paste nhiều dòng · Tracking là khóa link Order" columns={columns} blank={blank} storageKey="dmd.costSheetWidths"
    optionsFor={(row,col)=>col.key==="sub_service"?enumOptions(enums,"SUB_SERVICE",row.service):(col.options||[])}
    validate={row=>!row.tracking.trim()?"Thiếu Tracking":row.occurred_at&&!isValidDateText(row.occurred_at)?"Ngày sai định dạng":row.service&&!enumIsValid(enums,"SERVICE",row.service)?"Dịch vụ không hợp lệ":row.sub_service&&!enumIsValid(enums,"SUB_SERVICE",row.sub_service,row.service)?"Sub-Service không hợp lệ":row.supplier&&!enumIsValid(enums,"SUPPLIER",row.supplier)?"Supplier không hợp lệ":""}
    save={row=>postJson("/api/costs",row)} onDone={onDone}/>;
}

const BALANCE_TYPES=[
  {value:"PAYMENT",label:"Payment (+)"},{value:"REFUND",label:"Refund (+)"},{value:"SERVICE_COST",label:"Service Cost (-)"},
  {value:"ERROR_PROCESSING",label:"Processing (+)"},{value:"ERROR_REFUND",label:"Error Refund (+)"},{value:"ERROR_CHARGEABLE",label:"Chargeable (-)"},
  {value:"ADJUSTMENT_CREDIT",label:"Adjustment Credit (+)"},{value:"ADJUSTMENT_DEBIT",label:"Adjustment Debit (-)"},
];
function BalanceSheet({onDone}:{onDone:()=>void}){
  const columns:SheetColumn[]=[
    {key:"occurred_at",label:"Ngày",width:115,type:"dateText"},{key:"entry_type",label:"Hạng mục *",width:165,type:"combo",options:BALANCE_TYPES},
    {key:"amount",label:"Số tiền *",width:100,type:"number"},{key:"customer",label:"Customer/User",width:150},
    {key:"reference_type",label:"Reference type",width:125},{key:"reference_id",label:"Reference ID",width:145},
    {key:"bill_url",label:"Bill URL",width:200},{key:"note",label:"Note",width:200},
  ];
  const blank=()=>({occurred_at:today(),entry_type:"PAYMENT",amount:"",customer:"",reference_type:"MANUAL",reference_id:"",bill_url:"",note:""});
  const credit=new Set(["PAYMENT","REFUND","ERROR_REFUND","ERROR_PROCESSING","ADJUSTMENT_CREDIT"]);
  return <EntrySheet title="Ghi Balance" hint="Paste nhiều dòng · CREDIT/DEBIT tự suy ra từ hạng mục" columns={columns} blank={blank} storageKey="dmd.balanceSheetWidths"
    validate={row=>row.occurred_at&&!isValidDateText(row.occurred_at)?"Ngày sai định dạng":!BALANCE_TYPES.some(x=>x.value===row.entry_type)?"Hạng mục không hợp lệ":!row.amount||Number(row.amount)<=0?"Số tiền phải > 0":""}
    save={row=>postJson("/api/ledger",{...row,direction:credit.has(row.entry_type)?"CREDIT":"DEBIT"})} onDone={onDone}/>;
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
        <SelectField label="Role" name="role" value={form.role} onChange={(n,v)=>setForm(x=>({...x,[n]:v}))} allowCustom={false} requireOption options={[{value:"SALES",label:"Sales"},{value:"ADMIN",label:"Admin"}]}/>
      </div>
      <div className="formFooter"><span className={msg.startsWith("Lỗi")?"inlineMsg error":"inlineMsg"}>{msg}</span><button className="primaryBtn" disabled={busy}>{busy?"Đang tạo…":"Tạo tài khoản"}</button></div>
    </form>
    <div className="dataToolbar accountsToolbar"><SearchBar value={accountSearch} onChange={setAccountSearch} placeholder="Tìm tên, username, role..."/><span>{filteredUsers.length} accounts</span></div>
    <div className="tableWrap accountTable"><table><thead><tr><th>Tên</th><th>Username</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visibleUsers.map(u=><tr key={u.id}><td>{u.display_name}{u.is_root_admin?<span className="rootBadge">ROOT</span>:null}</td><td>@{u.username}</td><td>{u.role}</td><td><span className={u.active?"status goodStatus":"status badStatus"}>{u.active?"Active":"Locked"}</span></td><td>
        <button className="editBtn" disabled={Boolean(u.is_root_admin)||u.id===currentUser.id} onClick={()=>void patchUser(u.id,{active:!u.active})}>{u.is_root_admin?"Protected":u.active?"Khóa":"Mở"}</button>
        <button className="editBtn" disabled={Boolean(u.is_root_admin)&&u.id!==currentUser.id} onClick={()=>{const pw=window.prompt("Mật khẩu mới (ít nhất 8 ký tự)");if(pw)void patchUser(u.id,{password:pw})}}>Reset PW</button>
      </td></tr>)}
    </tbody></table></div>
    <Pager data={{items:[],total:filteredUsers.length,page:accountPage,pageSize:accountPageSize,totalPages:accountTotalPages}} onPage={setAccountPage}/>
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

function Platform({user,onLogout}:{user:User;onLogout:()=>void}) {
  const role=user.role;
  const [summary,setSummary]=useState<Summary|null>(null);
  const [users,setUsers]=useState<User[]>([]);
  const [enums,setEnums]=useState<EnumRow[]>([]);
  const [allEnums,setAllEnums]=useState<EnumRow[]>([]);
  const [section,setSection]=useState<AppSection>("dashboard");
  const [data,setData]=useState<PagedRows>({items:[],total:0,page:1,pageSize:20,totalPages:1});
  const [recent,setRecent]=useState<RowData[]>([]);
  const [page,setPage]=useState(1);
  const [search,setSearch]=useState("");
  const [debouncedSearch,setDebouncedSearch]=useState("");
  const [loading,setLoading]=useState(false);
  const [entry,setEntry]=useState<ManualKind|null>(null);
  const [editOrder,setEditOrder]=useState<RowData|null>(null);
  const [importKind,setImportKind]=useState<ImportKind|null>(null);
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

  useEffect(()=>{void loadSummary();void loadUsers();void loadEnums();void loadRecent()},[loadSummary,loadUsers,loadEnums,loadRecent]);
  useEffect(()=>{if(["orders","costs","recon","ledger"].includes(section))void loadSection(section,page,debouncedSearch)},[section,page,debouncedSearch,loadSection]);

  const refresh=useCallback(async()=>{
    await Promise.all([loadSummary(),loadUsers(),loadEnums(),loadRecent()]);
    if(["orders","costs","recon","ledger"].includes(section))await loadSection(section,page,debouncedSearch);
  },[loadSummary,loadUsers,loadEnums,loadRecent,loadSection,section,page,debouncedSearch]);

  function navigate(next:AppSection){
    setSection(next);setSearch("");setPage(1);
  }
  function openEntry(kind:ManualKind,row?:RowData){
    setEditOrder(row||null);
    setEntry(kind);
  }
  function closeEntry(){setEntry(null);setEditOrder(null)}
  async function entryDone(){closeEntry();await refresh()}
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});onLogout()}

  const orderCols=role==="ADMIN"
    ?["workflow_status","created_at","sales","customer","service","tracking","order_id","true_net_cost","sales_price","total_due","margin_status","reconciliation_status"]
    :["workflow_status","created_at","customer","service","sub_service","order_id","total_due"];

  const nav:Array<{key:AppSection;label:string;icon:string;admin?:boolean}>=[
    {key:"dashboard",label:"Tổng quan",icon:"⌂"},
    {key:"orders",label:"Orders",icon:"▤"},
    {key:"costs",label:"Supplier Costs",icon:"$ ",admin:true},
    {key:"recon",label:"Reconciliation",icon:"✓",admin:true},
    {key:"ledger",label:"Balance Ledger",icon:"≋",admin:true},
    {key:"masterdata",label:"Danh mục",icon:"☷",admin:true},
    {key:"accounts",label:"Tài khoản",icon:"♙",admin:true},
  ];

  const titleMap:Record<AppSection,string>={
    dashboard:"Tổng quan",orders:"Orders",costs:"Supplier Costs",
    recon:"Reconciliation",ledger:"Balance Ledger",masterdata:"Danh mục",accounts:"Tài khoản",
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
              {role==="ADMIN"&&<button onClick={()=>openEntry("cost")}><i>$</i><div><b>Nhập Supplier Cost</b><span>Reconcile theo Tracking</span></div></button>}
              {role==="ADMIN"&&<button onClick={()=>openEntry("balance")}><i>≋</i><div><b>Ghi Balance</b><span>Payment / Refund / Adjustment</span></div></button>}
            </div>
          </section>
        </>}

        {section==="orders"&&<>
          <PageHeader eyebrow="OPERATIONS" title="Orders" description={role==="ADMIN"?"Quản lý toàn bộ đơn hàng và trạng thái xử lý.":"Quản lý các order thuộc tài khoản của bạn."}
            actions={<><button className="secondaryBtn" onClick={()=>setImportKind(role==="ADMIN"?"orders":"sales_orders")}>⇩ Import</button><button className="primaryBtn" onClick={()=>openEntry("order")}>＋ Tạo Order</button></>}/>
          <div className="panel dataPanel">
            <div className="dataToolbar orderToolbar">
              <SearchBar value={search} onChange={setSearch} placeholder="Tìm Order ID, Tracking, khách hàng, dịch vụ..."/>
              <div className="orderFilters">
                <SmartSelect compact value={orderFilters.status} onChange={v=>setOrderFilters(x=>({...x,status:v}))} options={[{value:"",label:"Mọi trạng thái"},{value:"SALES_DRAFT",label:"Sales draft"},{value:"TRACKING_ASSIGNED",label:"Tracking assigned"},{value:"ADMIN_READY",label:"Admin ready"},{value:"RECONCILED",label:"Reconciled"}]}/>
                <SmartSelect compact value={orderFilters.service} onChange={v=>setOrderFilters(x=>({...x,service:v}))} allowCustom={false} options={[{value:"",label:"Mọi dịch vụ"},...enumOptions(enums,"SERVICE")]}/>
                {role==="ADMIN"&&<SmartSelect compact value={orderFilters.salesUserId} onChange={v=>setOrderFilters(x=>({...x,salesUserId:v}))} options={[{value:"",label:"Mọi Sales"},...salesUsers.map(u=>({value:String(u.id),label:u.display_name}))]}/>}
                {role==="ADMIN"&&<SmartSelect compact value={orderFilters.reconcile} onChange={v=>setOrderFilters(x=>({...x,reconcile:v}))} options={[{value:"",label:"Mọi reconcile"},{value:"PASS",label:"PASS"},{value:"REVIEW",label:"REVIEW"}]}/>}
                {(orderFilters.status||orderFilters.service||orderFilters.salesUserId||orderFilters.reconcile)&&<button className="clearFilters" onClick={()=>setOrderFilters({status:"",service:"",salesUserId:"",reconcile:""})}>Xóa lọc</button>}
              </div>
              <span>{data.total} records</span>
            </div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={orderCols} onEdit={row=>openEntry("order",row)}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
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

        {role==="ADMIN"&&section==="ledger"&&<>
          <PageHeader eyebrow="FINANCE" title="Balance Ledger" description="Dòng tiền Credit / Debit và các order charge tự động."
            actions={<><button className="secondaryBtn" onClick={()=>setImportKind("balance")}>⇩ Import</button><button className="primaryBtn" onClick={()=>openEntry("balance")}>＋ Ghi Balance</button></>}/>
          <div className="panel dataPanel">
            <div className="dataToolbar"><SearchBar value={search} onChange={setSearch} placeholder="Tìm loại giao dịch, khách, reference, note..."/><span>{data.total} records</span></div>
            {loading?<div className="loadingState">Đang tải dữ liệu…</div>:<Table rows={data.items} cols={["occurred_at","entry_type","direction","amount","customer","reference_type","reference_id","note"]}/>}
            <Pager data={data} onPage={setPage}/>
          </div>
        </>}

        {role==="ADMIN"&&section==="masterdata"&&<>
          <PageHeader eyebrow="MASTER DATA" title="Danh mục nhập liệu" description="Quản lý Dịch vụ, Sub-Service, Supplier và Nước. Có thể thêm, sửa, deactivate/activate; không xóa dữ liệu lịch sử."/>
          <div className="panel"><EnumManager rows={allEnums} onDone={refresh}/></div>
        </>}

        {role==="ADMIN"&&section==="accounts"&&<>
          <PageHeader eyebrow="ACCESS CONTROL" title="Tài khoản" description="Tạo và quản lý quyền truy cập cho Admin / Sales."/>
          <div className="panel"><UserManager users={users} onDone={refresh} currentUser={user}/></div>
        </>}
      </div>
    </div>

    {importKind&&<Modal size="compact" title={importKind==="costs"?"Import Supplier Costs":importKind==="balance"?"Import Balance":role==="ADMIN"?"Import Orders Admin":"Import Orders Sales"} onClose={()=>setImportKind(null)}>
      <div className="importModalContent">
        {importKind==="orders"&&<ImportCard kind="orders" title="Orders Admin" detail="Import nhiều Order với đầy đủ field vận hành và finance." templateHref="/templates/dmd-admin-orders.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="sales_orders"&&<ImportCard kind="sales_orders" title="Orders Sales" detail="Import nhiều Order của account đang đăng nhập; không nhận field finance Admin." templateHref="/templates/dmd-sales-orders.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="costs"&&<ImportCard kind="costs" title="Supplier Costs" detail="True cost, surcharge và import tax theo Tracking." templateHref="/templates/dmd-supplier-costs.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
        {importKind==="balance"&&<ImportCard kind="balance" title="Balance" detail="Payment, service cost và error adjustments." templateHref="/templates/dmd-balance.xlsx" onDone={()=>{setImportKind(null);void refresh()}}/>}
      </div>
    </Modal>}

    {entry&&<Modal size="fullscreen" title={editOrder?"Chỉnh sửa Order":entry==="order"?"Tạo Orders":entry==="cost"?"Nhập Supplier Cost":"Ghi Balance"} onClose={closeEntry}>
      {entry==="order"&&<QuickOrderSheet role={role} salesUsers={salesUsers} enums={enums} onDone={entryDone} edit={editOrder}/>}
      {entry==="cost"&&role==="ADMIN"&&<CostSheet enums={enums} onDone={entryDone}/>}
      {entry==="balance"&&role==="ADMIN"&&<BalanceSheet onDone={entryDone}/>}
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
        const display=c==="matched"?(Number(v)?"Linked":"Waiting"):isMoney?money(v):["created_at","occurred_at"].includes(c)?(v?displayDate(v):"—"):String(v??"—");
        return <td key={c}>{isStatus?<span className={statusClass(display)}>{display}</span>:display}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}
