"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
type Invoice={id:number;supplier:string;invoice_number:string;amount_cents:number;paid_cents:number;outstanding_cents:number;due_date:string;voided:number;overdue:boolean};
type Payment={id:number;supplier:string;payment_reference:string;amount_cents:number;reversed_at:string|null};
type Data={invoices:Invoice[];payments:Payment[];suppliers:{supplier:string;outstanding_cents:number}[]};
const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export function SupplierPayablesWorkspace({suppliers}:{suppliers:string[]}){
 const [data,setData]=useState<Data>({invoices:[],payments:[],suppliers:[]}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[action,setAction]=useState('invoice');
 const receipt=useRef<{payload:string;key:string}|null>(null);
 const load=useCallback(async()=>{const r=await fetch('/api/supplier-payables');const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function submit(e:React.FormEvent<HTMLFormElement>){
 e.preventDefault();setBusy(true);setError('');setNotice('');
 try{const fields=Object.fromEntries(new FormData(e.currentTarget));let body:Record<string,unknown>={...fields,action,currency:'USD'};
 if(action==='payment'){const invoice=data.invoices.find(i=>i.id===Number(fields.invoice_id));if(!invoice)throw Error('Chọn invoice.');body={...body,supplier:invoice.supplier,allocations:[{invoice_id:invoice.id,amount:fields.amount}]};}
 const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
 const r=await fetch('/api/supplier-payables',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_key:receipt.current.key})});const d=await r.json();if(!r.ok)throw Error(d.error);receipt.current=null;await load();setNotice('Đã ghi sổ và lưu lịch sử.');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <section className="panel"><h2>Phải trả Supplier</h2><p>Ghi nhận invoice và tiền đã thanh toán thực tế bằng USD. Các thao tác ở đây ghi sổ nội bộ. Chi phí đối soát Order và Balance khách được quản lý riêng.</p>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <button className="secondaryBtn" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Làm mới sổ phải trả</button>
 {data.suppliers.map(s=><p key={s.supplier}>{s.supplier}: còn phải trả {usd(s.outstanding_cents)}</p>)}
 <div className="tableWrap"><table><thead><tr><th>ID</th><th>Supplier</th><th>Invoice</th><th>Hạn trả</th><th>Tổng</th><th>Đã trả</th><th>Còn phải trả</th><th>Trạng thái</th></tr></thead><tbody>{data.invoices.map(i=><tr key={i.id}><td>{i.id}</td><td>{i.supplier}</td><td>{i.invoice_number}</td><td>{i.due_date}</td><td>{usd(i.amount_cents)}</td><td>{usd(i.paid_cents)}</td><td>{usd(i.outstanding_cents)}</td><td>{i.voided?'Đã hủy':i.overdue?'Quá hạn':i.outstanding_cents===0?'Đã trả đủ':i.paid_cents?'Đã trả một phần':'Chưa trả'}</td></tr>)}</tbody></table></div>
 {!data.invoices.length&&<p>Chưa có invoice Supplier.</p>}
 <form className="opsForm settingsGrid" onSubmit={submit} key={action}><h3>Ghi sổ</h3><label className="field">Hành động<select value={action} onChange={e=>{setAction(e.target.value);setError('');setNotice('');}}><option value="invoice">Ghi invoice</option><option value="payment">Ghi nhận đã thanh toán</option><option value="reverse_payment">Đảo ghi nhận thanh toán</option><option value="void_invoice">Hủy invoice chưa trả</option></select></label>
 {action==='invoice'&&<><label className="field">Supplier<select name="supplier" required><option value="">Chọn Supplier</option>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label><label className="field">Số invoice<input name="invoice_number" required/></label><label className="field">Ngày invoice<input name="invoice_date" type="date" required/></label><label className="field">Hạn trả<input name="due_date" type="date" required/></label><label className="field">Tham chiếu chứng từ<input name="document_reference" required/></label></>}
 {(action==='payment'||action==='void_invoice')&&<label className="field">Invoice<select name="invoice_id" required><option value="">Chọn invoice</option>{data.invoices.filter(i=>!i.voided&&(action==='payment'?i.outstanding_cents>0:i.paid_cents===0)).map(i=><option key={i.id} value={i.id}>{i.supplier} / {i.invoice_number} / còn {usd(i.outstanding_cents)}</option>)}</select></label>}
 {action==='payment'&&<><label className="field">Ngày đã thanh toán<input name="paid_date" type="date" required/></label><label className="field">Tham chiếu thanh toán<input name="payment_reference" required/></label></>}
 {(action==='invoice'||action==='payment')&&<label className="field">Số tiền USD<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required/></label>}
 {action==='reverse_payment'&&<label className="field">Thanh toán cần đảo<select name="payment_id" required><option value="">Chọn thanh toán</option>{data.payments.filter(p=>!p.reversed_at).map(p=><option key={p.id} value={p.id}>{p.supplier} / {p.payment_reference} / {usd(p.amount_cents)}</option>)}</select></label>}
 <label className="field">Lý do / ghi chú<textarea name="reason" required/></label><button className="primaryBtn" disabled={busy}>Lưu vào sổ</button></form>
 <h3>Lịch sử thanh toán</h3><div className="tableWrap"><table><thead><tr><th>ID</th><th>Supplier</th><th>Tham chiếu</th><th>USD</th><th>Trạng thái</th></tr></thead><tbody>{data.payments.map(p=><tr key={p.id}><td>{p.id}</td><td>{p.supplier}</td><td>{p.payment_reference}</td><td>{usd(p.amount_cents)}</td><td>{p.reversed_at?'Đã đảo ghi nhận':'Đã ghi nhận'}</td></tr>)}</tbody></table></div>
 </section>;
}
