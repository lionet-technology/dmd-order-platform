"use client";
import {useState} from "react";
type Rules=Record<string,{allowed:boolean;refund_percent:number}>;
type Route={id:number;service:string;sub_service:string;supplier:string;active:number;cancellation_policy?:{rules:Rules;version:number}|null};
const stages=[["PRE_PURCHASE","Chưa mua"],["PURCHASED","Đang mua"],["ISSUED","Đã cấp Tracking/Label hoặc hoàn tất mua"],["SHIPPED","Đã bàn giao / bắt đầu vận chuyển"]];
export function CancellationPolicyPanel({route,onSaved}:{route:Route;onSaved:()=>void}){
 const [rules,setRules]=useState<Rules>(route.cancellation_policy?.rules||{}),[reason,setReason]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function save(){setBusy(true);try{
 const response=await fetch("/api/service-routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...route,cancellation_policy:rules,cancellation_reason:reason})});
 const result=await response.json();if(!response.ok)throw Error(result.error);setMessage("Đã lưu policy v"+result.cancellation_policy.version);setReason("");onSaved();
 }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="templateConfigCard"><h3>Chính sách huỷ theo Supplier</h3><p>Đủ điều kiện sẽ tự động huỷ và hoàn tiền, không cần duyệt. Đã vận chuyển chỉ được huỷ nếu Supplier policy cho phép; đơn đã giao hoặc đóng không thể huỷ. Chưa cấu hình sẽ từ chối huỷ.</p>
 {stages.map(([key,label])=><div className="templateGrid" key={key}><label><span>{label}</span><input type="checkbox" checked={rules[key]?.allowed||false} disabled={busy} onChange={e=>setRules({...rules,[key]:{allowed:e.target.checked,refund_percent:0}})}/> Cho phép huỷ</label><label><span>Tỷ lệ hoàn trên tổng đã charge (%)</span><input type="number" min="0" max="100" step="0.01" disabled={busy||!rules[key]?.allowed} value={rules[key]?.refund_percent||0} onChange={e=>setRules({...rules,[key]:{allowed:true,refund_percent:Number(e.target.value)}})}/></label></div>)}
 <label><span>Lý do / căn cứ chính sách Supplier</span><textarea value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><button className="primaryBtn" disabled={busy||!reason.trim()} onClick={()=>void save()}>Lưu chính sách</button>{message&&<p role="status">{message}</p>}</section>;
}
