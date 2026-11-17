"use client";
import {useState} from 'react';
type Notice={id:number;claim_id:number|null;kind:string;delta:string;approved:string|null;revision:number|null;is_read:number;created_at:string};
export default function VndClaimNotifications({client,role}:{client:string;role:string}){
 const [items,setItems]=useState<Notice[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 if(!['CLIENT','SALES'].includes(role))return null;
 async function load(id?:number){setBusy(true);try{if(id){const r=await fetch('/api/service-v1/claim-notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_id:Number(client),id})});if(!r.ok)throw Error('Không xác nhận được thông báo.');}const r=await fetch('/api/service-v1/claim-notifications?client_id='+encodeURIComponent(client)),d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items);setMessage('Đã tải thông báo Claim.');}catch(e){setMessage(e instanceof Error?e.message:'Không tải được.');}finally{setBusy(false);}}
 return <section aria-label="Thông báo Claim VNĐ"><button disabled={busy||!client} onClick={()=>void load()}>Tải thông báo Claim</button>{items.map(n=><p key={n.id}>Claim {n.claim_id??'Pool Client'} · {n.kind} · Delta pool {n.delta} VNĐ · Tổng duyệt {n.approved??'—'} · {n.created_at} {n.is_read?'Đã đọc':<button disabled={busy} onClick={()=>void load(n.id)}>Đánh dấu đã đọc {n.id}</button>}</p>)}<p role="status">{message}</p></section>;
}
