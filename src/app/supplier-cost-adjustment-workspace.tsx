"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";

type Adjustment={
  id:number; tracking:string; amount_cents:number; reason:string; status:string; duplicate_of:number|null;
  created_by:string|null; created_at:string; resolved_by:string|null; resolved_at:string|null;
};

const endpoint="/api/costs/adjustments";
const statusLabels:Record<string,string>={PENDING:"Chờ xác nhận",RECORDED:"Đã ghi",CONFIRMED:"Đã xác nhận ghi thêm",SKIPPED:"Đã bỏ qua"};

export function SupplierCostAdjustmentWorkspace(){
  const [items,setItems]=useState<Adjustment[]>([]),[history,setHistory]=useState(false);
  const [page,setPage]=useState(1),[totalPages,setTotalPages]=useState(1);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
  const inFlight=useRef(false),listRequest=useRef(0);
  const requestKeys=useRef(new Map<string|File,string>());
  const load=useCallback(async()=>{
    const request=++listRequest.current;
    try{
      const response=await fetch(endpoint+"?history="+Number(history)+"&page="+page);
      const data=await response.json();
      if(request!==listRequest.current)return;
      if(!response.ok)throw Error(data.error);
      setItems(data.items);setTotalPages(data.totalPages);
    }catch(error){if(request===listRequest.current)setError((error as Error).message)}
  },[history,page]);
  useEffect(()=>{void load()},[load]);

  async function submit(event:FormEvent<HTMLFormElement>,fileUpload:boolean){
    event.preventDefault();
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    const form=event.currentTarget,fields=new FormData(form);
    try{
      const item=Object.fromEntries(fields);
      const selectedFile=form.querySelector<HTMLInputElement>('input[name="file"]')?.files?.[0];
      const fingerprint=fileUpload&&selectedFile?selectedFile:JSON.stringify(item);
      const key=requestKeys.current.get(fingerprint)||Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");
      requestKeys.current.set(fingerprint,key);
      fields.set("request_key",key);
      const response=await fetch(endpoint,{method:"POST",headers:fileUpload?undefined:{"content-type":"application/json"},
        body:fileUpload?fields:JSON.stringify({request_key:key,items:[item]})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error);
      requestKeys.current.delete(fingerprint);
      const pending=data.results.filter((row:{status:string})=>row.status==="PENDING").length;
      setNotice(`Đã ghi ${data.results.length-pending} dòng.${pending?` Có ${pending} dòng trùng Tracking, Cost và Lý do cần xác nhận.`:""}`);
      form.reset();
      if(history||page!==1){setItems([]);setHistory(false);setPage(1)}else await load();
    }catch(error){setError((error as Error).message)}
    finally{inFlight.current=false;setBusy(false)}
  }

  async function resolve(id:number,decision:"RECORD_AGAIN"|"SKIP"){
    if(inFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(endpoint,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,decision})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error);
      setNotice(decision==="SKIP"?"Đã bỏ qua phụ phí trùng.":"Đã xác nhận và ghi thêm phụ phí.");
      if(items.length===1&&page>1)setPage(page-1);else await load();
    }catch(error){setError((error as Error).message)}
    finally{inFlight.current=false;setBusy(false)}
  }

  return <section className="panel">
    <h2>Supplier Cost Adjustment</h2>
    <p>Phụ phí Supplier được cộng vào Actual Cost của Lot theo Tracking.</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form className="settingsActions" onSubmit={event=>void submit(event,false)}>
      <label className="field">Tracking<input name="tracking" required/></label>
      <label className="field">Cost bổ sung (USD)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required/></label>
      <label className="field">Lý do<input name="reason" maxLength={1000} required/></label>
      <button className="primaryBtn" disabled={busy}>Ghi phụ phí</button>
    </form>
    <form className="settingsActions" onSubmit={event=>void submit(event,true)}>
      <a href="/templates/dmd-supplier-cost-adjustments.xlsx" download>Tải template phụ phí</a>
      <label className="field">File phụ phí (.xlsx)<input name="file" type="file" accept=".xlsx" required/></label>
      <button className="secondaryBtn" disabled={busy}>Nhập file phụ phí</button>
    </form>
    <div className="settingsActions">
      <button className={history?"secondaryBtn":"primaryBtn"} onClick={()=>{if(history){setItems([]);setHistory(false);setPage(1)}}}>Chờ xác nhận</button>
      <button className={history?"primaryBtn":"secondaryBtn"} onClick={()=>{if(!history){setItems([]);setHistory(true);setPage(1)}}}>Lịch sử phụ phí</button>
    </div>
    <div className="tableWrap"><table>
      <thead><tr>{["Tracking","Cost bổ sung (USD)","Lý do","Người nhập","Trạng thái"].map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{items.map(row=><tr key={row.status+row.id}>
        <td>{row.tracking}</td><td>{(row.amount_cents/100).toFixed(2)}</td><td>{row.reason}</td>
        <td>{row.created_by}<small>{row.created_at}</small></td>
        <td>{statusLabels[row.status]}{row.duplicate_of&&<small>Trùng khoản #{row.duplicate_of}</small>}
          {row.resolved_at&&<small>{row.resolved_by} · {row.resolved_at}</small>}
          {row.status==="PENDING"&&<div className="settingsActions">
            <button className="secondaryBtn" disabled={busy} onClick={()=>void resolve(row.id,"SKIP")}>Bỏ qua</button>
            <button className="primaryBtn" disabled={busy} onClick={()=>void resolve(row.id,"RECORD_AGAIN")}>Xác nhận ghi thêm</button>
          </div>}
        </td>
      </tr>)}</tbody>
    </table></div>
    {!items.length&&<p>{history?"Chưa có lịch sử phụ phí.":"Không có phụ phí trùng cần xác nhận."}</p>}
    <div className="financePagination">
      <button className="secondaryBtn" disabled={busy||page<=1} onClick={()=>setPage(page-1)}>Trang trước</button>
      <span>Trang {page} / {totalPages}</span>
      <button className="secondaryBtn" disabled={busy||page>=totalPages} onClick={()=>setPage(page+1)}>Trang sau</button>
    </div>
  </section>;
}
