"use client";
import {useEffect,useState} from "react";
type Hold={id:number;undone_at:string|null;reason:string};
export function EmergencyHoldPanel({routeId,onSaved}:{routeId:number;onSaved:()=>void}){
 const [holds,setHolds]=useState<Hold[]>([]),[reason,setReason]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const url="/api/service-routes/"+routeId+"/emergency";
 useEffect(()=>{let current=true;setHolds([]);fetch(url).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(current)setHolds(d.holds);}).catch(e=>{if(current)setMessage(e.message)});return ()=>{current=false};},[url]);
 async function act(action:string,holdId?:number){setBusy(true);try{
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,hold_id:holdId,reason})}),d=await r.json();if(!r.ok)throw Error(d.error);
 const result=await fetch(url);const status=await result.json();if(!result.ok)throw Error(status.error);setHolds(status.holds);setMessage(action==="hold"?"Đã Hold; giá và Balance giữ nguyên.":"Đã khôi phục trạng thái trước Hold.");onSaved();
 }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 async function download(id:number){try{const r=await fetch(url+"?hold_id="+id+"&format=xlsx");if(!r.ok){const d=await r.json();throw Error(d.error)}const blob=await r.blob(),href=URL.createObjectURL(blob),a=document.createElement("a");a.href=href;a.download="Emergency-Hold-"+id+".xlsx";a.click();URL.revokeObjectURL(href);}catch(e){setMessage((e as Error).message)}}
 const active=holds.find(h=>!h.undone_at);
 return <section className="templateConfigCard"><h3>Emergency Hold — giai đoạn 1</h3><p>Tạm chặn route và các đơn chưa bàn giao đủ điều kiện. Không huỷ, không đổi giá, không hoàn tiền. Undo khôi phục trạng thái gốc. Huỷ để tạo lại chưa được bật.</p>
 {active?<><p>Đang Hold #{active.id}: {active.reason}</p><button disabled={busy} onClick={()=>void act("undo",active.id)}>Undo Emergency Hold</button></>:<><label>Lý do Emergency Hold<textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason.trim()} onClick={()=>void act("hold")}>Emergency Hold</button></>}
 {holds.map(h=><p key={h.id}>Hold #{h.id} {h.undone_at?"— đã Undo":""} <button onClick={()=>void download(h.id)}>Tải danh sách Excel (chỉ xem; chưa cho nhập lại)</button></p>)}
 {message&&<p role="status">{message}</p>}</section>;
}
