"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
type Row=Record<string,unknown>;
type Item=Row&{id?:number;incident_id?:number;route_id?:number;order_id:number;supplier:string;status:string;tracking_label:{legacy_tracking?:string;legacy_label?:string;trackings:Row[];lots?:Row[];policy?:Row;service?:string;sub_service?:string};history:Row[]};
export function SupplierCancellationWorkspace({supplier:scopeSupplier}:{supplier?:string}={}){
 const [items,setItems]=useState<Item[]>([]),[supplier,setSupplier]=useState(''),[incident,setIncident]=useState(''),[status,setStatus]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[role,setRole]=useState('');
 const receipt=useRef<{payload:string;key:string}|null>(null);
 const load=useCallback(async()=>{const p=new URLSearchParams({status});if(scopeSupplier||supplier)p.set('supplier',scopeSupplier||supplier);if(incident.trim())p.set('incident',incident.trim());const r=await fetch('/api/supplier-cancellations?'+p),d=await r.json();if(!r.ok)throw Error(d.error);setItems([...d.items,...d.void_cases]);},[scopeSupplier,supplier,status,incident]);
 useEffect(()=>{fetch('/api/auth/status').then(r=>r.json()).then(d=>setRole(d.user?.role||'')).catch(()=>setRole(''));},[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function submit(e:FormEvent<HTMLFormElement>,item:Item){
 e.preventDefault();setBusy(true);setError('');
 const f=new FormData(e.currentTarget),body:Record<string,unknown>={order_id:item.order_id,status:f.get('status'),note:f.get('note'),expected_event_id:item.history.at(-1)?.id};
 const mode=f.get('refund_mode');if(item.id){body.action='update_void';body.case_id=item.id;}
 if(mode&&mode!=='NONE')body.refund_choice={mode,evidence:f.get('refund_evidence'),...(mode==='AMOUNT'?{amount:f.get('refund_amount')}:{basis:f.get('refund_basis'),percent:f.get('refund_percent')})};
 const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
 try{const r=await fetch('/api/supplier-cancellations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_key:receipt.current.key})}),d=await r.json();if(!r.ok)throw Error(d.error);receipt.current=null;await load();}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function submitAdmin(e:FormEvent<HTMLFormElement>,action:string){
 e.preventDefault();setBusy(true);setError('');
 const form=e.currentTarget,fields=new FormData(form);
 const percent=fields.get('void_refund_percent');
 const body={action,...Object.fromEntries(fields),...(action==='configure_void'&&percent?{refund_percent:Number(percent)}:{})};
 const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
 try{const r=await fetch('/api/supplier-cancellations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_key:receipt.current.key})}),d=await r.json();if(!r.ok)throw Error(d.error);receipt.current=null;form.reset();await load();}
 catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const voidOptions=<><option value="CONFIRMED">Supplier xác nhận void</option><option value="DENIED">Supplier từ chối</option><option value="EXPIRED">Hết hạn</option></>;
 const choiceText=(value:unknown)=>{try{const c=JSON.parse(String(value));return (c.mode==='PERCENT'?c.percent+'% × '+c.basis+' VNĐ = ':'')+c.amount+' VNĐ · '+c.evidence;}catch{return 'Cần rà soát chứng từ';}};
 const label=(url:unknown)=>/^https?:\/\//i.test(String(url||''))?<a href={String(url)} target="_blank" rel="noreferrer">Label lưu trữ</a>:<span>{String(url||'Chưa có Label')}</span>;
 return <section className="panel" aria-label="Theo dõi huỷ Supplier"><h3>Đơn huỷ chờ xử lý Supplier</h3><p>Theo dõi liên hệ Supplier; việc huỷ trong hệ thống chưa xác nhận Supplier đã huỷ hay hoàn tiền. Đóng theo dõi không ghi công nợ hoặc hoàn tiền.</p>
 {!scopeSupplier&&<label className="field">Supplier<input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Lọc theo tên Supplier"/></label>}
 {role==='ADMIN'&&!scopeSupplier&&<details><summary>Mở void hoặc cấu hình phí</summary>
 <form onSubmit={e=>void submitAdmin(e,'open_void')}><label className="field">Order ID<input name="order_id" type="number" min="1" required/></label><label className="field">Route ID gốc<input name="route_id" type="number" min="1" required/></label><label className="field">Lý do void<textarea name="note" required maxLength={2000}/></label><button className="secondaryBtn" disabled={busy}>Mở yêu cầu void</button></form>
 <form onSubmit={e=>void submitAdmin(e,'configure_void')}><label className="field">Route ID<input name="route_id" type="number" min="1" required/></label><label className="field">Phiên bản hiện hành (0 khi tạo mới)<input name="expected_policy_id" type="number" min="0" defaultValue="0" required/></label><label className="field">Cách tính phí void<select name="void_refund_percent"><option value="">Phí cố định</option><option value="90">Hoàn 90% Actual đã duyệt</option><option value="100">Hoàn 100%</option></select></label><label className="field">Phí cố định VNĐ<input name="fee_vnd" inputMode="decimal" defaultValue="0" required/></label><label className="field">Chứng từ bắt buộc<textarea name="evidence_required" required maxLength={2000}/></label><button className="secondaryBtn" disabled={busy}>Lưu phiên bản phí</button></form>
 </details>}
 <label className="field">Incident ID<input value={incident} onChange={e=>setIncident(e.target.value)} inputMode="numeric"/></label>
 <label className="field">Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Chờ xử lý / Đang liên hệ</option><option value="PENDING">Chờ xử lý</option><option value="FOLLOWING_UP">Đang liên hệ</option><option value="RESOLVED">Đã xử lý theo dõi</option>{voidOptions}<option value="ALL">Tất cả</option></select></label>
 <button className="secondaryBtn" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}>Tải lại</button>
 {error&&<p role="alert">{error}</p>}{!items.length&&<p>Không có đơn phù hợp.</p>}
 {items.map(item=><article key={item.id?'void:'+item.id:'cancel:'+item.order_id}><h4>{String(item.system_order_code||'Order #'+item.order_id)} · {item.supplier||'Chưa xác định Supplier'} · {item.status}</h4>
 <p>Order #{item.order_id} · Client Order {String(item.client_order_id||'—')} · {String(item.reason)}</p>
 {item.id&&<><p>Void #{item.id} · Route #{item.route_id} · {item.tracking_label.service} / {item.tracking_label.sub_service}{item.incident_id&&' · Incident #'+item.incident_id} · {String(item.created_at)} · Người mở #{String(item.actor_id)}</p>
 <p>Lot {item.tracking_label.lots?.map(l=>String(l.lot_number)).join(', ')||'—'} · {item.tracking_label.policy?'Phí theo phiên bản #'+String(item.tracking_label.policy.id)+': '+(item.tracking_label.policy.refund_percent?'Hoàn '+String(item.tracking_label.policy.refund_percent)+'%':String(item.tracking_label.policy.fee_vnd)+' VNĐ')+' · '+String(item.tracking_label.policy.evidence_required):'Chưa cấu hình phí void'}</p></>}
 <p>{item.tracking_label.legacy_tracking||'Chưa có Tracking'} · {label(item.tracking_label.legacy_label)}</p>
 {item.tracking_label.trackings.map(t=><p key={String(t.id)}>Tracking #{String(t.id)} · Lot {String(t.lot_number||'—')} · {String(t.tracking)} · {label(t.label_url)}</p>)}
 <details><summary>History</summary>{item.history.map(h=><p key={String(h.id)}>{String(h.created_at)} · {String(h.status)} · {String(h.note)}{Boolean(h.choice_json)&&<span> · Lựa chọn Admin (chưa ghi tiền): {choiceText(h.choice_json)}</span>} · Người ghi #{String(h.actor_id)}</p>)}</details>
 <form key={String(item.history.at(-1)?.id)} onSubmit={e=>void submit(e,item)}><label className="field">Cập nhật<select name="status" defaultValue={item.status}><option value="PENDING">Chờ xử lý</option><option value="FOLLOWING_UP">Đang liên hệ</option><option value="RESOLVED">Đã xử lý theo dõi</option>{item.id&&voidOptions}</select></label><label className="field">Ghi chú / bằng chứng<textarea name="note" required maxLength={2000}/></label>{role==='ADMIN'&&!item.id&&<fieldset><legend>Mức hoàn Supplier VNĐ · ghi theo dõi, chưa ghi tiền</legend><label className="field">Cách chọn mức hoàn<select name="refund_mode" defaultValue="NONE"><option value="NONE">Chỉ cập nhật theo dõi</option><option value="AMOUNT">Số tiền VNĐ</option><option value="PERCENT">Tỷ lệ trên cost Supplier xác định</option></select></label><label className="field">Số tiền hoàn Supplier VNĐ<input name="refund_amount" inputMode="decimal"/></label><label className="field">Cost Supplier làm cơ sở VNĐ<input name="refund_basis" inputMode="decimal"/></label><label className="field">Tỷ lệ hoàn Supplier %<input name="refund_percent" inputMode="decimal"/></label><label className="field">Chứng từ lựa chọn hoàn Supplier<input name="refund_evidence" maxLength={2000}/></label><p>Chỉ dùng với Order VNĐ. Cơ sở do Admin nhập từ chứng từ Supplier, không lấy doanh thu Client. Không tự void, hoàn Client hoặc đảo cost.</p></fieldset>}<button className="primaryBtn" disabled={busy}>Lưu theo dõi</button></form>
 </article>)}</section>;
}
