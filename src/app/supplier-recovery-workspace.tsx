"use client";

import {useRef,useState} from "react";

type Attempt={lot_id:number;epoch:number;supplier:string;trackings:string[]};
type Item={client_claim_id:number;decision_id:number;order_id:number;order_code:string;refund_vnd:string|null;attempts:Attempt[];needs_review:boolean;supplier_claim_id:number|null;recovered_vnd:string;unrecovered_vnd:string|null;recovery_status:string};

export function SupplierRecoveryWorkspace({canGroup=false}:{canGroup?:boolean}){
 const [items,setItems]=useState<Item[]|null>(null);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const receipt=useRef<{payload:string;key:string}|null>(null);
 const key=(item:Item)=>item.client_claim_id+":"+item.order_id;
 async function load(){
  setError("");
  try{
   const response=await fetch("/api/orders/supplier-recovery");
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   setItems(result.items);
  }catch(error){
   setError((error as Error).message);
  }
 }

 const selections=(items??[]).flatMap(item=>{
  const attempt=item.attempts.find(a=>a.lot_id+":"+a.epoch===selected[key(item)]);
  return attempt&&!item.supplier_claim_id?[{item,attempt}]:[];
 });
 const suppliers=new Set(selections.map(({attempt})=>attempt.supplier));
 async function group(form:FormData){
  setError("");
  setMessage("");
  setBusy(true);
  try{
   const input={
    action:"claim_group_recovery",supplier:selections[0].attempt.supplier,
    amount:String(form.get("amount")),reference:String(form.get("reference")),
    evidence:String(form.get("evidence")),reason:String(form.get("reason")),
    sources:selections.map(({item,attempt})=>({
     client_claim_id:item.client_claim_id,decision_id:item.decision_id,order_id:item.order_id,
     lot_id:attempt.lot_id,epoch:attempt.epoch,
    })),
   };
   const payload=JSON.stringify(input);
   if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
   const response=await fetch("/api/service-v1/suppliers",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...input,request_key:receipt.current.key})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   setSelected({});
   setMessage("Đã tạo Supplier Claim. Finance hoặc BOD có thể rà soát và duyệt.");
   await load();
  }catch(error){
   setError((error as Error).message);
  }finally{
   setBusy(false);
  }
 }

 return <details onToggle={event=>{if(event.currentTarget.open)void load()}}>
  <summary>Pending Supplier Recovery</summary>
  {error&&<p role="alert">{error}</p>}
  {message&&<p role="status">{message}</p>}
  {items===null?<p role="status">Đang tải…</p>:items.length===0?
   <p>Chưa có Order từ Client Claim đã duyệt hoàn tiền.</p>:
   <div className="tableWrap"><table>
    <thead><tr><th>Order</th><th>Client Claim</th><th>Refund VNĐ</th><th>Lượt fulfillment</th><th>Đã duyệt thu</th><th>Chưa recovery</th><th>Trạng thái</th></tr></thead>
    <tbody>{items.map(item=><tr key={key(item)}>
     <td>{item.order_code}</td><td>#{item.client_claim_id}</td><td>{item.refund_vnd??"—"}</td>
     <td>{canGroup&&!item.needs_review&&!item.supplier_claim_id?
     <select aria-label={"Lượt fulfillment "+item.order_code+" Claim "+item.client_claim_id} value={selected[key(item)]??""}
      onChange={event=>setSelected(previous=>({...previous,[key(item)]:event.target.value}))}>
      <option value="">Chọn lượt để gom Claim</option>
      {item.attempts.map(attempt=><option key={attempt.lot_id+":"+attempt.epoch} value={attempt.lot_id+":"+attempt.epoch}>
       {attempt.supplier} · Lot #{attempt.lot_id} · Lượt {attempt.epoch} {attempt.trackings.join(", ")}
      </option>)}
     </select>:item.attempts.map(attempt=><div key={attempt.lot_id+":"+attempt.epoch}>
      {attempt.supplier||"Thiếu Supplier"} · Lot #{attempt.lot_id} · Lượt {attempt.epoch} {attempt.trackings.join(", ")}
     </div>)}</td>
     <td>{item.recovered_vnd}</td><td>{item.unrecovered_vnd??"—"}</td>
     <td>{item.supplier_claim_id?"Supplier Claim #"+item.supplier_claim_id+(item.recovery_status==="IN_CLAIM"?" · Chờ duyệt":" · Đã quyết định"):item.needs_review?"Cần rà soát căn cứ":"Chờ xử lý"}</td>
    </tr>)}</tbody>
   </table></div>}
  {canGroup&&selections.length>0&&<form onSubmit={event=>{event.preventDefault();void group(new FormData(event.currentTarget))}}>
   <p>{selections.length} Order đã chọn{ suppliers.size>1?" · Chọn các lượt thuộc cùng một Supplier":""}</p>
   <label>Số tiền đề nghị (VNĐ)<input name="amount" inputMode="decimal" required/></label>
   <label>Tham chiếu<input name="reference" required/></label>
   <label>Chứng từ<input name="evidence" required/></label>
   <label>Lý do<input name="reason" required/></label>
   <button disabled={busy||suppliers.size!==1}>Tạo một Supplier Claim</button>
  </form>}
 </details>;
}
