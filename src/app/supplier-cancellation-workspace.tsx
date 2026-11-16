"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
type Row=Record<string,unknown>;
type Item=Row&{order_id:number;supplier:string;status:string;tracking_label:{legacy_tracking?:string;legacy_label?:string;trackings:Row[]};history:Row[]};
export function SupplierCancellationWorkspace({supplier:scopeSupplier}:{supplier?:string}={}){
 const [items,setItems]=useState<Item[]>([]),[supplier,setSupplier]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const receipt=useRef<{payload:string;key:string}|null>(null);
 const load=useCallback(async()=>{const p=new URLSearchParams({status});if(scopeSupplier||supplier)p.set('supplier',scopeSupplier||supplier);const r=await fetch('/api/supplier-cancellations?'+p),d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items);},[scopeSupplier,supplier,status]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function submit(e:FormEvent<HTMLFormElement>,item:Item){
 e.preventDefault();setBusy(true);setError('');
 const f=new FormData(e.currentTarget),body={order_id:item.order_id,status:f.get('status'),note:f.get('note'),expected_event_id:item.history.at(-1)?.id};
 const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
 try{const r=await fetch('/api/supplier-cancellations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_key:receipt.current.key})}),d=await r.json();if(!r.ok)throw Error(d.error);receipt.current=null;await load();}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const label=(url:unknown)=>/^https?:\/\//i.test(String(url||''))?<a href={String(url)} target="_blank" rel="noreferrer">Label lưu trữ</a>:<span>{String(url||'Chưa có Label')}</span>;
 return <section className="panel"><h3>Đơn huỷ chờ xử lý Supplier</h3><p>Theo dõi liên hệ Supplier; việc huỷ trong hệ thống chưa xác nhận Supplier đã huỷ hay hoàn tiền. Đóng theo dõi không ghi công nợ hoặc hoàn tiền.</p>
 {!scopeSupplier&&<label className="field">Supplier<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Lọc theo tên Supplier"/></label>}
 <label className="field">Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Chờ xử lý / Đang liên hệ</option><option value="PENDING">Chờ xử lý</option><option value="FOLLOWING_UP">Đang liên hệ</option><option value="RESOLVED">Đã xử lý theo dõi</option><option value="ALL">Tất cả</option></select></label>
 <button className="secondaryBtn" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Tải lại</button>
 {error&&<p role="alert">{error}</p>}{!items.length&&<p>Không có đơn phù hợp.</p>}
 {items.map(item=><article key={item.order_id}><h4>{String(item.system_order_code||'Order #'+item.order_id)} · {item.supplier||'Chưa xác định Supplier'} · {item.status}</h4>
 <p>Order #{item.order_id} · Client Order {String(item.client_order_id||'—')} · {String(item.reason)}</p>
 <p>{item.tracking_label.legacy_tracking||'Chưa có Tracking'} · {label(item.tracking_label.legacy_label)}</p>
 {item.tracking_label.trackings.map(t=><p key={String(t.id)}>Tracking #{String(t.id)} · {String(t.tracking)} · {label(t.label_url)}</p>)}
 <details><summary>History</summary>{item.history.map(h=><p key={String(h.id)}>{String(h.created_at)} · {String(h.status)} · {String(h.note)} · Người ghi #{String(h.actor_id)}</p>)}</details>
 <form key={String(item.history.at(-1)?.id)} onSubmit={e=>void submit(e,item)}><label className="field">Cập nhật<select name="status" defaultValue={item.status}><option value="PENDING">Chờ xử lý</option><option value="FOLLOWING_UP">Đang liên hệ</option><option value="RESOLVED">Đã xử lý theo dõi</option></select></label><label className="field">Ghi chú / bằng chứng<textarea name="note" required maxLength={2000}/></label><button className="primaryBtn" disabled={busy}>Lưu theo dõi</button></form>
 </article>)}</section>;
}
