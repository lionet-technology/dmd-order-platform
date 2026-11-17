"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
type Row=Record<string,unknown>;
type Item=Row&{order_id:number;supplier:string;status:string;tracking_label:{legacy_tracking?:string;legacy_label?:string;trackings:Row[]};history:Row[]};
export function SupplierCancellationWorkspace({supplier:scopeSupplier}:{supplier?:string}={}){
 const [items,setItems]=useState<Item[]>([]),[supplier,setSupplier]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[role,setRole]=useState('');
 const receipt=useRef<{payload:string;key:string}|null>(null);
 const load=useCallback(async()=>{const p=new URLSearchParams({status});if(scopeSupplier||supplier)p.set('supplier',scopeSupplier||supplier);const r=await fetch('/api/supplier-cancellations?'+p),d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items);},[scopeSupplier,supplier,status]);
 useEffect(()=>{fetch('/api/auth/status').then(r=>r.json()).then(d=>setRole(d.user?.role||'')).catch(()=>setRole(''));},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function submit(e:FormEvent<HTMLFormElement>,item:Item){
 e.preventDefault();setBusy(true);setError('');
 const f=new FormData(e.currentTarget),body:Record<string,unknown>={order_id:item.order_id,status:f.get('status'),note:f.get('note'),expected_event_id:item.history.at(-1)?.id};
 const mode=f.get('refund_mode');if(mode&&mode!=='NONE')body.refund_choice={mode,evidence:f.get('refund_evidence'),...(mode==='AMOUNT'?{amount:f.get('refund_amount')}:{basis:f.get('refund_basis'),percent:f.get('refund_percent')})};
 const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
 try{const r=await fetch('/api/supplier-cancellations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_key:receipt.current.key})}),d=await r.json();if(!r.ok)throw Error(d.error);receipt.current=null;await load();}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const choiceText=(value:unknown)=>{try{const c=JSON.parse(String(value));return (c.mode==='PERCENT'?c.percent+'% × '+c.basis+' VNĐ = ':'')+c.amount+' VNĐ · '+c.evidence;}catch{return 'Cần rà soát chứng từ';}};
 const label=(url:unknown)=>/^https?:\/\//i.test(String(url||''))?<a href={String(url)} target="_blank" rel="noreferrer">Label lưu trữ</a>:<span>{String(url||'Chưa có Label')}</span>;
 return <section className="panel" aria-label="Theo dõi huỷ Supplier"><h3>Đơn huỷ chờ xử lý Supplier</h3><p>Theo dõi liên hệ Supplier; việc huỷ trong hệ thống chưa xác nhận Supplier đã huỷ hay hoàn tiền. Đóng theo dõi không ghi công nợ hoặc hoàn tiền.</p>
 {!scopeSupplier&&<label className="field">Supplier<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Lọc theo tên Supplier"/></label>}
 <label className="field">Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Chờ xử lý / Đang liên hệ</option><option value="PENDING">Chờ xử lý</option><option value="FOLLOWING_UP">Đang liên hệ</option><option value="RESOLVED">Đã xử lý theo dõi</option><option value="ALL">Tất cả</option></select></label>
 <button className="secondaryBtn" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Tải lại</button>
 {error&&<p role="alert">{error}</p>}{!items.length&&<p>Không có đơn phù hợp.</p>}
 {items.map(item=><article key={item.order_id}><h4>{String(item.system_order_code||'Order #'+item.order_id)} · {item.supplier||'Chưa xác định Supplier'} · {item.status}</h4>
 <p>Order #{item.order_id} · Client Order {String(item.client_order_id||'—')} · {String(item.reason)}</p>
 <p>{item.tracking_label.legacy_tracking||'Chưa có Tracking'} · {label(item.tracking_label.legacy_label)}</p>
 {item.tracking_label.trackings.map(t=><p key={String(t.id)}>Tracking #{String(t.id)} · {String(t.tracking)} · {label(t.label_url)}</p>)}
 <details><summary>History</summary>{item.history.map(h=><p key={String(h.id)}>{String(h.created_at)} · {String(h.status)} · {String(h.note)}{Boolean(h.choice_json)&&<span> · Lựa chọn Admin (chưa ghi tiền): {choiceText(h.choice_json)}</span>} · Người ghi #{String(h.actor_id)}</p>)}</details>
 <form key={String(item.history.at(-1)?.id)} onSubmit={e=>void submit(e,item)}><label className="field">Cập nhật<select name="status" defaultValue={item.status}><option value="PENDING">Chờ xử lý</option><option value="FOLLOWING_UP">Đang liên hệ</option><option value="RESOLVED">Đã xử lý theo dõi</option></select></label><label className="field">Ghi chú / bằng chứng<textarea name="note" required maxLength={2000}/></label>{role==='ADMIN'&&<fieldset><legend>Mức hoàn Supplier VNĐ · ghi theo dõi, chưa ghi tiền</legend><label className="field">Cách chọn mức hoàn<select name="refund_mode" defaultValue="NONE"><option value="NONE">Chỉ cập nhật theo dõi</option><option value="AMOUNT">Số tiền VNĐ</option><option value="PERCENT">Tỷ lệ trên cost Supplier xác định</option></select></label><label className="field">Số tiền hoàn Supplier VNĐ<input name="refund_amount" inputMode="decimal"/></label><label className="field">Cost Supplier làm cơ sở VNĐ<input name="refund_basis" inputMode="decimal"/></label><label className="field">Tỷ lệ hoàn Supplier %<input name="refund_percent" inputMode="decimal"/></label><label className="field">Chứng từ lựa chọn hoàn Supplier<input name="refund_evidence" maxLength={2000}/></label><p>Chỉ dùng với Order VNĐ. Cơ sở do Admin nhập từ chứng từ Supplier, không lấy doanh thu Client. Không tự void, hoàn Client hoặc đảo cost.</p></fieldset>}<button className="primaryBtn" disabled={busy}>Lưu theo dõi</button></form>
 </article>)}</section>;
}
