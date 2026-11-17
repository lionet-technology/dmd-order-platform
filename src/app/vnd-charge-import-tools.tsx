"use client";
import {useRef,useState} from 'react';
type Item={order_code:string;kind:string;amount:string;reference:string;reason:string};
export default function VndChargeImportTools({client,onChange}:{client:string;onChange:()=>void}){
 const [file,setFile]=useState<File|null>(null),[items,setItems]=useState<Item[]>([]),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const receipt=useRef<{payload:string;key:string}|null>(null);
 async function run(save:boolean){
  setBusy(true);try{
   let url='/api/service-v1/charges-import',body:BodyInit,headers:HeadersInit|undefined;
   if(save){
    const payload=JSON.stringify({action:'import_charges',client_id:Number(client),items,reason});if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
    url='/api/service-v1/operations';headers={'content-type':'application/json'};body=JSON.stringify({...JSON.parse(payload),request_key:receipt.current.key});
   }else{if(!file)throw Error('Chọn file Excel.');const form=new FormData();form.set('file',file);form.set('client_id',client);body=form;}
   const r=await fetch(url,{method:'POST',headers,body}),d=await r.json();if(!r.ok)throw Error(d.error);
   if(save){setMessage('Đã ghi phí/thuế. Dòng cùng tham chiếu và nội dung không ghi lần hai.');setItems([]);onChange();}else{setItems(d.items);setMessage('Đã xem trước, chưa ghi tiền. Kiểm tra nội dung rồi xác nhận.');}
  }catch(e){setMessage(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);}
 }
 return <section aria-label="Import phí thuế Client"><h3>Import phụ phí/thuế sau vận chuyển</h3><p>Excel: Order ID | Loại | Số tiền VNĐ | Tham chiếu | Lý do. Loại surcharge hoặc tax; Order ID dạng chữ; tham chiếu duy nhất cho từng dòng trong tài khoản Client. Chỉ đơn đã charge, chưa huỷ. Phí thu Client độc lập với cost Supplier.</p>
 <label>File phí/thuế Client <input type="file" accept=".xlsx" onChange={e=>{setFile(e.target.files?.[0]??null);setItems([]);}}/></label><button disabled={busy||!file||!client} onClick={()=>void run(false)}>Xem trước phí/thuế</button>
 {!!items.length&&<><div style={{overflowX:'auto'}}><table><thead><tr><th>Order</th><th>Loại</th><th>VNĐ</th><th>Tham chiếu</th><th>Lý do</th></tr></thead><tbody>{items.map((r,i)=><tr key={i}><td>{r.order_code}</td><td>{r.kind}</td><td>{r.amount}</td><td>{r.reference}</td><td>{r.reason}</td></tr>)}</tbody></table></div><label>Lý do ghi lô phí/thuế <input value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason} onClick={()=>void run(true)}>Xác nhận ghi {items.length} dòng phí/thuế</button></>}<p role="status">{message}</p></section>;
}
