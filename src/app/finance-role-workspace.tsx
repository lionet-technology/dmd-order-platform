"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {ReconciliationWorkspace} from "./reconciliation-workspace";
import {SupplierPayablesWorkspace} from "./supplier-payables-workspace";
type Row=Record<string,unknown>;
export function FinanceWorkspace({user,onLogout}:{user:{display_name:string;role:string};onLogout:()=>void}){
 const [tab,setTab]=useState("costs"),[rows,setRows]=useState<Row[]>([]),[suppliers,setSuppliers]=useState<string[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{
 const response=await fetch("/api/costs?pageSize=100"),data=await response.json();if(!response.ok)throw Error(data.error);setRows(data.items);
 const enums=await fetch("/api/enums"),list=await enums.json();if(enums.ok)setSuppliers(list.filter((r:Row)=>r.enum_type==="SUPPLIER"&&r.active!==0).map((r:Row)=>String(r.value)));
 }catch(e){setError((e as Error).message)}},[]);
 useEffect(()=>{void load()},[load]);
 async function save(event:FormEvent<HTMLFormElement>){
 event.preventDefault();setBusy(true);setError("");const form=event.currentTarget,values=Object.fromEntries(new FormData(form));
 try{const response=await fetch("/api/costs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...values,total_net_cost:Number(values.total_net_cost)})}),data=await response.json();if(!response.ok)throw Error(data.error);form.reset();await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function importCost(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError("");setNotice("");const form=event.currentTarget,body=new FormData(form);body.set("kind","costs");try{const response=await fetch("/api/import",{method:"POST",body}),data=await response.json();if(!response.ok)throw Error(data.error);setNotice("Đã nhập "+data.imported+" dòng chi phí.");form.reset();await load();}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <main className="financeRoleWorkspace"><header className="pageHeader"><div><span className="eyebrow">{user.role}</span><h1>Tài chính Supplier</h1><p>{user.display_name}</p></div><button className="secondaryBtn" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});onLogout()}}>Đăng xuất</button></header>
 <nav className="settingsActions" aria-label="Tài chính Supplier">{[["costs","Supplier Cost"],["reconciliation","Reconciliation"],["payables","Supplier Payables"]].map(([id,label])=><button className={tab===id?"primaryBtn":"secondaryBtn"} key={id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 {tab==="costs"&&<section className="panel"><h2>Supplier Cost</h2><form onSubmit={importCost} className="settingsActions"><label className="field">File đối soát Supplier (.xlsx, tối đa 10 MB)<input type="file" name="file" accept=".xlsx" required/></label><button className="secondaryBtn" disabled={busy}>Nhập Excel chi phí</button></form><form onSubmit={save} className="settingsGrid">
 <label className="field">Tracking<input name="tracking" required/></label>
 <label className="field">Supplier<select name="supplier" required><option value="">Chọn Supplier</option>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label>
 <label className="field">Actual Net (USD)<input name="total_net_cost" type="number" min="0" step="0.01" required/></label>
 <label className="field">Ngày chứng từ<input name="occurred_at" type="date" required/></label>
 <label className="field">Mã chứng từ / request key<input name="source_key" required/></label>
 <label className="field">Ghi chú<input name="note"/></label><button className="primaryBtn" disabled={busy}>{busy?"Đang lưu…":"Ghi Supplier Cost"}</button></form>
 <div className="tableWrap"><table><thead><tr>{["Tracking","Supplier","Actual Net (USD)","Reconciliation"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={String(row.id??i)}>{["tracking","supplier","total_net_cost","reconciliation_status"].map(k=><td key={k}>{String(row[k]??"—")}</td>)}</tr>)}</tbody></table></div></section>}
 {tab==="reconciliation"&&<ReconciliationWorkspace/>}
 {tab==="payables"&&<SupplierPayablesWorkspace suppliers={suppliers}/>}
 </main>;
}
