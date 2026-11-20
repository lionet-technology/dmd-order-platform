"use client";

import {type FormEvent,useRef,useState} from 'react';

type Settlement={id:number;amount:string;executed_day:string;reference:string};
type Entry={id:number;supplier:string;direction:'BUY'|'SELL';name:string;amount:string;client_id:number|null;reference:string;settled:string;outstanding:string|null;settlements:Settlement[]};
type View={month:string;entries:Entry[];paid:string;received:string;net:string;by_supplier:{supplier:string;paid:string;received:string}[]};
const endpoint='/api/service-v1/supplier-addons';

export default function VndSupplierAddonTools({onChange}:{onChange:()=>void}){
 const [data,setData]=useState<View|null>(null),[month,setMonth]=useState(''),[direction,setDirection]=useState('BUY');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const receipt=useRef<{payload:string;key:string}|null>(null);
 async function load(){
  const response=await fetch(endpoint+(month?'?month='+encodeURIComponent(month):''));
  const result=await response.json();
  if(!response.ok)throw Error(result.error);
  setData(result);
  setMonth(result.month);
 }
 async function refresh(){
  setBusy(true);
  try{await load();setMessage('Đã tải Supplier Add-on.');}
  catch(error){setMessage(error instanceof Error?error.message:'Không tải được dữ liệu.');}
  finally{setBusy(false);}
 }
 async function submit(event:FormEvent<HTMLFormElement>,action:'create'|'settle',addonId?:number){
  event.preventDefault();
  const form=event.currentTarget,fields=Object.fromEntries(new FormData(form));
  if(!fields.client_id)delete fields.client_id;
  const body={...fields,action,addon_id:addonId},payload=JSON.stringify(body);
  if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
  setBusy(true);
  try{
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,request_key:receipt.current.key})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   form.reset();
   if(action==='create')setDirection('BUY');
   receipt.current=null;
   onChange();
   await load();
   setMessage('Đã ghi Supplier Add-on.');
  }catch(error){setMessage(error instanceof Error?error.message:'Không ghi được dữ liệu.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Supplier Add-on VNĐ">
  <h2>Supplier Add-on VNĐ</h2>
  <form onSubmit={event=>void submit(event,'create')}>
   <label>Supplier Add-on <input name="supplier" maxLength={500} required/></label>
   <label>Nội dung Add-on <input name="name" maxLength={200} required/></label>
   <label>Hướng giao dịch <select name="direction" value={direction} onChange={event=>setDirection(event.target.value)}>
    <option value="BUY">BUY · DMD mua</option><option value="SELL">SELL · DMD bán</option>
   </select></label>
   {direction==='SELL'&&<label>Client ID để ghi vào Balance <input name="client_id" type="number" min="1" step="1"/></label>}
   <label>Số tiền Add-on VNĐ <input name="amount" inputMode="decimal" required/></label>
   <label>Tham chiếu Add-on <input name="reference" maxLength={200} required/></label>
   <label>Lý do Add-on <input name="reason" maxLength={2000} required/></label>
   <button disabled={busy}>Tạo Supplier Add-on</button>
  </form>
  <label>Tháng dòng tiền Add-on <input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>
  <button type="button" disabled={busy} onClick={()=>void refresh()}>Tải dòng tiền Add-on</button>
  <p role="status">{message}</p>
  {data&&<>
   <p>{data.month} · Đã trả {data.paid} VNĐ · Đã thu {data.received} VNĐ · Dòng tiền ròng {data.net} VNĐ</p>
   <ul>{data.by_supplier.map(row=><li key={row.supplier}>{row.supplier} · Trả {row.paid} VNĐ · Thu {row.received} VNĐ</li>)}</ul>
   {data.entries.map(entry=><article key={entry.id}>
    <h3>{entry.name}</h3>
    <p>{entry.supplier} · {entry.direction} · {entry.reference} · {entry.amount} VNĐ</p>
    {entry.client_id!==null
     ?<p>Đã ghi phí vào Balance Client {entry.client_id}. Khoản trả sau đi qua luồng nạp tiền.</p>
     :<p>Đã {entry.direction==='BUY'?'trả':'thu'} {entry.settled} VNĐ · Còn {entry.outstanding} VNĐ</p>}
    {entry.settlements.length>0&&<ul>{entry.settlements.map(item=><li key={item.id}>{item.executed_day} · {item.amount} VNĐ · {item.reference}</li>)}</ul>}
    {entry.outstanding!==null&&entry.outstanding!=='0'&&<form onSubmit={event=>void submit(event,'settle',entry.id)}>
     <label>Số tiền thực {entry.direction==='BUY'?'trả':'thu'} <input name="amount" inputMode="decimal" required/></label>
     <label>Ngày thực hiện <input name="executed_day" type="date" required/></label>
     <label>Tham chiếu thanh toán <input name="reference" maxLength={200} required/></label>
     <label>Lý do thanh toán <input name="reason" maxLength={2000} required/></label>
     <button disabled={busy}>Ghi thanh toán Add-on</button>
    </form>}
   </article>)}
  </>}
 </section>;
}
