"use client";

import {useState} from "react";
import {EmergencyHoldPanel} from "./emergency-hold-panel";

type Route={id:number;service:string;sub_service:string;supplier:string;hold_id:number|null;pending:number};

export function OrdersEmergencyWorkspace({onSaved}:{onSaved:()=>void}){
 const [routes,setRoutes]=useState<Route[]>([]);
 const [routeId,setRouteId]=useState("");
 const [scope,setScope]=useState("SUB_SERVICE");
 const [reason,setReason]=useState("");
 const [opened,setOpened]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const url="/api/orders/emergency-hold";

 async function load(){
  const response=await fetch(url);
  const result=await response.json();
  if(!response.ok)throw Error(result.error);
  setRoutes(result.routes);
 }

 function reload(){
  void load().catch(error=>setMessage(error.message));
 }

 async function hold(){
  setBusy(true);
  setMessage("");
  try{
   const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({route_id:Number(routeId),scope,reason})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   await load();
   setReason("");
   setMessage("Đã áp dụng Emergency Hold.");
   onSaved();
  }catch(error){
   setMessage((error as Error).message);
  }finally{
   setBusy(false);
  }
 }

 return <details onToggle={event=>{if(event.currentTarget.open)reload()}}>
  <summary>Emergency Hold</summary>
  <section className="templateConfigCard">
   <label>Phạm vi <select value={scope} onChange={event=>setScope(event.target.value)}>
    <option value="SUB_SERVICE">Toàn bộ SubService</option>
    <option value="ROUTE">Một Route</option>
   </select></label>
   <label>Route <select value={routeId} onChange={event=>setRouteId(event.target.value)}>
    <option value="">Chọn Route</option>
    {routes.map(route=><option key={route.id} value={route.id}>{route.service} / {route.sub_service} / {route.supplier}</option>)}
   </select></label>
   <label>Lý do nội bộ <textarea value={reason} maxLength={2000} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={busy||!routeId||!reason.trim()} onClick={()=>void hold()}>Áp dụng Emergency Hold</button>
   {message&&<p role="status">{message}</p>}
   {routes.filter(route=>route.hold_id!==null).map(route=><div key={route.id}>
    <button onClick={()=>setOpened(opened===route.id?null:route.id)} aria-expanded={opened===route.id}>
     {route.service} / {route.sub_service} / {route.supplier} · {route.pending} Order đang Hold
    </button>
    {opened===route.id&&<EmergencyHoldPanel routeId={route.id} onSaved={()=>{reload();onSaved()}}/>}
   </div>)}
  </section>
 </details>;
}
