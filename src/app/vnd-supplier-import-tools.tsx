"use client";
import {useRef,useState} from 'react';
type ImportRow={id:number;position:number;data:{tracking:string;order_code:string;kind:string;amount:string;reference:string};lot_id:number|null;estimated:string|null;dmd_weight:string|null;approved_cost_id:number;errors:string[];token:string;decision:unknown};
const errors:Record<string,string>={ORDER_NOT_MATCHED:'Không tìm thấy Order',AMBIGUOUS_MATCH:'Match nhiều Lot',NET_ABOVE_ESTIMATE:'Net cao hơn estimate',WEIGHT_ABOVE_DMD:'Cân Supplier cao hơn DMD',MISSING_DMD_WEIGHT:'Thiếu cân tính phí DMD',MISSING_ESTIMATE:'Thiếu estimate',MISSING_APPROVED_BASE:'Chưa có Actual gốc',DUPLICATE_HISTORY:'Trùng lịch sử',DUPLICATE_IN_FILE:'Trùng trong file'};
export default function VndSupplierImportTools({supplier,role,onChange}:{supplier:string;role:string;onChange:()=>void}){
 const [rows,setRows]=useState<ImportRow[]>([]),[selected,setSelected]=useState<number[]>([]),[mappings,setMappings]=useState<Record<number,string>>({}),[mappedCosts,setMappedCosts]=useState<Record<number,string>>({}),[reason,setReason]=useState(''),[file,setFile]=useState<File|null>(null),[kind,setKind]=useState('TOTAL'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[onlyErrors,setOnlyErrors]=useState(false);
 const receipt=useRef<{payload:string;key:string}|null>(null);
 async function run(mode:'load'|'import'|'accept'|'skip'){
  setBusy(true);try{
   let body:BodyInit|undefined,headers:HeadersInit|undefined;
   if(mode!=='load'){
    const items=rows.filter(r=>selected.includes(r.id)).map(r=>({id:r.id,token:r.token,...(mappings[r.id]?{lot_id:Number(mappings[r.id])}:{}),expected_approved_cost_id:mappings[r.id]?Number(mappedCosts[r.id]??'0'):r.approved_cost_id}));
    // A manual mapping requires loading its current approved cost separately; server CAS rejects stale/unknown values.
    const payload=JSON.stringify({mode,kind,reason,items,file:file?{name:file.name,size:file.size,lastModified:file.lastModified}:null});
    if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
    if(mode==='import'){
     if(!file)throw Error('Chọn file Excel.');const form=new FormData();form.set('file',file);form.set('supplier',supplier);form.set('reason',reason);form.set('kind',kind);form.set('request_key',receipt.current.key);body=form;
    }else{headers={'content-type':'application/json'};body=JSON.stringify({supplier,action:'review_import',decision:mode,items,reason,request_key:receipt.current.key});}
   }
   const r=await fetch('/api/service-v1/suppliers'+(mode==='load'?'?supplier='+encodeURIComponent(supplier):''),mode==='load'?{}:{method:'POST',headers,body});
   const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.import_rows??[]);setSelected([]);setMessage(mode==='load'?'Đã tải queue.':'Đã lưu; xem kết quả trong queue.');onChange();
  }catch(e){setMessage(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);}
 }
 const pending=rows.filter(r=>!r.decision),visible=pending.filter(r=>!onlyErrors||r.errors.length>0);
 return <section aria-label="Supplier import queue"><h3>Import và review Supplier VNĐ</h3><p>Excel: Tracking | Actual Net VNĐ | Cân Supplier kg | Tham chiếu | Lý do. Có thể thay cột Tracking bằng Order ID. 1–200 dòng; giữ Tracking dạng chữ. Phụ phí là cost doanh nghiệp chịu, không tự thu Client. Chưa accept thì chưa ghi Actual/phải trả. Net cao hơn là sai lệch cần kiểm tra, có thể accept kèm lý do.</p>
 <label>Loại chứng từ <select value={kind} onChange={e=>setKind(e.target.value)}><option value="TOTAL">Tổng Actual Net</option><option value="SUPPLEMENT">Phụ phí cost bổ sung</option></select></label>
 <label>File Supplier VNĐ <input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
 <label>Lý do review/import <input value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <button disabled={busy||!supplier||!file||!reason} onClick={()=>void run('import')}>Import vào queue</button><button disabled={busy||!supplier} onClick={()=>void run('load')}>Tải queue Supplier</button>
 <p>Chờ review: {pending.length}; có lỗi: {pending.filter(r=>r.errors.length).length}; lịch sử xử lý gần nhất (tối đa 200): {rows.length-pending.length}.</p>
 <label><input type="checkbox" checked={onlyErrors} onChange={e=>{setOnlyErrors(e.target.checked);setSelected([]);}}/>Chỉ hàng có lỗi</label>
 <div style={{overflowX:'auto'}}><table><thead><tr><th>Chọn</th><th>Dòng / mã</th><th>Loại / VNĐ</th><th>Lot / estimate</th><th>Loại lỗi</th><th>Ghép Lot thủ công</th></tr></thead><tbody>{visible.map(r=><tr key={r.id}><td><input aria-label={'Chọn dòng Supplier '+r.id} type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/></td><td>{r.id} / {r.data.tracking||r.data.order_code}<br/>{r.data.reference}</td><td>{r.data.kind} / {r.data.amount}</td><td>{r.lot_id??'Chưa match'} / {r.estimated??'Thiếu'}</td><td>{r.errors.map(e=>errors[e]??e).join('; ')||'Chờ review'}</td><td>{!r.lot_id&&<><input placeholder="Lot ID" aria-label={'Ghép Lot dòng '+r.id} value={mappings[r.id]??''} onChange={e=>setMappings({...mappings,[r.id]:e.target.value})}/><input placeholder="Actual cost ID hiện tại (0 nếu chưa có)" aria-label={'Actual cũ dòng '+r.id} value={mappedCosts[r.id]??'0'} onChange={e=>setMappedCosts({...mappedCosts,[r.id]:e.target.value})}/></>}</td></tr>)}</tbody></table></div>
 <button disabled={busy||!visible.length} onClick={()=>setSelected(visible.slice(0,200).map(r=>r.id))}>Chọn tối đa 200 dòng hiển thị</button>
 {role!=='ADMIN'&&<button disabled={busy||!selected.length||!reason} onClick={()=>void run('accept')}>Accept {selected.length} dòng đã chọn</button>}
 <button disabled={busy||!selected.length||!reason} onClick={()=>void run('skip')}>Bỏ qua {selected.length} dòng đã chọn</button><p role="status">{message}</p>
 <details><summary>Lịch sử xử lý</summary>{rows.filter(r=>r.decision).map(r=><pre key={r.id}>{JSON.stringify({id:r.id,decision:r.decision},null,2)}</pre>)}</details></section>;
}
