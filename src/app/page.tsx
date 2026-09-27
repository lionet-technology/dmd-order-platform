"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "SALES";
type Order = Record<string, string | number | null>;
type Summary = { orders:number; review:number; unmatched:number; ledger:number; receivable:number };

const money = (v: unknown) => new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:2 }).format(Number(v || 0));

function ImportCard({ kind, title, detail, onDone }:{ kind:"orders"|"costs"|"balance"; title:string; detail:string; onDone:()=>void }) {
  const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState("");
  async function upload(){
    if(!file)return; setBusy(true); setMsg("");
    const form=new FormData(); form.set("kind",kind); form.set("file",file);
    const res=await fetch("/api/import",{method:"POST",body:form}); const body=await res.json(); setBusy(false);
    if(!res.ok){setMsg(`Lỗi: ${body.error}`);return;}
    const warnings=(body.warnings||[]).join(" · "); setMsg(`Đã nhập ${body.imported} dòng${warnings?` · ${warnings}`:""}`); onDone();
  }
  return <div className="importCard"><div><span className="eyebrow">{kind.toUpperCase()}</span><h3>{title}</h3><p>{detail}</p></div><label className="file"><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"Chọn file .xlsx"}</span></label><button disabled={!file||busy} onClick={upload}>{busy?"Đang nhập…":"Import"}</button>{msg&&<small>{msg}</small>}</div>
}

export default function Home(){
 const [role,setRole]=useState<Role>("ADMIN"); const [summary,setSummary]=useState<Summary|null>(null); const [orders,setOrders]=useState<Order[]>([]); const [recon,setRecon]=useState<Order[]>([]); const [ledger,setLedger]=useState<Order[]>([]); const [tab,setTab]=useState("orders");
 const load=useCallback(async()=>{ const [s,o,r,l]=await Promise.all([fetch("/api/summary"),fetch("/api/orders"),fetch("/api/reconciliation"),fetch("/api/ledger")]); setSummary(await s.json()); setOrders(await o.json()); setRecon(await r.json()); setLedger(await l.json()); },[]);
 useEffect(()=>{void load()},[load]);
 const orderCols=useMemo(()=>role==="ADMIN"?["workflow_status","created_at","sales","customer","supplier","service","sub_service","tracking","order_id","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","total_due","reconciliation_status"]:["workflow_status","created_at","sales","customer","service","sub_service","label","tracking","order_id","base_cost","retail","discount","sales_price","surcharge","import_tax","total_due"],[role]);
 return <main>
   <header><div><span className="eyebrow">DMD · MVP</span><h1>Finance Ops Intake</h1><p>Một nguồn dữ liệu chung cho Admin & Sales, tự link Order ↔ Supplier Cost ↔ Balance.</p></div><div className="role"><span>View</span><button className={role==="ADMIN"?"active":""} onClick={()=>setRole("ADMIN")}>Admin</button><button className={role==="SALES"?"active":""} onClick={()=>setRole("SALES")}>Sales</button></div></header>
   <section className="stats"><div><b>{summary?.orders??0}</b><span>Orders</span></div><div><b>{money(summary?.receivable)}</b><span>Total due</span></div><div><b>{money(summary?.ledger)}</b><span>Ledger balance</span></div><div className={(summary?.review||0)>0?"warn":""}><b>{summary?.review??0}</b><span>Need review</span></div><div><b>{summary?.unmatched??0}</b><span>Unmatched cost</span></div></section>
   <section><div className="sectionTitle"><div><span className="eyebrow">01 · INPUT</span><h2>Nhập liệu theo template hiện tại</h2></div><p>Upload file có header ở bất kỳ dòng nào; parser tự tìm đúng template trong sheet Report.</p></div><div className="imports"><ImportCard kind="orders" title="Lên đơn Admin / Sales" detail="Tracking là khóa link chính. Tự tính markup, hạng cân, total due khi thiếu." onDone={load}/><ImportCard kind="costs" title="Chi phí Supplier" detail="Match Tracking → True Net Cost → phụ phí/thuế → reconciliation." onDone={load}/><ImportCard kind="balance" title="Balance / Thanh toán" detail="Payment & Refund +Balance; Order/Service/Chargeable -Balance." onDone={load}/></div></section>
   <section className="workspace"><nav><button className={tab==="orders"?"active":""} onClick={()=>setTab("orders")}>Orders</button><button className={tab==="recon"?"active":""} onClick={()=>setTab("recon")}>Reconciliation <i>{recon.filter(x=>x.reconciliation_status==="REVIEW").length}</i></button><button className={tab==="ledger"?"active":""} onClick={()=>setTab("ledger")}>Balance Ledger</button></nav>
   {tab==="orders"&&<Table rows={orders} cols={orderCols}/>} {tab==="recon"&&<Table rows={recon} cols={["reconciliation_status","tracking","order_id","customer","supplier","service","est_net_cost","true_net_cost","reconciliation_delta","extra_surcharge","extra_import_tax","total_due"]}/>} {tab==="ledger"&&<Table rows={ledger} cols={["occurred_at","entry_type","direction","amount","customer","reference_type","reference_id","bill_url","note"]}/>}</section>
   <section className="questions"><span className="eyebrow">OPEN QUESTIONS</span><h2>Cần chốt trước production</h2><ol><li><b>Balance thiếu Customer/User key.</b> Payment/Refund đang được ghi global trong PoC. Cần thêm Customer/User ID nếu balance là theo khách.</li><li><b>Tracking có unique tuyệt đối không?</b> PoC dùng Tracking làm primary link, Order ID fallback về mặt nghiệp vụ.</li><li><b>Processing = + Balance</b> là credit tạm thời hay credit cuối? Khi resolved có cần reversal?</li><li><b>Remote-area surcharge</b> cần danh sách State/ZIP chính thức để auto tính.</li></ol></section>
 </main>
}

function Table({rows,cols}:{rows:Order[];cols:string[]}){return <div className="tableWrap"><table><thead><tr>{cols.map(c=><th key={c}>{c.replaceAll("_"," ")}</th>)}</tr></thead><tbody>{rows.length===0?<tr><td colSpan={cols.length} className="empty">Chưa có dữ liệu — import template phía trên.</td></tr>:rows.map((r,i)=><tr key={String(r.id||r.tracking||i)}>{cols.map(c=>{const v=r[c]; const isMoney=["amount","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","extra_surcharge","extra_import_tax","total_due","reconciliation_delta"].includes(c); return <td key={c} className={String(v)==="REVIEW"?"bad":String(v)==="PASS"?"good":""}>{isMoney?money(v):String(v??"")}</td>})}</tr>)}</tbody></table></div>}
