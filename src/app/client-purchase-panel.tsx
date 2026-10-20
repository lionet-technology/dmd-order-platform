"use client";
import { useEffect,useState } from "react";
import { PricingPreview,type Preview } from "./pricing-preview";
type Row=Record<string,unknown>;
type Route={id:number;service:string;sub_service:string;discount_percent:number;max_cartons_per_order:number};
type Validated={row_number:number;errors:string[];input:Row;pricing:Preview|null};
const fields=["order_id","weight","length","width","height","carton_count","recipient_name","address1","address2","city","state","zip","country","phone","recipient_email","item","material","declared_value"];
const labels=["Client Order ID","Cân nặng (kg)","Dài (cm)","Rộng (cm)","Cao (cm)","Carton","Người nhận","Địa chỉ 1","Địa chỉ 2","Thành phố","Bang","ZIP","Nước","Điện thoại","Email","Sản phẩm","Chất liệu","Giá trị khai báo"];
const blank=()=>({country:"US",carton_count:1,item:"T-shirt",material:"Cotton"} as Row);
type PurchaseFailure={id:number;error:string;error_type:'DATA'|'SYSTEM'};
export function ClientPurchasePanel({onDone,initial}:{onDone:()=>void;initial?:Row|null}){
 const [manualCartonMode,setManualCartonMode]=useState<'single'|'multiple'>('single');
 const [failures,setFailures]=useState<PurchaseFailure[]>([]),[routes,setRoutes]=useState<Route[]>([]),[balance,setBalance]=useState(0),[routeId,setRouteId]=useState(""),[rows,setRows]=useState<Row[]>([initial||blank()]),[checked,setChecked]=useState<Validated[]>([]),[file,setFile]=useState<File|null>(null),[mode,setMode]=useState("manual"),[busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[saved,setSaved]=useState<Array<{id:number;order_id:string;pricing:Preview}>>([]),[selection,setSelection]=useState<number[]>([]);
 const locked=!!initial?.service_purchased_at||!!initial?.purchase_completed_at||["PURCHASED","RECONCILED"].includes(String(initial?.workflow_status));
 useEffect(()=>{void fetch("/api/client-orders").then(r=>r.json()).then(d=>{setRoutes(d.routes||[]);setBalance(d.balance||0);setRouteId(String((d.routes||[]).find((r:Route)=>initial?r.service===initial.service&&r.sub_service===initial.sub_service:true)?.id||""))})},[initial]);
 useEffect(()=>{
 if(!routeId||locked)return;
 const controller=new AbortController(),timer=setTimeout(()=>{void fetch("/api/client-orders",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"preview",route_id:Number(routeId),rows}),signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setChecked(d.rows)}).catch(e=>{if(e.name!=="AbortError")setMsg(e.message)})},300);
 return ()=>{clearTimeout(timer);controller.abort()};
 },[rows,routeId,mode,locked]);
 async function act(action:string){
 setBusy(true);setMsg("");
 try{
 const body=action==="upload"?new FormData():{action,route_id:Number(routeId),rows,order_ids:selection};
 if(body instanceof FormData){body.set("route_id",routeId);body.set("file",file!)}
 const r=await fetch("/api/client-orders",{method:"POST",...(body instanceof FormData?{body}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})}),d=await r.json();
 if(!r.ok)throw Error(d.error);
 if(action==="upload"){setChecked(d.rows);setRows(d.rows.map((r:Validated)=>r.input));setMsg('Đã đọc file, nhóm theo Client Order ID liên tiếp. Mỗi nhóm là một Draft; nếu có lỗi, sửa Excel rồi upload lại.')}
 else if(action==="save"){setFailures([]);setRows(prev=>prev.map((row,i)=>({...row,id:d.orders[i].id})));setSaved(d.orders);setSelection(d.orders.filter((o:{pricing:Preview})=>o.pricing?.eligible).map((o:{id:number})=>o.id));setMsg("Đã lưu Draft. Chọn đơn rồi Đặt mua dịch vụ.");onDone()}
 else{const failed=(d.results||[]).filter((x:{status:string})=>x.status==='FAILED') as PurchaseFailure[];const failedIds=new Set(failed.map(x=>x.id));setFailures(failed);setMsg(`Đã mua ${d.succeeded} đơn; ${d.failed} đơn chưa mua. ${d.failed?'Kiểm tra lỗi bên dưới, sửa Draft hoặc xác nhận mua lại sau khi đủ điều kiện.':'Ops đang xử lý Tracking/Label.'}`);setSaved(prev=>prev.filter(o=>failedIds.has(o.id)));setSelection([]);setRows(prev=>failed.length?prev.filter(row=>failedIds.has(Number(row.id))):[blank()]);setChecked([]);void fetch('/api/client-orders').then(r=>r.json()).then(d=>setBalance(d.balance||0));onDone()}
 }catch(e){setMsg((e as Error).message)}finally{setBusy(false)}
 }
 const chosenRoute=routes.find(r=>String(r.id)===routeId);
 const allowsMulti=Number(chosenRoute?.max_cartons_per_order||1)>1;
 function appendCarton(index:number){
  setRows(prev=>prev.map((row,i)=>{
   if(i!==index)return row;
   const existing=Array.isArray(row.carton_rows)?row.carton_rows as Row[]:[{...row}];
   if(existing.length>=Number(chosenRoute?.max_cartons_per_order||1))return row;
   const count=existing.length+1;
   const first={...Object.fromEntries(fields.map(k=>[k,row[k]??existing[0][k]])),carton_count:count};
   return {...row,carton_count:count,carton_rows:[first,...existing.slice(1),{order_id:row.order_id,carton_count:'',weight:'',length:'',width:'',height:'',item:'',material:''}]};
  }));setSaved([]);
 }
 function removeCarton(index:number,cartonIndex:number){
  setRows(prev=>prev.map((row,i)=>{
   if(i!==index)return row;
   const existing=Array.isArray(row.carton_rows)?row.carton_rows as Row[]:[{...row}];
   const remaining=existing.filter((_,j)=>j!==cartonIndex);
   if(!remaining.length)return row;
   return {...row,carton_count:remaining.length,carton_rows:remaining.map((c,j)=>j===0?{...c,carton_count:remaining.length}:{...c,carton_count:''})};
  }));setSaved([]);
 }
 function template(){const blob=new Blob([fields.join(",")+"\r\n"],{type:"text/csv"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Client_Orders.csv";a.click();URL.revokeObjectURL(url)}
 return <div className="clientPurchase"><div className="clientPurchaseHero"><div><h3>Tạo & đặt mua dịch vụ</h3><p>Lưu Draft → kiểm tra giá → đặt mua → nhận Tracking & Label.</p></div><div className="clientPurchaseBalance"><span>Balance hiện tại</span><b>{balance.toFixed(2)} USD</b></div></div>
 <label className="field"><span>Dịch vụ</span><select value={routeId} disabled={locked} onChange={e=>{setRouteId(e.target.value);setManualCartonMode('single');setChecked([]);setSaved([]);setRows([blank()])}}><option value="">Chọn dịch vụ được cấp</option>{routes.map(r=><option key={r.id} value={r.id}>{r.service} / {r.sub_service} · Discount {r.discount_percent.toFixed(4)}% từ Retail</option>)}</select></label>
 {!locked&&<><div className="templateKindTabs"><button className={mode==="manual"?"active":""} aria-pressed={mode==="manual"} onClick={()=>setMode("manual")}>Nhập tay / Paste</button><button className={mode==="upload"?"active":""} aria-pressed={mode==="upload"} onClick={()=>setMode("upload")}>Upload CSV / XLSX</button></div>
 {mode==='manual'&&allowsMulti&&<div className="templateKindTabs" role="group" aria-label="Loại Order theo Carton"><button className={manualCartonMode==='single'?'active':''} aria-pressed={manualCartonMode==='single'} onClick={()=>{setManualCartonMode('single');setRows([blank()]);setSaved([])}}>Single Carton</button><button className={manualCartonMode==='multiple'?'active':''} aria-pressed={manualCartonMode==='multiple'} onClick={()=>{setManualCartonMode('multiple');setRows([blank()]);setSaved([])}}>Multiple Cartons</button></div>}
 {mode==="upload"?<div className="clientUploadActions"><button className="secondaryBtn" onClick={template}>Tải CSV mẫu</button><input type="file" accept=".csv,.xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="primaryBtn" disabled={busy||!file||!routeId} onClick={()=>void act("upload")}>Validate & Preview</button></div>:<><p>Paste các cột theo thứ tự bên dưới từ Excel/Sheets. Dữ liệu sai vẫn có thể lưu Draft để sửa.</p><textarea rows={2} placeholder="Dán dòng TSV từ Excel/Sheets tại đây" onPaste={e=>{e.preventDefault();setRows(e.clipboardData.getData("text").trim().split(/\r?\n/).map(line=>({...blank(),...Object.fromEntries(line.split("\t").map((v,i)=>[fields[i],v]))})));setSaved([])}}/></>}
 <div className="tableWrap"><table><thead><tr>{labels.map(l=><th key={l}>{l}</th>)}<th></th></tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{fields.map(k=><td key={k}><input aria-label={labels[fields.indexOf(k)]+" · dòng "+(i+1)} style={{minWidth:105}} disabled={mode==="upload"||k==="carton_count"&&Array.isArray(r.carton_rows)&&manualCartonMode==="multiple"} title={k==="carton_count"&&manualCartonMode==="multiple"?"Carton Quantity tự tính theo danh sách Carton":undefined} value={String(r[k]??"")} onChange={e=>{setRows(prev=>prev.map((row,n)=>{if(n!==i)return row;const changed={...row,[k]:e.target.value};if(Array.isArray(row.carton_rows)){const original=row.carton_rows as Row[];changed.carton_rows=[{...original[0],[k]:e.target.value},...original.slice(1).map(c=>k==='order_id'?{...c,order_id:e.target.value}:c)];}return changed}));setSaved([])}}/></td>)}<td><button className="rowAction dangerBtn" onClick={()=>setRows(prev=>prev.filter((_,n)=>n!==i))}>Bỏ</button></td></tr>)}</tbody></table></div>
 {mode==='manual'&&manualCartonMode==='multiple'&&allowsMulti&&rows.map((order,idx)=><div className="panel" key={'carton-'+idx}><b>{String(order.order_id||'Order '+(idx+1))} · {Array.isArray(order.carton_rows)?(order.carton_rows as Row[]).length:1} Carton</b><p>Carton 1 ở bảng trên. Các Carton tiếp theo chỉ nhập thông tin kiện hàng.</p>{(Array.isArray(order.carton_rows)?(order.carton_rows as Row[]).slice(1):[]).map((carton,j)=><div key={j} className="templateGrid"><b>Carton {j+2}</b>{(['weight','length','width','height','item','material','declared_value'] as const).map(k=><label key={k}><span>{labels[fields.indexOf(k)]}</span><input aria-label={'Carton '+(j+2)+' '+k} value={String(carton[k]??'')} onChange={e=>{const value=e.target.value;setRows(prev=>prev.map((r,n)=>n!==idx?r:{...r,carton_rows:(r.carton_rows as Row[]).map((c,ci)=>ci===j+1?{...c,[k]:value,order_id:r.order_id,carton_count:''}:c)}));setSaved([])}}/></label>)}<button className="secondaryBtn" onClick={()=>removeCarton(idx,j+1)}>Bỏ Carton {j+2}</button></div>)}<button className="secondaryBtn" disabled={(Array.isArray(order.carton_rows)?(order.carton_rows as Row[]).length:1)>=Number(chosenRoute?.max_cartons_per_order||1)} onClick={()=>appendCarton(idx)}>＋ Thêm Carton</button></div>)}
 <button className="secondaryBtn" onClick={()=>{setRows(prev=>[...prev,blank()]);setSaved([])}}>＋ Thêm Order</button>
 {checked.map((r,i)=><details key={i} open={rows.length===1||r.errors.length>0}><summary>Dòng {r.row_number} · {String(rows[i]?.order_id||'Chưa có ID')} · {Array.isArray(rows[i]?.carton_rows)?(rows[i].carton_rows as Row[]).length:1} Carton · {r.errors.length?'Lỗi dữ liệu':r.pricing?.eligible?'Đủ điều kiện':'Chưa đủ điều kiện mua dịch vụ'}</summary>{r.errors.map((e,n)=><p className="error" key={n}>{e}</p>)}{Array.isArray(rows[i]?.carton_rows)&&(rows[i].carton_rows as Row[]).length>1&&<p>Các dòng Excel: {(rows[i].carton_rows as Row[]).map(c=>String(c.row_number||'?')).join(', ')}. Muốn sửa Carton, chỉnh trong Excel rồi upload lại.</p>}<PricingPreview pricing={r.pricing}/></details>)}
 <button className="secondaryBtn" disabled={busy||!routeId||!rows.length} onClick={()=>void act("save")}>Lưu Draft ({rows.length})</button></>}
 {locked&&<PricingPreview pricing={initial?.pricing as Preview}/>}
 {saved.length>0&&<div className="clientPurchaseSelections"><h3>Chọn Draft đặt mua</h3>{saved.map(o=><label key={o.id}><input type="checkbox" checked={selection.includes(o.id)} disabled={!o.pricing?.eligible} onChange={e=>setSelection(prev=>e.target.checked?[...prev,o.id]:prev.filter(id=>id!==o.id))}/>{o.order_id} · {'manual_price_pending' in (o.pricing||{})?'Admin nhập giá khi cấp Tracking/Label':o.pricing?.total_charge.toFixed(2)+' USD'} · {failures.find(f=>f.id===o.id)?.error|| (o.pricing?.eligible?'Đủ điều kiện':o.pricing?.reasons.join(' '))}</label>)}<p>Đã có giá: {saved.filter(o=>selection.includes(o.id)&&!('manual_price_pending' in (o.pricing||{}))).reduce((n,o)=>n+o.pricing.total_charge,0).toFixed(2)} USD {saved.some(o=>selection.includes(o.id)&&'manual_price_pending' in (o.pricing||{}))?' · Có đơn chờ Admin nhập giá; tổng này chưa gồm các đơn đó.':''}</p><button className="primaryBtn" disabled={busy||!selection.length} onClick={()=>void act("purchase")}>Đặt mua dịch vụ ({selection.length})</button></div>}

 {msg&&<p role="status">{msg}</p>}
 {failures.length>0&&<div role="alert" className="panel"><b>Đơn chưa mua ({failures.length})</b>{failures.map((f,i)=><p key={i}>#{f.id} · {f.error_type==='DATA'?'Lỗi dữ liệu':'Lỗi hệ thống'}: {f.error}</p>)}<p>Không tự động mua lại. Sau khi điều chỉnh/nạp Balance, bạn cần bấm xác nhận mua lại.</p></div>}</div>;
}
