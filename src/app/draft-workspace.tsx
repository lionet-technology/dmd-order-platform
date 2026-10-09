"use client";
import {useCallback,useEffect,useState} from 'react';
import {ConfirmationDialog} from './confirmation-dialog';
import {readableReason,type Preview} from './pricing-preview';
type Route={id:number;service:string;sub_service:string};
type Row=Record<string,unknown>&{draft_id?:number;request_key?:string;route_id?:number;client_user_id?:number;pricing?:Preview|null;reasons?:string[];draft_state?:string;error_group?:string|null;success?:boolean;system_order_code?:string};
type Result={id:number;draft_id:number;system_order_code?:string;order_id?:string;pricing?:Preview;error?:string;error_group?:string};
type Client={id:number;display_name:string};
const fields=['order_id','weight','length','width','height','manual_volume','carton_count','recipient_name','address1','address2','city','state','zip','country','phone','recipient_email','item','material','declared_value'];
const labels=['Client Order ID','Cân nặng (kg)','Dài (cm)','Rộng (cm)','Cao (cm)','Thể tích','Carton','Người nhận','Địa chỉ 1','Địa chỉ 2','Thành phố','Bang','ZIP','Nước','Điện thoại','Email','Sản phẩm','Chất liệu','Giá trị khai báo'];
const states:Record<string,string>={ready:'Có thể đặt',needs_fix:'Cần sửa',incomplete:'Chưa hoàn tất'};
const keyOf=(r:Row)=>r.request_key||String(r.draft_id);
const blank=(client:number,route:number):Row=>({request_key:crypto.randomUUID(),client_user_id:client,route_id:route,country:'US',carton_count:1});
export function DraftWorkspace({role,clients,create=false,onDone,onAll,onDraft}:{role:string;clients:Client[];create?:boolean;onDone:()=>void;onAll:()=>void;onDraft?:()=>void}){
 const [client,setClient]=useState(''),[routes,setRoutes]=useState<Route[]>([]),[route,setRoute]=useState(''),[rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Set<string>>(new Set());
 const [state,setState]=useState(''),[service,setService]=useState(''),[q,setQ]=useState(''),[group,setGroup]=useState(''),[advanced,setAdvanced]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [results,setResults]=useState<Result[]|null>(null),[view,setView]=useState('failed'),[confirm,setConfirm]=useState(false),[deleting,setDeleting]=useState<'selected'|'all'|null>(null);
 const canEdit=role==='CLIENT'||!!client;
 const load=useCallback(async()=>{
 const [rr,dr]=await Promise.all([fetch('/api/order-routes'+(client?'?clientId='+client:'')),create?Promise.resolve(null):fetch('/api/client-drafts?'+new URLSearchParams({clientId:client,all:'1'}))]);
 const choices=await rr.json();if(!rr.ok)throw Error(choices.error);setRoutes(choices);
 if(dr){const data=await dr.json();if(!dr.ok)throw Error(data.error);setRows(data.items);setSelected(new Set());}
 else setRows(prev=>prev.length?prev:[blank(Number(client),0)]);
 },[client,create]);
 useEffect(()=>{void load().catch(e=>setMessage(e.message))},[load]);
 async function post(body:unknown){const response=await fetch('/api/client-drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error);return data;}
 const inputSignature=JSON.stringify(rows.filter(r=>!r.success).map(r=>Object.fromEntries([...fields,'draft_id','route_id'].map(k=>[k,r[k]]))));
 useEffect(()=>{
 if(!canEdit||!rows.length||busy)return;
 const abort=new AbortController();const timer=setTimeout(()=>{
 const pending=rows.filter(r=>!r.success&&r.route_id);if(!pending.length)return;
 void fetch('/api/client-drafts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'preview',client_id:Number(client),rows:pending}),signal:abort.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error);const map=new Map(pending.map((r,i)=>[keyOf(r),data.rows[i] as Row]));setRows(prev=>prev.map(r=>{const p=map.get(keyOf(r));return p?{...r,pricing:p.pricing,draft_state:p.draft_state,error_group:p.error_group,reasons:p.reasons}:r;}));}).catch(e=>{if(e.name!=='AbortError')setMessage(e.message)});
 },350);return ()=>{clearTimeout(timer);abort.abort()};
 // Only editable values trigger a quote; response metadata must not trigger another request.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[inputSignature,client,canEdit,busy]);
 const shown=rows.filter(r=>(!results||results.some(x=>x.draft_id===r.draft_id))&&(!results||(view==='success'?r.success:!r.success))&&(!state||r.draft_state===state)&&(!group||r.error_group===group)&&(!service||String(r.route_id)===service)&&(!q||String(r.order_id||'').toLowerCase().includes(q.toLowerCase())||String(r.system_order_code||'').toLowerCase().includes(q.toLowerCase())));
 const editable=shown.filter(r=>!r.success),chosen=rows.filter(r=>selected.has(keyOf(r))&&!r.success);
 const successes=results?.filter(r=>!r.error).length||0,failures=results?.filter(r=>r.error).length||0;
 function edit(r:Row,k:string,value:unknown){setRows(prev=>prev.map(x=>keyOf(x)===keyOf(r)?{...x,[k]:value,reasons:[],failure_reason:null}:x));}
 async function save(submit=false){
 setBusy(true);setMessage('');setConfirm(false);
 try{
 const target=submit?chosen:rows.filter(r=>!r.success);if(!target.length)throw Error('Chọn dòng cần xử lý.');
 if(submit&&target.length>1000)throw Error('Chọn tối đa 1000 đơn mỗi lần đặt.');
 const saved:Row[]=[];for(let offset=0;offset<target.length;offset+=1000){const data=await post({action:'save',client_id:Number(client),rows:target.slice(offset,offset+1000)});saved.push(...data.orders);}const mapping=new Map(target.map((r,i)=>[keyOf(r),{...r,...saved[i],request_key:r.request_key,success:!!saved[i].submitted_order_id}]));
 let next=rows.map(r=>mapping.get(keyOf(r))||r);setRows(next);setSelected(new Set());
 if(submit){
 const pending=saved.filter(r=>!r.submitted_order_id);
 const data=pending.length?await post({action:'purchase',client_id:Number(client),ids:pending.map(r=>r.draft_id)}):{orders:[],failures:[]};
 const response=[...saved.filter(r=>r.submitted_order_id).map(r=>({...r,id:r.submitted_order_id})),...data.orders,...data.failures] as Result[];
 const map=new Map(response.map(r=>[r.draft_id,r]));
 next=next.map(r=>{const result=map.get(Number(r.draft_id));return result?{...r,success:!result.error,system_order_code:result.system_order_code||r.system_order_code,pricing:result.pricing||r.pricing,reasons:result.error?[result.error]:[],error_group:result.error_group,draft_state:result.error?'needs_fix':'ready',failure_reason:result.error}:r;});
 setRows(next);setResults(prev=>[...(prev||[]).filter(r=>!map.has(r.draft_id)),...response]);setView('failed');setState('');setGroup('');setService('');setQ('');setMessage(response.some(r=>r.error)?'Kết quả đã lưu trên server. Sửa và chọn các đơn thất bại để đặt lại.':'Đã đặt thành công. Xem DMD ID trong danh sách thành công hoặc về Mọi đơn hàng.');
 }else setMessage('Đã lưu Draft và chỉnh sửa.');
 onDone();
 }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 async function remove(){setBusy(true);try{const data=await post({action:'delete',client_id:Number(client),all:deleting==='all',ids:chosen.map(r=>r.draft_id)});setMessage('Đã xóa '+data.deleted+' Draft.');setDeleting(null);await load();onDone();}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function upload(file:File){setBusy(true);try{const form=new FormData();form.set('file',file);form.set('client_id',client);form.set('route_id',route);const response=await fetch('/api/client-drafts',{method:'POST',body:form}),data=await response.json();if(!response.ok)throw Error(data.error);const next=data.rows.map((r:Row)=>({...blank(Number(client),Number(route)),...(r.input as Record<string,unknown>),pricing:r.pricing,reasons:r.reasons,draft_state:r.draft_state,error_group:r.error_group}));setRows(next);setSelected(new Set(next.map(keyOf)));}catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 function template(){const url=URL.createObjectURL(new Blob([fields.join(',')+'\r\n'],{type:'text/csv'})),a=document.createElement('a');a.href=url;a.download='Client_Orders.csv';a.click();URL.revokeObjectURL(url);}
 return <div className="clientPurchase draftWorkspace">
 <div className="dataToolbar">
 <label>Tình trạng <select aria-label="Tình trạng Draft" value={state} onChange={e=>setState(e.target.value)}><option value="">Tất cả</option>{Object.entries(states).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
 {role!=='CLIENT'&&<label>Client <select aria-label="Client Draft" value={client} disabled={busy||!!results} onChange={e=>{setClient(e.target.value);setRows([]);setSelected(new Set());setRoute('');}}><option value="">Tất cả Client</option>{clients.map(c=><option value={c.id} key={c.id}>{c.display_name}</option>)}</select></label>}
 <label>Dịch vụ <select aria-label="Dịch vụ Draft" value={service} onChange={e=>setService(e.target.value)}><option value="">Tất cả</option>{routes.map(r=><option value={r.id} key={r.id}>{r.service} - {r.sub_service}</option>)}</select></label>
 <input aria-label="Tìm Draft" placeholder="Client Order ID / DMD ID" value={q} onChange={e=>setQ(e.target.value)}/><button className="secondaryBtn" aria-expanded={advanced} onClick={()=>setAdvanced(v=>!v)}>Lọc nâng cao</button>
 {advanced&&<label>Loại lỗi <select aria-label="Loại lỗi Draft" value={group} onChange={e=>setGroup(e.target.value)}><option value="">Tất cả</option><option value="DATA">Lỗi dữ liệu</option><option value="SYSTEM">Lỗi hệ thống</option></select></label>}
 </div>
 {create&&!results&&<><div className="clientUploadActions"><label>Dịch vụ mặc định <select aria-label="Dịch vụ mặc định" disabled={busy||!canEdit} value={route} onChange={e=>{setRoute(e.target.value);setRows(prev=>prev.map(r=>({...r,route_id:Number(e.target.value)})));}}><option value="">Chọn dịch vụ</option>{routes.map(r=><option value={r.id} key={r.id}>{r.service} - {r.sub_service}</option>)}</select></label><button className="secondaryBtn" onClick={template}>Tải CSV mẫu</button><input aria-label="Import Excel" type="file" accept=".csv,.xlsx" disabled={busy||!route||!canEdit} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0])}}/></div>
 <p>Dán các cột nhập liệu theo thứ tự trong CSV mẫu, kiểm tra giá và chọn dòng để đặt đơn.</p><details><summary>Thứ tự cột paste</summary><p>{labels.join(" · ")}</p></details><textarea aria-label="Paste Excel" rows={2} disabled={busy||!canEdit} placeholder="Dán dữ liệu Excel / Sheets" onPaste={e=>{e.preventDefault();const lines=e.clipboardData.getData('text').replace(/\r/g,'').split('\n').filter(x=>x.trim());if(lines.length>1000){setMessage('Tối đa 1000 dòng.');return;}const next=lines.map(line=>({...blank(Number(client),Number(route)),...Object.fromEntries(line.split('\t').map((v,i)=>[fields[i],v]))}));setRows(next);setSelected(new Set(next.map(keyOf)));}}/></>}
 {results&&<div className="panel" role="status"><h3>Kết quả đặt đơn: {successes} thành công · {failures} thất bại</h3><div className="templateKindTabs"><button aria-pressed={view==='failed'} onClick={()=>setView('failed')}>{failures} đơn thất bại</button><button aria-pressed={view==='success'} onClick={()=>setView('success')}>{successes} đơn thành công</button></div>{failures===0&&<button className="primaryBtn" onClick={onAll}>Về Mọi đơn hàng</button>}<button className="secondaryBtn" disabled={busy} onClick={()=>{if(create&&onDraft){onDraft();return;}setResults(null);void load().catch(e=>setMessage(e.message));}}>Về Draft</button></div>}
 <div className="tableWrap"><table><thead><tr><th><input aria-label="Chọn tất cả dòng hiển thị" type="checkbox" disabled={busy||!canEdit||!editable.length} checked={!!editable.length&&editable.every(r=>selected.has(keyOf(r)))} onChange={e=>setSelected(prev=>{const next=new Set(prev);for(const r of editable){if(e.target.checked)next.add(keyOf(r));else next.delete(keyOf(r));}return next;})}/></th><th>Client Order ID</th><th>Dịch vụ</th><th>Giá bán (USD)</th><th>Tình trạng</th><th>Lý do cụ thể</th><th>Client</th><th>DMD ID</th>{labels.slice(1).map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>
 {shown.map((r,i)=><tr key={keyOf(r)}><td><input type="checkbox" aria-label={'Chọn '+String(r.order_id||'dòng '+(i+1))} disabled={busy||!canEdit||r.success} checked={selected.has(keyOf(r))&&!r.success} onChange={e=>setSelected(prev=>{const next=new Set(prev);if(e.target.checked)next.add(keyOf(r));else next.delete(keyOf(r));return next;})}/></td><td>{r.success?String(r.order_id||''):<input aria-label={'Client Order ID · dòng '+(i+1)} style={{minWidth:150}} value={String(r.order_id||'')} disabled={busy||!canEdit} onChange={e=>edit(r,'order_id',e.target.value)}/>}</td><td>{r.success?routes.find(x=>x.id===r.route_id)?.service+' - '+routes.find(x=>x.id===r.route_id)?.sub_service:<select aria-label={'Dịch vụ dòng '+(i+1)} value={r.route_id||''} disabled={busy||!canEdit} onChange={e=>edit(r,'route_id',Number(e.target.value))}><option value={r.route_id||''}>{routes.find(x=>x.id===r.route_id)?routes.find(x=>x.id===r.route_id)?.service+' - '+routes.find(x=>x.id===r.route_id)?.sub_service:String(r.service||'Dịch vụ ngừng hoạt động')+' - '+String(r.sub_service||'')}</option>{routes.map(x=><option value={x.id} key={x.id}>{x.service} - {x.sub_service}</option>)}</select>}</td>
 <td>{r.pricing&&r.pricing.tier!==null?r.pricing.total_charge.toFixed(2):'—'}</td><td>{r.success?'Đã đặt · Chỉ xem':states[r.draft_state||'incomplete']}</td><td className="draftReason">{(r.reasons?.length?r.reasons:[r.failure_reason]).filter(Boolean).map(x=>readableReason(String(x))).join(' ')||'—'}</td><td>{String(r.customer||clients.find(c=>c.id===r.client_user_id)?.display_name||'Client')}</td><td>{r.system_order_code||'—'}</td>
 {fields.slice(1).map((k,j)=><td key={k}>{r.success?String(r[k]??''):<input aria-label={labels[j+1]+' · dòng '+(i+1)} style={{minWidth:110}} value={String(r[k]??'')} disabled={busy||!canEdit} onChange={e=>edit(r,k,e.target.value)}/>}</td>)}</tr>)}
 </tbody></table>{!shown.length&&<p>Không có đơn phù hợp.</p>}</div>
 <div className="bulkSheetFooter"><span>{results?results.length:rows.length} dòng · {chosen.length} đã chọn</span><div className="clientUploadActions">
 {create&&!results&&<button className="secondaryBtn" disabled={busy||!canEdit||rows.length>=1000} onClick={()=>setRows(prev=>[...prev,blank(Number(client),Number(route))])}>＋ Thêm dòng</button>}
 <button className="secondaryBtn" disabled={busy||!canEdit||!rows.some(r=>!r.success)} onClick={()=>void save()}>Lưu chỉnh sửa</button><button className="primaryBtn" disabled={busy||!canEdit||!chosen.length} onClick={()=>setConfirm(true)}>{results?'Đặt lại đơn đã chọn':'Đặt đơn đã chọn'}</button>
 {!create&&!results&&<><button className="secondaryBtn" disabled={busy||!canEdit||!chosen.length} onClick={()=>setDeleting('selected')}>Xóa đã chọn</button><button className="dangerBtn" disabled={busy||!canEdit||!rows.length} onClick={()=>setDeleting('all')}>Xóa tất cả Draft</button></>}
 </div></div>

 {!canEdit&&<p>Chọn Client cụ thể để chỉnh sửa, đặt và xóa Draft.</p>}
 {confirm&&<ConfirmationDialog title="Xác nhận đặt đơn" busy={busy} onClose={()=>setConfirm(false)}><p>{chosen.some(r=>r.pricing&&r.pricing.tier!==null)?"Giá dự kiến: "+chosen.reduce((sum,r)=>sum+(r.pricing?.total_charge||0),0).toFixed(2)+" USD ("+chosen.filter(r=>r.pricing&&r.pricing.tier!==null).length+" / "+chosen.length+" đơn có giá).":"Chưa tính được giá cho các đơn đã chọn. Các dòng lỗi sẽ được giữ lại để sửa."}</p><p>Xác nhận đặt {chosen.length} đơn theo thứ tự bảng. Giá, Route và Balance được kiểm tra lại cho từng đơn. Đơn thất bại được giữ lại để sửa.</p><button className="primaryBtn" disabled={busy} onClick={()=>void save(true)}>Xác nhận đặt đơn</button><button className="secondaryBtn" onClick={()=>setConfirm(false)}>Quay lại</button></ConfirmationDialog>}
 {deleting&&<ConfirmationDialog title="Xác nhận xóa Draft" busy={busy} onClose={()=>setDeleting(null)}><p>{deleting==='all'?'Xóa tất cả Draft của Client đang chọn, kể cả dòng ngoài bộ lọc?':'Xóa '+chosen.length+' Draft đã chọn?'}</p><button className="dangerBtn" disabled={busy} onClick={()=>void remove()}>Xác nhận xóa</button><button className="secondaryBtn" onClick={()=>setDeleting(null)}>Quay lại</button></ConfirmationDialog>}
 {message&&<p role="status">{message}</p>}
 </div>;
}
