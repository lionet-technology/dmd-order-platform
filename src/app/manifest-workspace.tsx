"use client";
import { useRef,useState } from "react";
type Row={tracking_id:number;tracking:string;carton_id:number;system_order_code:string;order_id:string;customer:string;recipient_name:string;service:string;sub_service:string;supplier:string};
export function ManifestScanPanel(){
  const input=useRef<HTMLInputElement>(null);const current=useRef<Row[]>([]);const locked=useRef(false);const pending=useRef<string[]>([]);
  const [exporting,setExporting]=useState(false);
  const [rows,setRows]=useState<Row[]>([]);const [value,setValue]=useState("");const [paste,setPaste]=useState("");const [busy,setBusy]=useState(false);const [messages,setMessages]=useState<string[]>([]);
  async function scan(raw:string){
    pending.current.push(raw);setValue("");if(locked.current)return;locked.current=true;setBusy(true);const notices:string[]=[];
    try{while(pending.current.length){for(const tracking of pending.current.shift()!.split(/[\s,;]+/).filter(Boolean)){
      try{const response=await fetch("/api/manifest-scan",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tracking})});const body=await response.json();if(!response.ok)throw new Error(body.error);
        const row=body.item as Row;if(current.current.some(r=>r.tracking_id===row.tracking_id||r.carton_id===row.carton_id)){notices.push("Trùng tracking/carton: "+tracking);continue}
        current.current=[...current.current,row];setRows(current.current);notices.push("Đã scan: "+row.tracking);
      }catch(error){notices.push("Lỗi: "+(error as Error).message)}
    }}}finally{setMessages(notices);locked.current=false;setBusy(false);input.current?.focus()}
  }
  async function exportFiles(){
    if(locked.current)return;locked.current=true;setBusy(true);setExporting(true);
    try{const response=await fetch("/api/manifest-export",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({trackings:current.current.map(r=>r.tracking)})});if(!response.ok){const body=await response.json();throw new Error(body.error)}
      const url=URL.createObjectURL(await response.blob());const link=document.createElement("a");link.href=url;link.download=response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1]||"Manifest.xlsx";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessages(["Đã xuất Manifest cho "+current.current.length+" tracking. Danh sách được giữ để kiểm tra."]);
    }catch(error){setMessages(["Lỗi: "+(error as Error).message])}finally{locked.current=false;setBusy(false);setExporting(false);input.current?.focus()}
  }
  return <div className="bulkSheet"><p>Scan tracking của kiện thực tế xuất hàng. Chỉ carton vừa scan được đưa vào Manifest.</p><form onSubmit={e=>{e.preventDefault();void scan(value)}}><input ref={input} autoFocus readOnly={exporting} aria-label="Scan Tracking" placeholder="Scan barcode Tracking + Enter" value={value} onChange={e=>setValue(e.target.value)} onPaste={e=>{const raw=e.clipboardData.getData("text");if(/[\n\t]/.test(raw)){e.preventDefault();void scan(raw)}}}/><button className="primaryBtn" disabled={busy||!value.trim()}>Thêm Tracking</button></form><details><summary>Paste nhiều Tracking</summary><textarea aria-label="Paste nhiều Tracking" value={paste} onChange={e=>setPaste(e.target.value)}/><button disabled={busy||!paste.trim()} onClick={()=>void scan(paste)}>Thêm danh sách</button></details><div role="status" aria-live="polite">{messages.map((m,i)=><p key={i}>{m}</p>)}</div><b>Đã scan {rows.length} kiện</b><div className="tableWrap"><table><thead><tr><th>Tracking</th><th>DMD ID</th><th>Client Order ID</th><th>Client / Người nhận</th><th>Service / Sub-Service / Supplier</th><th></th></tr></thead><tbody>{rows.map(row=><tr key={row.tracking_id}><td>{row.tracking}</td><td>{row.system_order_code}</td><td>{row.order_id}</td><td>{row.customer}<small>{row.recipient_name}</small></td><td>{[row.service,row.sub_service,row.supplier].filter(Boolean).join(" / ")}</td><td><button disabled={busy} onClick={()=>{current.current=current.current.filter(r=>r.tracking_id!==row.tracking_id);setRows(current.current);input.current?.focus()}}>Xóa dòng</button></td></tr>)}</tbody></table></div><button className="primaryBtn" disabled={busy||!rows.length} onClick={()=>void exportFiles()}>Xuất Manifest ({rows.length})</button></div>;
}
