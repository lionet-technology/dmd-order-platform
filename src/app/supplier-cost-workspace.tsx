"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
type Row=Record<string,unknown>;
export function SupplierCostWorkspace({role,initialSupplier=""}:{role:string;initialSupplier?:string}){
 const [rows,setRows]=useState<Row[]>([]),[suppliers,setSuppliers]=useState<string[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[query,setQuery]=useState(""),[supplierFilter,setSupplierFilter]=useState(initialSupplier),[statusFilter,setStatusFilter]=useState(""),[page,setPage]=useState(1),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(1),[loading,setLoading]=useState(false);
 const listRequest=useRef(0);
 const [importStatus,setImportStatus]=useState("OPEN");
 const canReview=role==="ADMIN"||role==="FINANCE";
 const load=useCallback(async()=>{const request=++listRequest.current;setLoading(true);try{
 const params=new URLSearchParams({pageSize:"50",page:String(page),q:query,supplier:supplierFilter,status:statusFilter,import_status:importStatus});
 const response=await fetch("/api/costs?"+params),data=await response.json();if(!response.ok)throw Error(data.error);if(request!==listRequest.current)return;setRows(data.items);setTotal(data.total);setTotalPages(data.totalPages);
 const enums=await fetch("/api/enums"),list=await enums.json();if(enums.ok)setSuppliers(list.filter((r:Row)=>r.enum_type==="SUPPLIER"&&r.active!==0).map((r:Row)=>String(r.value)));
 }catch(e){if(request===listRequest.current)setError((e as Error).message)}finally{if(request===listRequest.current)setLoading(false)}},[page,query,supplierFilter,statusFilter,importStatus]);
 useEffect(()=>{void load()},[load]);
 async function save(event:FormEvent<HTMLFormElement>){
 event.preventDefault();setBusy(true);setError("");const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
 try{const response=await fetch("/api/costs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...values,total_net_cost:Number(values.total_net_cost)})}),data=await response.json();if(!response.ok)throw Error(data.error);setNotice(data.warning||"Đã lưu Supplier Cost.");form.reset();await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function importCost(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");setNotice("");const form=event.currentTarget,body=new FormData(form);body.set("kind","costs");try{const response=await fetch("/api/import",{method:"POST",body}),data=await response.json();if(!response.ok)throw Error(data.error);setNotice(["Đã nhập "+data.imported+" dòng chi phí.",...data.warnings].join("\n"));form.reset();await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function review(row:Row,decision:"KEEP_OLD"|"ACCEPT_NEW"){
   setBusy(true);setError("");setNotice("");
   try{
     const response=await fetch("/api/costs",{method:"PATCH",headers:{"content-type":"application/json"},
       body:JSON.stringify({id:row.id,decision,previous_ids:String(row.previous_ids??"")})});
     const data=await response.json();
     if(!response.ok)throw Error(data.error);
     setNotice(decision==="KEEP_OLD"?"Đã giữ giá cũ.":"Đã nhận giá mới.");
   }catch(error){setError((error as Error).message)}
   finally{await load();setBusy(false)}
 }
 return <section className="panel"><h2>Chứng từ Supplier Cost</h2>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status" style={{whiteSpace:"pre-line"}}>{notice}</p>}
 <a href="/templates/dmd-supplier-costs.xlsx" download>Tải template Supplier Cost</a><form onSubmit={importCost} className="settingsActions"><label className="field">File đối soát Supplier (.xlsx, tối đa 10 MB)<input type="file" name="file" accept=".xlsx" required/></label><button className="secondaryBtn" disabled={busy}>Nhập Excel chi phí</button></form><form onSubmit={save} className="settingsGrid">
 <label className="field">Tracking<input name="tracking" required/></label>
 <label className="field">Supplier<select name="supplier" required defaultValue={supplierFilter} key={supplierFilter}><option value="">Chọn Supplier</option>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label>
 <label className="field">Actual Net (USD)<input name="total_net_cost" type="number" min="0" step="0.01" required/></label>
 <label className="field">Ngày chứng từ<input name="occurred_at" type="date" required/></label>
 <label className="field">Mã chứng từ / request key<input name="source_key" required/></label>
 <label className="field">Ghi chú<input name="note"/></label><button className="primaryBtn" disabled={busy}>{busy?"Đang lưu…":"Ghi Supplier Cost"}</button></form>
 <form className="financeFilters" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim())}}>
 <label className="field">Tìm chi phí<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Order, DMD ID, Tracking, khách hàng…"/></label>
 <label className="field">Lọc Supplier<select value={supplierFilter} onChange={e=>{setPage(1);setSupplierFilter(e.target.value)}}><option value="">Tất cả Supplier</option>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label>
 <label className="field">Lọc trạng thái chi phí<select value={statusFilter} onChange={e=>{setPage(1);setStatusFilter(e.target.value)}}><option value="">Tất cả trạng thái</option><option value="PENDING">Pending</option><option value="REVIEW">Review</option><option value="PASS">Pass</option><option value="UNMATCHED">Chưa ghép Order</option></select></label><label className="field">Trạng thái nhập<select value={importStatus} onChange={e=>{setPage(1);setStatusFilter("");setImportStatus(e.target.value)}}>
 <option value="OPEN">Đang áp dụng và chờ xử lý</option><option value="PENDING">Chờ xử lý trùng</option><option value="ACTIVE">Đang áp dụng</option><option value="DISCARDED">Đã bỏ giá mới</option><option value="REPLACED">Giá cũ đã thay</option>
 </select></label><button className="secondaryBtn" disabled={loading}>Tìm</button></form>
 <p role="status">{loading?"Đang tải chi phí…":total+" dòng chi phí phù hợp"}</p>
 <div className="tableWrap"><table><thead><tr>{["Order / DMD ID","Lot","Khách","Tracking","Supplier","Giá chứng từ (USD)","Reconciliation","Trạng thái nhập"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??i)}><td>{String(row.order_id||"Chưa ghép Order")}<small>{String(row.system_order_code||"")}</small></td>{["lot_number","customer","tracking","supplier","total_net_cost","reconciliation_status"].map(k=><td key={k}>{String(row[k]|| (row[k]===0?0:"—"))}</td>)}
 <td>{row.import_status==="PENDING"?<>
   <strong>Pending</strong>{String(row.previous_ids??"").includes(",")&&<small>Nhận giá mới sẽ thay mọi dòng đang áp dụng của Tracking này.</small>}<div>Giá đang áp dụng: {row.previous_total==null?"—":Number(row.previous_total).toFixed(2)} USD</div>
   {canReview&&<div className="settingsActions">
     <button className="secondaryBtn" disabled={busy} onClick={()=>void review(row,"KEEP_OLD")}>Giữ giá cũ</button>
     <button className="primaryBtn" disabled={busy} onClick={()=>void review(row,"ACCEPT_NEW")}>Nhận giá mới</button>
   </div>}
 </>:<>{row.import_status==="DISCARDED"?"Đã bỏ giá mới":row.import_status==="REPLACED"?"Giá cũ đã thay":"Đang áp dụng"}
   {typeof row.resolved_at==="string"&&<small>{row.resolved_at} · {String(row.resolved_by||"")}</small>}
 </>}</td></tr>)}</tbody></table></div>
 {!loading&&!rows.length&&<p>Không có chi phí phù hợp bộ lọc.</p>}
 <div className="financePagination"><button className="secondaryBtn" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Chi phí: trang trước</button><span>Trang {page} / {totalPages}</span><button className="secondaryBtn" disabled={loading||page>=totalPages} onClick={()=>setPage(p=>p+1)}>Chi phí: trang sau</button></div></section>;
}
