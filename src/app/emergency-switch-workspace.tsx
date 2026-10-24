"use client";
import {useEffect,useState} from "react";
type Tracking={old_tracking_id:number;old_tracking:string;carton_number:number|null};
type Item={source_dmd_id:number;client_order_id:string;original_selling_price:number;original_status:string;resolved_at:string|null;last_error?:string|null;trackings:Tracking[];current?:{est_net_cost:number;system_order_code:string}};
type Route={id:number;service:string;sub_service:string;supplier:string;active:number;warehouse_hold:number};
type Draft={estimate:string;fields:Record<number,{tracking:string;label:string}>};
export function EmergencySwitchWorkspace({routeId,holdId}:{routeId:number;holdId:number}){
 const [items,setItems]=useState<Item[]>([]),[routes,setRoutes]=useState<Route[]>([]),[route,setRoute]=useState("");
 const [drafts,setDrafts]=useState<Record<number,Draft>>({}),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [excel,setExcel]=useState<File|null>(null);
 const url="/api/service-routes/"+routeId+"/emergency";
 async function load(){
  const [a,b]=await Promise.all([fetch(url+"?hold_id="+holdId),fetch("/api/service-routes")]);
  const x=await a.json(),y=await b.json();if(!a.ok||!b.ok)throw Error(x.error||y.error);
  setItems(x.orders||[]);setRoutes(y||[]);
 }
 useEffect(()=>{let live=true;Promise.all([fetch(url+"?hold_id="+holdId),fetch("/api/service-routes")]).then(async ([a,b])=>{
  const x=await a.json(),y=await b.json();if(!a.ok||!b.ok)throw Error(x.error||y.error);
  if(live){setItems(x.orders||[]);setRoutes(y||[])}
 }).catch(e=>{if(live)setMessage(e.message)});return ()=>{live=false}},[url,holdId]);
 const eligible=routes.filter(r=>r.id!==routeId&&r.active&&r.warehouse_hold!==1);
 const pending=items.filter(i=>!i.resolved_at);
 const get=(i:Item)=>drafts[i.source_dmd_id]||{estimate:"",fields:{}};
 function setField(i:Item,trackingId:number,key:"tracking"|"label",value:string){
  setDrafts(p=>{
   const old=p[i.source_dmd_id]||{estimate:"",fields:{}};
   const field=old.fields[trackingId]||{tracking:"",label:""};
   return {...p,[i.source_dmd_id]:{...old,fields:{...old.fields,[trackingId]:{...field,[key]:value}}}};
  });
 }
 function replacing(i:Item){return Object.values(get(i).fields).some(f=>f.tracking.trim()||f.label.trim())}
 function ready(i:Item){return !!route&&confirmed&&(!replacing(i)||i.trackings.every(t=>!!get(i).fields[t.old_tracking_id]?.tracking.trim()&&!!get(i).fields[t.old_tracking_id]?.label.trim()))}
 async function submit(i:Item){
  const d=get(i);
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
   action:"switch",hold_id:holdId,order_id:i.source_dmd_id,new_route_id:Number(route),estimated_net_cost:d.estimate,
   trackings:(replacing(i)?i.trackings:[]).map(t=>({old_tracking_id:t.old_tracking_id,new_tracking:d.fields[t.old_tracking_id]?.tracking||"",new_label_url:d.fields[t.old_tracking_id]?.label||""}))
  })});
  const result=await response.json();if(!response.ok)throw Error(result.error||"Đổi Route thất bại");
 }
 async function importExcel(){
  if(!excel||!confirmed)return;setBusy(true);
  try{
   const data=new FormData();data.set("action","import_switch_excel");data.set("hold_id",String(holdId));data.set("file",excel);
   const response=await fetch(url,{method:"POST",body:data}),result=await response.json();
   if(!response.ok)throw Error(result.error||"Import Excel thất bại.");
   await load();
   setMessage("Excel: "+result.success+" Order thành công, "+result.failed+" lỗi, "+result.skipped+" dòng bỏ qua. "+(result.errors||[]).map((e:{client_order_id:string;error:string})=>e.client_order_id+": "+e.error).join("; "));
  }catch(e){setMessage("Lỗi Import Excel: "+(e as Error).message)}finally{setBusy(false)}
 }
 async function run(list:Item[]){
  setBusy(true);const errors:string[]=[];let success=0;
  for(const i of list){try{await submit(i);success++}catch(e){errors.push(i.client_order_id+": "+(e as Error).message)}}
  try{await load()}catch(e){errors.push((e as Error).message)}
  setMessage("Đã đổi "+success+"/"+list.length+" Order. "+errors.join("; "));setBusy(false);
 }
 return <section className="templateConfigCard" aria-label="Emergency đổi Route Tracking Label">
  <h3>Emergency · Đổi Route trên cùng Order</h3>
  <p>Giữ nguyên DMD ID, Client Order ID, giá bán và Balance. Mỗi Order được lưu trọn vẹn; lỗi không ảnh hưởng Order khác. Để trống Tracking/Label mới nếu chỉ đổi Route.</p>
  <label>Route mới<select aria-label="Emergency Route mới" value={route} onChange={e=>setRoute(e.target.value)}>
   <option value="">Chọn Route Active</option>{eligible.map(r=><option key={r.id} value={r.id}>{r.service} / {r.sub_service} / {r.supplier} (r{r.id})</option>)}
  </select></label>
  <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Tôi đã xác nhận tất cả Carton chưa bàn giao và đã kiểm tra Route cùng Tracking/Label cần giữ hoặc thay.</label>
  <p>{pending.length} Order chờ xử lý; {items.length-pending.length} Order đã đổi.</p>
  <div className="routeVariablesEditor">
   <b>Import Excel để xử lý hàng loạt</b>
   <p>Tải Excel tại phần Hold phía trên. Điền Route ID mới trên từng dòng cần xử lý, Tracking/Label mới và Net Cost nếu muốn thay. Để trống toàn bộ Tracking/Label mới của Order để giữ nguyên. Dòng để trống Route ID mới sẽ được bỏ qua. Nếu thay Tracking/Label, phải nhập đủ tất cả Tracking đang dùng của cùng Order.</p>
   <label>Excel Emergency (.xlsx)<input type="file" accept=".xlsx" onChange={e=>setExcel(e.target.files?.[0]||null)}/></label>
   <button className="secondaryBtn" disabled={busy||!confirmed||!excel} onClick={()=>void importExcel()}>Kiểm tra & xử lý Excel</button>
  </div>
  <div role="alert" aria-label="Order Emergency chưa xử lý">{pending.length>0&&<p>Các Order bên dưới vẫn đang Hold. Order lỗi được giữ lại để sửa và thử lại; Order thành công đã ra khỏi hàng chờ.</p>}</div>
  {pending.map(i=><section key={i.source_dmd_id} className="routeVariablesEditor">
   <b>{i.current?.system_order_code||"DMD #"+i.source_dmd_id} · {i.client_order_id}</b>
   {i.last_error&&<p role="alert">Cần xử lý lại: {i.last_error}</p>}
   <p>Giá bán giữ nguyên: {Number(i.original_selling_price).toFixed(2)} USD · {i.original_status}</p>
   <label>Estimated Net Cost mới (USD; để trống để giữ nguyên)
    <input type="number" step="0.01" min="0" placeholder={String(i.current?.est_net_cost??0)}
     value={get(i).estimate} onChange={e=>setDrafts(p=>({...p,[i.source_dmd_id]:{...get(i),estimate:e.target.value}}))}/>
   </label>
   {i.trackings.map(t=><div key={t.old_tracking_id} className="templateGrid">
    <p>Carton {t.carton_number??"—"} · Tracking cũ: {t.old_tracking}</p>
    <label>Tracking mới<input value={get(i).fields[t.old_tracking_id]?.tracking||""} onChange={e=>setField(i,t.old_tracking_id,"tracking",e.target.value)}/></label>
    <label>URL Label mới<input value={get(i).fields[t.old_tracking_id]?.label||""} onChange={e=>setField(i,t.old_tracking_id,"label",e.target.value)}/></label>
   </div>)}
   <button className="primaryBtn" disabled={busy||!ready(i)} onClick={()=>void run([i])}>Chuyển Order này</button>
  </section>)}
  <button className="secondaryBtn" disabled={busy||!pending.some(ready)} onClick={()=>void run(pending.filter(ready))}>Chuyển các Order sẵn sàng ({pending.filter(ready).length})</button>
  {message&&<p role="status">{message}</p>}
 </section>;
}
