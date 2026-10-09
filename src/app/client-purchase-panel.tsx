"use client";
import { useEffect,useState } from "react";
import { PricingPreview,type Preview } from "./pricing-preview";
type Row=Record<string,unknown>;
type Route={id:number;service:string;sub_service:string;discount_percent:number};
type Validated={row_number:number;errors:string[];input:Row;pricing:Preview|null};
const fields=["order_id","weight","length","width","height","carton_count","recipient_name","address1","address2","city","state","zip","country","phone","recipient_email","item","material","declared_value"];
const labels=["Client Order ID","Cân nặng (kg)","Dài (cm)","Rộng (cm)","Cao (cm)","Carton","Người nhận","Địa chỉ 1","Địa chỉ 2","Thành phố","Bang","ZIP","Nước","Điện thoại","Email","Sản phẩm","Chất liệu","Giá trị khai báo"];
const blank=()=>({country:"US",carton_count:1,item:"T-shirt",material:"Cotton"} as Row);
export function ClientPurchasePanel({onDone,initial,support=false}:{onDone:()=>void;initial?:Row|null;support?:boolean}){
 const [routes,setRoutes]=useState<Route[]>([]),[balance,setBalance]=useState(0),[routeId,setRouteId]=useState(""),[rows,setRows]=useState<Row[]>([initial||blank()]),[checked,setChecked]=useState<Validated[]>([]),[file,setFile]=useState<File|null>(null),[mode,setMode]=useState("manual"),[busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[saved,setSaved]=useState<Array<{id:number;order_id:string;pricing:Preview}>>([]),[selection,setSelection]=useState<number[]>([]);
 const locked=!!initial?.service_purchased_at||!!initial?.purchase_completed_at||["PURCHASED","RECONCILED"].includes(String(initial?.workflow_status));
 useEffect(()=>{
   let cancelled=false;
   void (async()=>{
     const response=await fetch(support?`/api/order-routes?clientId=${initial?.client_user_id}`:"/api/client-orders");
     const data=await response.json();if(!response.ok)throw Error(data.error||"Không thể tải dịch vụ.");
     if(cancelled)return;
     const choices=(support?data:data.routes||[]) as Route[];
     setRoutes(choices.map(r=>({...r,discount_percent:Number(r.discount_percent||0)})));
     if(!support)setBalance(Number(data.balance||0));
     const current=choices.find(r=>Number(r.id)===Number(initial?.route_id))||choices.find(r=>initial?r.service===initial.service&&r.sub_service===initial.sub_service:true);
     setRouteId(String(current?.id||""));
   })().catch(e=>{if(!cancelled)setMsg(e.message)});
   return ()=>{cancelled=true};
 },[initial,support]);
 useEffect(()=>{
 if(!routeId||locked||support)return;
 const controller=new AbortController(),timer=setTimeout(()=>{void fetch("/api/client-orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"preview",route_id:Number(routeId),rows}),signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setChecked(d.rows)}).catch(e=>{if(e.name!=="AbortError")setMsg(e.message)})},300);
 return ()=>{clearTimeout(timer);controller.abort()};
 },[rows,routeId,mode,locked,support]);
 async function act(action:string){
 setBusy(true);setMsg("");
 try{
 const body=action==="upload"?new FormData():{action,route_id:Number(routeId),rows,order_ids:saved.filter(o=>selection.includes(o.id)).map(o=>o.id),client_id:initial?.client_user_id};
 if(body instanceof FormData){body.set("route_id",routeId);body.set("file",file!)}
 const r=await fetch(support?"/api/client-drafts":"/api/client-orders",{method:"POST",...(body instanceof FormData?{body}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})}),d=await r.json();
 if(!r.ok)throw Error(d.error);
 if(action==="upload"){setChecked(d.rows);setRows(d.rows.map((r:Validated)=>r.input));setMsg("Đã đọc file; kiểm tra từng dòng trước khi lưu.")}
 else if(action==="save"){setRows(prev=>prev.map((row,i)=>({...row,id:d.orders[i].id})));setSaved(d.orders);setSelection(d.orders.filter((o:{pricing:Preview})=>o.pricing?.eligible).map((o:{id:number})=>o.id));setMsg(support?"Đã lưu hỗ trợ Draft. Client sẽ xác nhận đặt lại.":"Đã lưu Draft. Chọn đơn rồi Đặt mua dịch vụ.");onDone()}
 else{setMsg(`Đã đặt ${d.orders.length} đơn. ${(d.failures||[]).map((f:{id:number;error:string})=>`Draft #${f.id}: ${f.error}`).join(" · ")}`);setSaved([]);setSelection([]);setRows([blank()]);setChecked([]);void fetch("/api/client-orders").then(r=>r.json()).then(d=>setBalance(d.balance||0));onDone()}
 }catch(e){setMsg((e as Error).message)}finally{setBusy(false)}
 }
 function template(){const blob=new Blob([fields.join(",")+"\r\n"],{type:"text/csv"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Client_Orders.csv";a.click();URL.revokeObjectURL(url)}
 return <div className="clientPurchase"><div className="clientPurchaseHero"><div><h3>{support?"Hỗ trợ Draft của Client":"Tạo & đặt mua dịch vụ"}</h3><p>{support?"Sửa dữ liệu và lưu Draft. Client sẽ kiểm tra giá và xác nhận đặt lại.":"Lưu Draft → kiểm tra giá → đặt mua → nhận Tracking & Label."}</p></div>{!support&&<div className="clientPurchaseBalance"><span>Balance hiện tại</span><b>{balance.toFixed(2)} USD</b></div>}</div>
 <label className="field"><span>Dịch vụ</span><select value={routeId} disabled={locked} onChange={e=>{setRouteId(e.target.value);setChecked([]);setSaved([])}}><option value="">Chọn dịch vụ được cấp</option>{routes.map(r=><option key={r.id} value={r.id}>{r.service}{r.sub_service?" - "+r.sub_service:""}{!support?" · Discount "+r.discount_percent.toFixed(2)+"% từ Retail":""}</option>)}</select></label>
 {!locked&&<><div className="templateKindTabs"><button className={mode==="manual"?"active":""} aria-pressed={mode==="manual"} onClick={()=>setMode("manual")}>Nhập tay / Paste</button><button className={mode==="upload"?"active":""} aria-pressed={mode==="upload"} onClick={()=>setMode("upload")}>Upload CSV / XLSX</button></div>
 {mode==="upload"?<div className="clientUploadActions"><button className="secondaryBtn" onClick={template}>Tải CSV mẫu</button><input type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="primaryBtn" disabled={busy||!file||!routeId} onClick={()=>void act("upload")}>Validate & Preview</button></div>:<><p>Paste các cột theo thứ tự bên dưới từ Excel/Sheets. Dữ liệu sai vẫn có thể lưu Draft để sửa.</p><textarea rows={2} placeholder="Dán dòng TSV từ Excel/Sheets tại đây" onPaste={e=>{e.preventDefault();setRows(e.clipboardData.getData("text").trim().split(/\r?\n/).map(line=>({...blank(),...Object.fromEntries(line.split("\t").map((v,i)=>[fields[i],v]))})));setSaved([])}}/></>}
 <div className="tableWrap"><table><thead><tr>{labels.map(l=><th key={l}>{l}</th>)}<th></th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{fields.map(k=><td key={k}><input aria-label={labels[fields.indexOf(k)]+" · dòng "+(i+1)} style={{minWidth:105}} value={String(r[k]??"")} onChange={e=>{setRows(prev=>prev.map((row,n)=>n===i?{...row,[k]:e.target.value}:row));setSaved([])}}/></td>)}<td><button className="rowAction dangerBtn" onClick={()=>setRows(prev=>prev.filter((_,n)=>n!==i))}>Bỏ</button></td></tr>)}</tbody></table></div>
 <button className="secondaryBtn" onClick={()=>{setRows(prev=>[...prev,blank()]);setSaved([])}}>＋ Thêm Order</button>
 {checked.map((r,i)=><details key={i} open={rows.length===1}><summary>Dòng {r.row_number} · {String(rows[i]?.order_id||"Chưa có ID")} · {r.errors.length?"Lỗi dữ liệu":r.pricing?.eligible?"Đủ điều kiện":"Không đủ điều kiện mua dịch vụ"}</summary>{!r.pricing&&r.errors.map((e,n)=><p className="error" key={n}>{e}</p>)}<PricingPreview pricing={r.pricing}/></details>)}
 <button className="secondaryBtn" disabled={busy||!routeId||!rows.length} onClick={()=>void act("save")}>Lưu Draft ({rows.length})</button></>}
 {locked&&<PricingPreview pricing={initial?.pricing as Preview}/>}
 {!support&&saved.length>0&&<div className="clientPurchaseSelections"><h3>Chọn Draft đặt mua</h3>{saved.map(o=><label key={o.id}><input type="checkbox" checked={selection.includes(o.id)} disabled={!o.pricing?.eligible} onChange={e=>setSelection(prev=>e.target.checked?[...prev,o.id]:prev.filter(id=>id!==o.id))}/>{o.order_id} · {o.pricing?.total_charge.toFixed(2)} USD · {o.pricing?.eligible?"Đủ điều kiện":o.pricing?.reasons.join(" ")}</label>)}<p>Tổng chọn: {saved.filter(o=>selection.includes(o.id)).reduce((n,o)=>n+o.pricing.total_charge,0).toFixed(2)} USD</p><button className="primaryBtn" disabled={busy||!selection.length} onClick={()=>void act("purchase")}>Đặt mua dịch vụ ({selection.length})</button></div>}

 {msg&&<p role="status">{msg}</p>}</div>;
}
