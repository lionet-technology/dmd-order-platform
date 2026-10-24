"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {ReconciliationWorkspace} from "./reconciliation-workspace";
import {RefundWorkspace} from "./refund-workspace";
import {PaymentReconciliationWorkspace} from "./payment-reconciliation-workspace";
import {SupplierAccountWorkspace} from "./supplier-account-workspace";
import {BodFinanceWorkspace} from './bod-finance-workspace';
import {StatementsV2Workspace} from './statements-v2-workspace';
type Row=Record<string,unknown>;
export function FinanceWorkspace({user,onLogout}:{user:{display_name:string;role:string};onLogout:()=>void}){
 const [tab,setTab]=useState("suppliers"),[rows,setRows]=useState<Row[]>([]),[suppliers,setSuppliers]=useState<string[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [search,setSearch]=useState(""),[query,setQuery]=useState(""),[supplierFilter,setSupplierFilter]=useState(""),[statusFilter,setStatusFilter]=useState(""),[page,setPage]=useState(1),[total,setTotal]=useState(0),[totalPages,setTotalPages]=useState(1),[loading,setLoading]=useState(false);
 const listRequest=useRef(0);
 const load=useCallback(async()=>{const request=++listRequest.current;setLoading(true);try{
 const params=new URLSearchParams({pageSize:"50",page:String(page),q:query,supplier:supplierFilter,status:statusFilter});
 const response=await fetch("/api/costs?"+params),data=await response.json();if(!response.ok)throw Error(data.error);if(request!==listRequest.current)return;setRows(data.items);setTotal(data.total);setTotalPages(data.totalPages);
 const enums=await fetch("/api/enums"),list=await enums.json();if(enums.ok)setSuppliers(list.filter((r:Row)=>r.enum_type==="SUPPLIER"&&r.active!==0).map((r:Row)=>String(r.value)));
 }catch(e){if(request===listRequest.current)setError((e as Error).message)}finally{if(request===listRequest.current)setLoading(false)}},[page,query,supplierFilter,statusFilter]);
 useEffect(()=>{void load()},[load]);
 async function save(event:FormEvent<HTMLFormElement>){
 event.preventDefault();setBusy(true);setError("");const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
 try{const response=await fetch("/api/costs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...values,total_net_cost:Number(values.total_net_cost)})}),data=await response.json();if(!response.ok)throw Error(data.error);form.reset();await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function importCost(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");setNotice("");const form=event.currentTarget,body=new FormData(form);body.set("kind","costs");try{const response=await fetch("/api/import",{method:"POST",body}),data=await response.json();if(!response.ok)throw Error(data.error);setNotice("Đã nhập "+data.imported+" dòng chi phí.");form.reset();await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="financeRoleWorkspace"><header className="pageHeader"><div><span className="eyebrow">{user.role}</span><h1>Tài chính Supplier</h1><p>{user.display_name}</p></div><button className="secondaryBtn" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});onLogout()}}>Đăng xuất</button></header>
 <nav className="settingsActions" aria-label="Tài chính Supplier">{[["suppliers","Supplier"],["refunds","Refund Management"],["payments","Payment Reconciliation"],["bod","BOD Finance"],["statements","Statement"]].map(([id,label])=><button className={tab===id?"primaryBtn":"secondaryBtn"} key={id} onClick={()=>{setTab(id);setNotice("");setError("")}}>{label}</button>)}</nav>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {tab==="costs"&&<section className="panel"><button className="secondaryBtn" onClick={()=>setTab("suppliers")}>← Tổng quan Supplier</button><h2>Chứng từ Cost · {supplierFilter}</h2><form onSubmit={importCost} className="settingsActions"><label className="field">File đối soát Supplier (.xlsx, tối đa 10 MB)<input type="file" name="file" accept=".xlsx" required/></label><button className="secondaryBtn" disabled={busy}>Nhập Excel chi phí</button></form><form onSubmit={save} className="settingsGrid">
 <label className="field">Tracking<input name="tracking" required/></label>
 <label className="field">Supplier<select name="supplier" required defaultValue={supplierFilter} key={supplierFilter}><option value="">Chọn Supplier</option>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label>
 <label className="field">Actual Net (USD)<input name="total_net_cost" type="number" min="0" step="0.01" required/></label>
 <label className="field">Ngày chứng từ<input name="occurred_at" type="date" required/></label>
 <label className="field">Mã chứng từ / request key<input name="source_key" required/></label>
 <label className="field">Ghi chú<input name="note"/></label><button className="primaryBtn" disabled={busy}>{busy?"Đang lưu…":"Ghi Supplier Cost"}</button></form>
 <form className="financeFilters" onSubmit={e=>{e.preventDefault();setPage(1);setQuery(search.trim())}}>
 <label className="field">Tìm chi phí<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Order, DMD ID, Tracking, khách hàng…"/></label>
 <label className="field">Lọc Supplier<select value={supplierFilter} onChange={e=>{setPage(1);setSupplierFilter(e.target.value)}}><option value="">Tất cả Supplier</option>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label>
 <label className="field">Lọc trạng thái chi phí<select value={statusFilter} onChange={e=>{setPage(1);setStatusFilter(e.target.value)}}><option value="">Tất cả trạng thái</option><option value="PENDING">Pending</option><option value="REVIEW">Review</option><option value="PASS">Pass</option><option value="UNMATCHED">Chưa ghép Order</option></select></label><button className="secondaryBtn" disabled={loading}>Tìm</button></form>
 <p role="status">{loading?"Đang tải chi phí…":total+" dòng chi phí phù hợp"}</p>
 <div className="tableWrap"><table><thead><tr>{["Order / DMD ID","Lot","Khách","Tracking","Supplier","Actual Net (USD)","Reconciliation"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??i)}><td>{String(row.order_id||"Chưa ghép Order")}<small>{String(row.system_order_code||"")}</small></td>{["lot_number","customer","tracking","supplier","total_net_cost","reconciliation_status"].map(k=><td key={k}>{String(row[k]|| (row[k]===0?0:"—"))}</td>)}</tr>)}</tbody></table></div>
 {!loading&&!rows.length&&<p>Không có chi phí phù hợp bộ lọc.</p>}
 <div className="financePagination"><button className="secondaryBtn" disabled={loading||page<=1} onClick={()=>setPage(p=>p-1)}>Chi phí: trang trước</button><span>Trang {page} / {totalPages}</span><button className="secondaryBtn" disabled={loading||page>=totalPages} onClick={()=>setPage(p=>p+1)}>Chi phí: trang sau</button></div></section>}
 {tab==="reconciliation"&&<ReconciliationWorkspace/>}
 {tab==="statements"&&<StatementsV2Workspace role={user.role}/>}
 {tab==="refunds"&&<RefundWorkspace role={user.role}/>}
 {tab==="payments"&&<PaymentReconciliationWorkspace role={user.role}/>}
 {tab==="suppliers"&&<SupplierAccountWorkspace onCostTools={supplier=>{setSupplierFilter(supplier);setPage(1);setTab("costs")}}/>}{tab==="bod"&&<BodFinanceWorkspace/>}
 </main>;
}
