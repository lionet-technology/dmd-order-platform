"use client";
import {useEffect,useState} from 'react';
export function UpsGlobalControls(){
 const [current,setCurrent]=useState<number|null>(null),[draft,setDraft]=useState<number|null>(null),[fuel,setFuel]=useState(''),[vat,setVat]=useState(''),[broker,setBroker]=useState(''),[customs,setCustoms]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{fetch('/api/service-v1/ups-globals').then(r=>r.json()).then(d=>{setCurrent(d.confirmed?.id??null);if(d.confirmed){const g=JSON.parse(d.confirmed.variables_json);setFuel(String(g.fuel*100));setVat(String(g.vat*100));setBroker(String(g.us_broker*100));setCustoms(String(g.customs_per_kg_vnd));}}).catch(()=>setMessage('Không tải được biến UPS.'));},[]);
 async function submit(confirm:boolean){
  try{
   if(!confirm&&[fuel,vat,broker,customs].some(x=>!x.trim()))throw Error('Nhập đủ biến UPS đã xác nhận.');
   const body=confirm?{action:'CONFIRM',version_id:draft,expected_previous_id:current,confirmed:true}:{action:'SAVE',variables:{fuel:Number(fuel)/100,vat:Number(vat)/100,us_broker:Number(broker)/100,customs_per_kg_vnd:Number(customs)}};
   const r=await fetch('/api/service-v1/ups-globals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,request_key:crypto.randomUUID()})}),d=await r.json();if(!r.ok)throw Error(d.error);
   if(confirm){setCurrent(draft);setDraft(null);}else setDraft(d.result.id);setMessage(confirm?'Đã xác nhận biến UPS; giá mới áp dụng cho đơn chưa phát hành.':'Đã lưu nháp biến UPS; kiểm tra trước xác nhận.');
  }catch(e){setMessage(e instanceof Error?e.message:'Không ghi được.');}
 }
 return <details><summary>Biến UPS · hiện hành #{current??'Chưa xác nhận'}</summary><p>Fuel/VAT/Broker nhập %. Customs nhập VNĐ/kg. Xác nhận không phát hành account đang chờ.</p>{[['Fuel %',fuel,setFuel],['VAT %',vat,setVat],['Broker %',broker,setBroker],['Customs VNĐ/kg',customs,setCustoms]].map(([label,value,set])=><label key={String(label)}>{String(label)} <input type="number" min="0" step="any" value={String(value)} onChange={e=>{(set as (v:string)=>void)(e.target.value);setDraft(null);}}/></label>)}<button onClick={()=>void submit(false)}>Lưu nháp biến UPS</button><button disabled={!draft} onClick={()=>void submit(true)}>Xác nhận biến UPS #{draft??''}</button><p role="status">{message}</p></details>;
}
