"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "SALES";
type User = { id:number; username:string; display_name:string; role:Role; active?:number };
type RowData = Record<string, string | number | null>;
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

function ImportCard({ kind, title, detail, onDone }:{
  kind:"orders"|"costs"|"balance"; title:string; detail:string; onDone:()=>void
}) {
  const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState("");
  async function upload(){
    if(!file)return; setBusy(true); setMsg("");
    const form=new FormData(); form.set("kind",kind); form.set("file",file);
    const res=await fetch("/api/import",{method:"POST",body:form}); const body=await res.json(); setBusy(false);
    if(!res.ok){setMsg("Lỗi: "+body.error);return;}
    const warnings=(body.warnings||[]).join(" · "); setMsg("Đã nhập "+body.imported+" dòng"+(warnings?" · "+warnings:"")); onDone();
  }
  return <div className="importCard"><div><span className="eyebrow">{kind.toUpperCase()}</span><h3>{title}</h3><p>{detail}</p></div><label className="file"><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"Chọn file .xlsx"}</span></label><button disabled={!file||busy} onClick={upload}>{busy?"Đang nhập…":"Import Excel"}</button>{msg&&<small>{msg}</small>}</div>
}

function UserManager({users,onDone,currentUser}:{users:User[];onDone:()=>void;currentUser:User}) {
  const [form,setForm]=useState({display_name:"",username:"",password:"",role:"SALES"});
  const [msg,setMsg]=useState("");
  const [busy,setBusy]=useState(false);

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
    <div className="tableWrap accountTable"><table><thead><tr><th>Tên</th><th>Username</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {users.map(u=><tr key={u.id}><td>{u.display_name}</td><td>@{u.username}</td><td>{u.role}</td><td className={u.active?"good":"bad"}>{u.active?"Active":"Locked"}</td><td>
        <button className="editBtn" disabled={u.id===currentUser.id} onClick={()=>void patchUser(u.id,{active:!u.active})}>{u.active?"Khóa":"Mở"}</button>
        <button className="editBtn" onClick={()=>{const pw=window.prompt("Mật khẩu mới (ít nhất 8 ký tự)");if(pw)void patchUser(u.id,{password:pw})}}>Reset PW</button>
      </td></tr>)}
    </tbody></table></div>
  </div>;
}

function Platform({user,onLogout}:{user:User;onLogout:()=>void}) {
  const role=user.role;
  const [summary,setSummary]=useState<Summary|null>(null);
  const [orders,setOrders]=useState<RowData[]>([]);
  const [costs,setCosts]=useState<RowData[]>([]);
  const [recon,setRecon]=useState<RowData[]>([]);
  const [ledger,setLedger]=useState<RowData[]>([]);
  const [users,setUsers]=useState<User[]>([]);
  const [tab,setTab]=useState("orders");
  const [inputMode,setInputMode]=useState<InputMode>("manual");
  const [manualKind,setManualKind]=useState<ManualKind>("order");
  const [editOrder,setEditOrder]=useState<RowData|null>(null);

  const load=useCallback(async()=>{
    const [s,o]=await Promise.all([fetch("/api/summary"),fetch("/api/orders")]);
    if(s.status===401||o.status===401){onLogout();return;}
    setSummary(await s.json());setOrders(await o.json());
    if(role==="ADMIN"){
      const [c,r,l,u]=await Promise.all([fetch("/api/costs"),fetch("/api/reconciliation"),fetch("/api/ledger"),fetch("/api/users")]);
      setCosts(await c.json());setRecon(await r.json());setLedger(await l.json());setUsers(await u.json());
    } else {
      setCosts([]);setRecon([]);setLedger([]);setUsers([]);
    }
  },[role,onLogout]);
  useEffect(()=>{void load()},[load]);

  const salesUsers=users.filter(u=>u.role==="SALES"&&u.active!==0);
  const orderCols=useMemo(()=>role==="ADMIN"
    ?["workflow_status","created_at","sales","customer","supplier","service","sub_service","tracking","order_id","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","total_due","gross_margin_pct","margin_status","reconciliation_status"]
    :["workflow_status","created_at","sales","customer","service","sub_service","order_id","discount","total_due"],[role]);

  function startEdit(row:RowData){
    setEditOrder(row);setInputMode("manual");setManualKind("order");
    window.scrollTo({top:340,behavior:"smooth"});
  }

  async function logout(){
    await fetch("/api/auth/logout",{method:"POST"});
    onLogout();
  }

  return <main>
    <header>
      <div><span className="eyebrow">DMD · FINANCE OPS</span><h1>Linked Data Platform</h1><p>Nhập liệu một lần, tự sync Order ↔ Supplier Cost ↔ Reconciliation ↔ Balance.</p></div>
      <div className="accountBox"><div><b>{user.display_name}</b><span>@{user.username} · {user.role}</span></div><button className="linkBtn" onClick={()=>void logout()}>Đăng xuất</button></div>
    </header>

    <section className={role==="ADMIN"?"stats":"stats salesStats"}>
      <div><b>{summary?.orders??0}</b><span>Orders</span></div>
      <div><b>{money(summary?.receivable)}</b><span>Total due</span></div>
      {role==="ADMIN"&&<><div><b>{money(summary?.ledger)}</b><span>Ledger balance</span></div><div className={(summary?.review||0)>0?"warn":""}><b>{summary?.review??0}</b><span>Need review</span></div><div><b>{summary?.unmatched??0}</b><span>Unmatched cost</span></div></>}
    </section>

    <section>
      <div className="sectionTitle">
        <div><span className="eyebrow">01 · DATA ENTRY</span><h2>Nhập trực tiếp trên platform</h2></div>
        {role==="ADMIN"&&<div className="modeBar"><button className={inputMode==="manual"?"active":""} onClick={()=>setInputMode("manual")}>Nhập thủ công</button><button className={inputMode==="import"?"active":""} onClick={()=>setInputMode("import")}>Import Excel</button></div>}
      </div>
      <div className="syncStrip"><b>Auto-sync:</b><span>Order saved</span><i>→</i><span>Pricing/weight recalculated</span>{role==="ADMIN"&&<><i>→</i><span>Cost matched by Tracking</span><i>→</i><span>Reconcile + Ledger updated</span></>}</div>

      {inputMode==="manual"||role==="SALES"
        ? <ManualEntry role={role} currentUser={user} salesUsers={salesUsers} kind={manualKind} setKind={setManualKind} onDone={load} editOrder={editOrder} onCancelEdit={()=>setEditOrder(null)}/>
        : <div className="imports"><ImportCard kind="orders" title="Lên đơn Admin / Sales" detail="Bulk import template cũ; dùng chung business logic." onDone={load}/><ImportCard kind="costs" title="Chi phí Supplier" detail="Match Tracking → True Net Cost → reconciliation." onDone={load}/><ImportCard kind="balance" title="Balance / Thanh toán" detail="Bulk import cho migration và xử lý hàng loạt." onDone={load}/></div>
      }
    </section>

    <section className="workspace">
      <nav>
        <button className={tab==="orders"?"active":""} onClick={()=>setTab("orders")}>Orders</button>
        {role==="ADMIN"&&<><button className={tab==="costs"?"active":""} onClick={()=>setTab("costs")}>Supplier Costs <i>{costs.filter(x=>!x.matched).length}</i></button><button className={tab==="recon"?"active":""} onClick={()=>setTab("recon")}>Reconciliation <i>{recon.filter(x=>x.reconciliation_status==="REVIEW").length}</i></button><button className={tab==="ledger"?"active":""} onClick={()=>setTab("ledger")}>Balance Ledger</button><button className={tab==="users"?"active":""} onClick={()=>setTab("users")}>Accounts <i>{users.filter(x=>x.role==="SALES"&&x.active).length}</i></button></>}
      </nav>
      {tab==="orders"&&<Table rows={orders} cols={orderCols} onEdit={startEdit}/>}
      {role==="ADMIN"&&tab==="costs"&&<Table rows={costs} cols={["occurred_at","tracking","matched","order_id","customer","supplier","service","sub_service","total_net_cost","extra_surcharge","import_tax","reconciliation_status","note"]}/>}
      {role==="ADMIN"&&tab==="recon"&&<Table rows={recon} cols={["reconciliation_status","tracking","order_id","customer","supplier","service","est_net_cost","true_net_cost","reconciliation_delta","gross_margin_pct","margin_status","total_due"]}/>}
      {role==="ADMIN"&&tab==="ledger"&&<Table rows={ledger} cols={["occurred_at","entry_type","direction","amount","customer","reference_type","reference_id","bill_url","note"]}/>}
      {role==="ADMIN"&&tab==="users"&&<UserManager users={users} onDone={load} currentUser={user}/>}
    </section>

    {role==="ADMIN"&&<section className="questions">
      <span className="eyebrow">CALCULATION AUDIT</span><h2>Đã tự động và phần còn thiếu</h2>
      <ol>
        <li><b>Đã có:</b> Base/Retail markup, Sales Price theo Discount, Volume, Chargeable Weight, ePacket length surcharge, Total Due, True Cost reconciliation, Gross Margin &lt;15% alert, ORDER_CHARGE ledger.</li>
        <li><b>Chưa thể auto:</b> Remote-area surcharge — cần source State/ZIP chính thức.</li>
        <li><b>Cần chốt:</b> Total Net Cost có bao gồm toàn bộ customs/fee không; Processing credit có reversal không; Gross Profit hiện không tính surcharge/import tax vào profit.</li>
        <li><b>Cần nâng production:</b> chuyển markup hard-code thành Pricing Config quản trị được và chốt key multi-carton nếu Tracking không unique.</li>
      </ol>
    </section>}
  </main>;
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

function Table({rows,cols,onEdit}:{rows:RowData[];cols:string[];onEdit?:(row:RowData)=>void}){
  return <div className="tableWrap"><table><thead><tr>{onEdit&&<th>Action</th>}{cols.map(c=><th key={c}>{c.replaceAll("_"," ")}</th>)}</tr></thead><tbody>
    {rows.length===0?<tr><td colSpan={cols.length+(onEdit?1:0)} className="empty">Chưa có dữ liệu — nhập trực tiếp hoặc Import Excel phía trên.</td></tr>
    :rows.map((r,i)=><tr key={String(r.id||r.tracking||i)}>
      {onEdit&&<td><button className="editBtn" onClick={()=>onEdit(r)}>Sửa</button></td>}
      {cols.map(c=>{
        const v=r[c];
        const isMoney=["amount","est_net_cost","true_net_cost","base_cost","retail","sales_price","surcharge","import_tax","extra_surcharge","extra_import_tax","total_due","reconciliation_delta","total_net_cost"].includes(c);
        const display=c==="matched"?(Number(v)?"Linked":"Waiting"):isMoney?money(v):String(v??"");
        return <td key={c} className={String(v)==="REVIEW"||display==="Waiting"?"bad":String(v)==="PASS"||display==="Linked"?"good":""}>{display}</td>;
      })}
    </tr>)}
  </tbody></table></div>;
}
