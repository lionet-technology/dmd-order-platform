"use client";
import {Fragment,type FormEvent,useRef,useState} from 'react';
import {supplierExceptionTags, type ComponentMapping} from '../lib/vnd-supplier-components';
import type {compareSupplierComponents, QuotedComponent} from '../lib/vnd-supplier-components';
type Bucket={mode:'TOTAL'|'SUM';columns:string[]};
type Template={id:number;service:string;sub_service:string;version:number;mapping:{components?:ComponentMapping[];tracking:string;line:string;weight:string;currency?:string;label_url?:string;actual:Bucket|null;surcharge:Bucket|null;surcharge_in_actual:boolean}};
type ParsedBucket={total:string|null;components:{column:string;amount:string|null}[]};
type ParsedSource={version:number;excel_row:number;actual:ParsedBucket|null;surcharge:ParsedBucket|null;surcharge_in_actual:boolean};
const fieldGrid={display:'grid',gap:10,gridTemplateColumns:'repeat(auto-fit,minmax(min(100%, 14rem),1fr))'};
const field={display:'grid',gap:4,alignContent:'start'};
type Batch={batch_key:string;file_name:string;document:string|null;posting_day:string;pending:number;accepted:number;skipped:number;errors:number;payable_delta:string;lines:{id:number;position:number;decision:string|null;posting_day:string|null;period_id:number|null;source_batch:string}[]};
type ImportRow={id:number;supplier_components?:QuotedComponent[];position:number;data:{tracking:string;label_url?:string;order_code:string;kind:string;amount:string|null;reference:string;parse_errors?:string[];source?:ParsedSource};lot_id:number|null;fulfillment_epoch:number|null;estimated:string|null;dmd_weight:string|null;approved_cost_id:number;tags:string[];revenue:string|null;order_obligation?:string|null;void_policy?:{requested:boolean;case_id:number|null;cap:string|null};revenue_below_obligation:boolean;component_blocked:boolean;comparison:ReturnType<typeof compareSupplierComponents>|null;errors:string[];token:string;decision:unknown};
function blocksAccept(row:ImportRow,mappedLot?:string){
 return row.component_blocked||(!row.lot_id&&(Boolean(row.comparison)||!/^\d+$/.test(mappedLot??"")||Number(mappedLot)<=0))||Boolean(row.data.parse_errors?.length)
  ||row.errors.some(error=>['AMBIGUOUS_MATCH','FULFILLMENT_REVIEW_REQUIRED','SUPPLIER_REFERENCE_IN_USE'].includes(error));
}

export default function VndSupplierImportTools({supplier,role,onChange}:{supplier:string;role:string;onChange:()=>void}){
 const [rows,setRows]=useState<ImportRow[]>([]),[selected,setSelected]=useState<number[]>([]),[mappings,setMappings]=useState<Record<number,string>>({}),[mappedCosts,setMappedCosts]=useState<Record<number,string>>({}),[reason,setReason]=useState(''),[file,setFile]=useState<File|null>(null),[kind,setKind]=useState('TOTAL'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[onlyErrors,setOnlyErrors]=useState(false);
 const [adjustmentFile,setAdjustmentFile]=useState<File|null>(null);
 const [adjustmentPreview,setAdjustmentPreview]=useState<{id:number;old:ImportRow['comparison'];proposed:ImportRow['comparison'];tags:string[]}[]|null>(null);
 const [batches,setBatches]=useState<Batch[]>([]);
 const [onlyCancellation,setOnlyCancellation]=useState(false);
 const [tag,setTag]=useState('');
 const [templates,setTemplates]=useState<Template[]>([]),[templateId,setTemplateId]=useState(''),[document,setDocument]=useState('');
 const template=templates.find(t=>String(t.id)===templateId);
 async function saveTemplate(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  const service=String(form.get('service')).trim(),subService=String(form.get('sub_service')).trim();
  const current=templates.find(t=>t.service.toLowerCase()===service.toLowerCase()&&t.sub_service.toLowerCase()===subService.toLowerCase());
  const bucket=(key:string)=>{
   const mode=String(form.get(key+'_mode'));
   return mode==='NONE'?null:{mode,columns:String(form.get(key+'_columns')).split('\n').map(c=>c.trim()).filter(Boolean)};
  };
  setBusy(true);
  try{
   const componentText=String(form.get('components')).trim();
   const components=componentText?componentText.split('\n').filter(line=>line.trim()).map(line=>{
    const [id,group,column,...extra]=line.split('|').map(value=>value.trim());
    if(!id||!group||!column||extra.length)throw Error('Mỗi dòng cần Component ID | Nhóm | Tên cột Excel.');
    return {id,group,column};
   }):undefined;
   const response=await fetch('/api/service-v1/suppliers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
    supplier,action:'save_import_template',request_key:crypto.randomUUID(),reason:'Cấu hình template Excel Supplier',
    service,sub_service:subService,expected_version:current?.version??0,mapping:{
     components, tracking:form.get('tracking'),line:form.get('line'),weight:form.get('weight'),currency:form.get('currency'),label_url:form.get('label_url'),actual:bucket('actual'),
     surcharge:bucket('surcharge'),surcharge_in_actual:form.get('included')==='on',
    },
   })});
   const data=await response.json();
   if(!response.ok)throw Error(data.error);
   setTemplates(data.templates);
   setTemplateId(String(data.templates[0].id));
   setMessage('Đã lưu phiên bản template.');
  }catch(error){setMessage(error instanceof Error?error.message:'Không lưu được template.');}
  finally{setBusy(false);}
 }
 const receipt=useRef<{payload:string;key:string}|null>(null);
 async function run(mode:'load'|'import'|'accept'|'skip'){
  setBusy(true);try{
   let body:BodyInit|undefined,headers:HeadersInit|undefined;
   if(mode!=='load'){
    const items=rows.filter(r=>selected.includes(r.id)).map(r=>({id:r.id,token:r.token,...(mappings[r.id]?{lot_id:Number(mappings[r.id])}:{}),expected_approved_cost_id:mappings[r.id]?Number(mappedCosts[r.id]??'0'):r.approved_cost_id}));
    // A manual mapping requires loading its current approved cost separately; server CAS rejects stale/unknown values.
    const payload=JSON.stringify({mode,kind,reason,items,templateId,document,file:file?{name:file.name,size:file.size,lastModified:file.lastModified}:null});
    if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
    if(mode==='import'){
     if(!file)throw Error('Chọn file Excel.');const form=new FormData();form.set('file',file);form.set('supplier',supplier);form.set('reason',reason);form.set('kind',kind);form.set('request_key',receipt.current.key);if(templateId){form.set('template_id',templateId);form.set('document',document);}body=form;
    }else{headers={'content-type':'application/json'};body=JSON.stringify({supplier,action:'review_import',decision:mode,items,reason,request_key:receipt.current.key});}
   }
   const r=await fetch('/api/service-v1/suppliers'+(mode==='load'?'?supplier='+encodeURIComponent(supplier):''),mode==='load'?{}:{method:'POST',headers,body});
   const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.import_rows??[]);setBatches(d.import_batches??[]);setTemplates(d.templates??[]);setSelected([]);setMessage(mode==='load'?'Đã tải queue.':'Đã lưu; xem kết quả trong queue.');onChange();
  }catch(e){setMessage(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);}
 }
 async function adjustments(mode:'preview'|'stage'){
  if(!adjustmentFile)return;
  setBusy(true);
  try{
   const form=new FormData();
   form.set('file',adjustmentFile);form.set('supplier',supplier);form.set('reason',reason);
   form.set('request_key',crypto.randomUUID());form.set('adjustment_mode',mode);
   const response=await fetch('/api/service-v1/suppliers',{method:'POST',body:form});
   const data=await response.json();
   if(!response.ok)throw Error(data.error);
   if(mode==='preview')setAdjustmentPreview(data.adjustments);
   else{
    setRows(data.import_rows??[]);setBatches(data.import_batches??[]);setSelected([]);setAdjustmentPreview(null);setAdjustmentFile(null);
    setMessage('Đã lưu đề xuất để Finance/BOD duyệt.');
    onChange();
   }
  }catch(error){
   setAdjustmentPreview(null);setMessage(error instanceof Error?error.message:'Không xử lý được Excel điều chỉnh.');
  }finally{setBusy(false);}
 }
 const pending=rows.filter(r=>!r.decision),visible=pending.filter(r=>(!onlyErrors||r.tags.length>0)&&(!tag||r.tags.includes(tag))&&(!onlyCancellation||r.void_policy?.requested));
 const reviewable=visible.filter(row=>!blocksAccept(row,mappings[row.id]));
 const blockedSelected=visible.filter(row=>selected.includes(row.id)&&blocksAccept(row,mappings[row.id])).length;
 return <section aria-label="Supplier import queue"><h3>Import và review Supplier VNĐ</h3><p>{templateId
  ? 'Dùng cùng mã chứng từ và mã dòng khi tải lại. Sau khi đổi template, bỏ qua bản chờ trước khi nhập lại theo phiên bản mới.'
  : 'Excel chuẩn dùng các cột Tracking hoặc Order ID, Actual Net VNĐ, Cân Supplier kg, Tham chiếu và Lý do.'} Actual và phải trả chỉ ghi sau khi Accept.</p>
 <div style={fieldGrid}>
 <label style={field}>Template Excel <select value={templateId} onChange={e=>setTemplateId(e.target.value)}>
 <option value="">Excel chuẩn</option>{templates.map(t=><option key={t.id} value={t.id}>{t.service} / {t.sub_service} · v{t.version}</option>)}
 </select></label>
 {templateId&&<label style={field}>Mã chứng từ Supplier <input value={document} onChange={e=>setDocument(e.target.value)}/></label>}
 </div>
 <details style={{marginBlock:12}}><summary>Cấu hình template theo tuyến</summary>
 <form key={templateId} onSubmit={saveTemplate} style={{display:'grid',gap:10,marginBlock:10}}>
 <div style={fieldGrid}>
 <label style={field}>Service <input name="service" required defaultValue={template?.service}/></label>
 <label style={field}>Sub-Service <input name="sub_service" required defaultValue={template?.sub_service}/></label>
 <label style={field}>Cột Tracking <input name="tracking" required defaultValue={template?.mapping.tracking}/></label>
 <label style={field}>Cột URL Label (nếu có) <input name="label_url" defaultValue={template?.mapping.label_url}/></label>
 <label style={field}>Cột mã dòng chứng từ <input name="line" required defaultValue={template?.mapping.line}/></label>
 <label style={field}>Cột cân kg <input name="weight" defaultValue={template?.mapping.weight}/></label>
 <label style={field}>Cột loại tiền (nếu có) <input name="currency" defaultValue={template?.mapping.currency}/></label>
 </div>
 <label style={field}>Thành phần V2 (Component ID | Cost, Surcharge hoặc Tax | Tên cột Excel)<textarea name="components" defaultValue={template?.mapping.components?.map(c=>[c.id,c.group,c.column].join(' | ')).join('\n')}/></label>
 <p>Nhập đúng tiêu đề Excel, mỗi tên cột trên một dòng. Dùng mã dòng dạng text, duy nhất trong chứng từ.</p>
 <div style={fieldGrid}>
 <BucketFields name="actual" label="Actual Net VNĐ" value={template?.mapping.actual}/>
 <BucketFields name="surcharge" label="Supplier Surcharge VNĐ" value={template?.mapping.surcharge}/>
 </div>
 <label><input type="checkbox" name="included" defaultChecked={template?.mapping.surcharge_in_actual}/> Phụ phí đã nằm trong Actual Net</label>
 <button style={{justifySelf:'start'}} disabled={busy||!supplier}>Lưu phiên bản mới</button>
 </form></details>
 <div style={fieldGrid}>
 {!templateId&&<label style={field}>Loại chứng từ <select value={kind} onChange={e=>setKind(e.target.value)}><option value="TOTAL">Tổng Actual Net</option><option value="SUPPLEMENT">Phụ phí cost bổ sung</option></select></label>}
 <label style={field}>File Supplier VNĐ <input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]??null)}/></label>
 <label style={field}>Lý do review/import <input value={reason} onChange={e=>setReason(e.target.value)}/></label>
 </div>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBlock:8}}>
 <button disabled={busy||!supplier||!file||!reason||(!!templateId&&!document.trim())} onClick={()=>void run('import')}>Import vào queue</button><button disabled={busy||!supplier} onClick={()=>void run('load')}>Tải queue Supplier</button>
 </div>
 <details style={{marginBlock:12}}><summary>Điều chỉnh thành phần qua Excel</summary>
 <p>Sửa cột Proposed VNĐ. Ô trống giữ số đã duyệt. Nhập 0 để đề xuất số 0.</p>
 <a href={'/api/service-v1/suppliers?'+new URLSearchParams({supplier,export_exceptions:'1',...(selected.length?{rows:selected.join(',')}:{})})}>Xuất Excel Exception Queue</a>
 <div style={fieldGrid}>
 <label style={field}>File Excel điều chỉnh<input type="file" accept=".xlsx" onChange={event=>{setAdjustmentFile(event.target.files?.[0]??null);setAdjustmentPreview(null);}}/></label>
 <button disabled={busy||!adjustmentFile} onClick={()=>void adjustments('preview')}>Xem trước điều chỉnh</button>
 <button disabled={busy||!adjustmentPreview||!reason} onClick={()=>void adjustments('stage')}>Lưu đề xuất vào queue</button>
 </div>
 {adjustmentPreview?.map(row=><div key={row.id}><strong>Dòng {row.id} · {row.old?.total} → {row.proposed?.total} VNĐ</strong>
 <p>{row.tags.join(', ')}</p>
 <ul>{row.proposed?.lines.map(line=><li key={line.id}>{line.group} / {line.id} · Đã duyệt {line.old??'—'} · Trong queue {row.old?.lines.find(old=>old.id===line.id)?.amount??'—'} · Đề xuất {line.amount} · Chênh lệch {line.delta}</li>)}</ul></div>)}
 </details>
 <p>Chờ review: {pending.length}; có lỗi: {pending.filter(r=>r.errors.length).length}; lịch sử xử lý gần nhất (tối đa 200): {rows.length-pending.length}.</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center'}}><label><input type="checkbox" checked={onlyErrors} onChange={e=>{setOnlyErrors(e.target.checked);setSelected([]);}}/>Chỉ hàng có lỗi</label>
 <label><input type="checkbox" checked={onlyCancellation} onChange={e=>{setOnlyCancellation(e.target.checked);setSelected([]);}}/>Đã yêu cầu hủy với Supplier</label>
 <label>Lọc theo tag <select value={tag} onChange={e=>{setTag(e.target.value);setSelected([]);}}><option value="">Tất cả</option>{supplierExceptionTags.map(value=><option key={value}>{value}</option>)}</select></label></div>
 <div style={{overflowX:'auto'}}><table><thead><tr><th>Chọn</th><th>Dòng / mã</th><th>Loại / VNĐ</th><th>Lot / lượt / estimate</th><th>Loại lỗi</th><th>Ghép Lot thủ công</th></tr></thead><tbody>{visible.map(r=><Fragment key={r.id}><tr><td><input aria-label={'Chọn dòng Supplier '+r.id} type="checkbox" checked={selected.includes(r.id)} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/></td><td>{r.id} / {r.data.tracking||r.data.order_code}<br/>{r.data.reference}{r.data.label_url&&<div>Label: {r.data.label_url}</div>}{r.data.source&&<details><summary>Excel dòng {r.data.source.excel_row} · v{r.data.source.version}</summary><CostBreakdown label="Actual Net" bucket={r.data.source.actual}/>
 <CostBreakdown label={r.data.source.surcharge_in_actual?'Phụ phí đã gồm trong Actual':'Phụ phí cộng riêng'} bucket={r.data.source.surcharge}/>
 <details><summary>Dữ liệu Excel gốc</summary><pre>{JSON.stringify(r.data.source,null,2)}</pre></details></details>}</td><td>{r.data.kind} / {r.data.amount}</td><td>{r.lot_id??'Chưa match'} / {r.fulfillment_epoch===0?'Gốc':r.fulfillment_epoch??'Chưa rõ'} / {r.estimated??'Thiếu'}</td><td>{r.tags.map(tag=><div key={tag}>{tag}</div>)}{!r.tags.length&&'Chờ review'}{r.errors.includes('SUPPLIER_REFERENCE_IN_USE')&&<p>Tham chiếu đã dùng trong sổ hoặc Claim Supplier.</p>}{r.errors.some(error=>error==='FULFILLMENT_REVIEW_REQUIRED'||error==='AMBIGUOUS_MATCH')&&<p>Cần đối soát đúng lượt fulfillment bằng chứng từ trước khi Accept.</p>}{r.data.parse_errors?.map((error,index)=><div key={index}>{error}</div>)}{r.void_policy?.case_id&&<p>Void #{r.void_policy.case_id} · Phí tối đa {r.void_policy.cap??'cần xác minh'} VNĐ</p>}{r.component_blocked&&<p>Cần xác minh dữ liệu thành phần đã duyệt trước khi Accept.</p>}{r.revenue_below_obligation&&<p>Doanh thu có thể thu {r.revenue} VNĐ thấp hơn nghĩa vụ Supplier toàn Order {r.order_obligation} VNĐ. Cần rà soát khoản lỗ.</p>}</td><td>{!r.lot_id&&!r.comparison&&!r.errors.includes('AMBIGUOUS_MATCH')&&!r.errors.includes('FULFILLMENT_REVIEW_REQUIRED')&&<><input placeholder="Lot ID" aria-label={'Ghép Lot dòng '+r.id} value={mappings[r.id]??''} onChange={e=>setMappings({...mappings,[r.id]:e.target.value})}/><input placeholder="Actual cost ID hiện tại (0 nếu chưa có)" aria-label={'Actual cũ dòng '+r.id} value={mappedCosts[r.id]??'0'} onChange={e=>setMappedCosts({...mappedCosts,[r.id]:e.target.value})}/></>}</td></tr>{r.comparison&&<tr><td colSpan={6}><details id={'supplier-comparison-'+r.id}><summary>So sánh thành phần</summary><p>Tổng nghĩa vụ sau báo giá {r.comparison.total} VNĐ</p><div style={{overflowX:'auto'}}><table style={{minWidth:550}}><thead><tr><th>Nhóm / Thành phần</th><th>Đã duyệt</th><th>Supplier báo</th><th>Số đề xuất cuối</th><th>Chênh lệch</th></tr></thead><tbody>{r.comparison.groups.map(group=><tr key={group.group}><th>{group.group}</th><td>{group.old}</td><td>—</td><td>{group.current}</td><td>{group.delta}</td></tr>)}{r.comparison.lines.map(line=><tr key={line.id}><td>{line.group} / {line.id}</td><td>{line.old??'—'}</td><td>{(r.supplier_components?r.supplier_components.find(component=>component.id===line.id)?.amount:line.quoted)??'—'}</td><td>{line.amount}</td><td>{line.delta}</td></tr>)}</tbody></table></div></details></td></tr>}</Fragment>)}</tbody></table></div>
 <button disabled={busy||!visible.length} onClick={()=>setSelected(visible.slice(0,200).map(r=>r.id))}>Chọn tối đa 200 dòng hiển thị</button>
 {role!=='ADMIN'&&<>
  <button disabled={busy||!reviewable.length} onClick={()=>setSelected(reviewable.slice(0,200).map(row=>row.id))}>Chọn dòng có thể Accept ({Math.min(reviewable.length,200)})</button>
  <button disabled={busy||!selected.length||!reason.trim()||blockedSelected>0} onClick={()=>void run('accept')}>Accept {selected.length} dòng đã chọn</button>
  {blockedSelected>0&&<p role="status">{blockedSelected} dòng đã chọn cần xử lý trước khi Accept. Chọn các dòng có thể Accept để duyệt phần còn lại.</p>}
 </>}
 <button disabled={busy||!selected.length||!reason} onClick={()=>void run('skip')}>Bỏ qua {selected.length} dòng đã chọn</button><p role="status">{message}</p>
 <details><summary>Lịch sử batch Excel</summary>{batches.map(batch=><details key={batch.batch_key}>
 <summary>{batch.posting_day} · {batch.file_name} · {batch.document??batch.batch_key}</summary>
 <a href={'/api/service-v1/suppliers?'+new URLSearchParams({supplier,original_batch:batch.batch_key})}>Tải file gốc</a>
 <p>Batch {batch.batch_key} · Chờ {batch.pending} · Duyệt {batch.accepted} · Bỏ qua {batch.skipped} · Lỗi đã ghi nhận {batch.errors} · Biến động phải trả {batch.payable_delta} VNĐ</p>
 <ul>{batch.lines.map(line=><li key={line.id}>Excel {line.position} / Queue {line.id} · {line.decision==='accept'?'Đã duyệt':line.decision==='skip'?'Bỏ qua':'Chờ duyệt'}{line.posting_day&&' · Ghi sổ '+line.posting_day}{line.period_id&&' · Kỳ #'+line.period_id}{line.source_batch!==batch.batch_key&&' · Batch gốc '+line.source_batch}</li>)}</ul>
 </details>)}</details>
 <details><summary>Lịch sử xử lý</summary>{rows.filter(r=>r.decision).map(r=><pre key={r.id}>{JSON.stringify({id:r.id,decision:r.decision},null,2)}</pre>)}</details></section>;
}

function BucketFields({name,label,value}:{name:string;label:string;value?:Bucket|null}){
 return <fieldset style={{display:'grid',gap:8,minWidth:0}}><legend>{label}</legend>
 <label style={field}>Cách lấy số <select name={name+'_mode'} defaultValue={value?.mode??'NONE'}>
 <option value="NONE">Không nhập</option><option value="TOTAL">Một cột tổng</option><option value="SUM">Cộng các cột thành phần</option>
 </select></label>
 <label style={field}>Cột Excel <textarea name={name+'_columns'} defaultValue={value?.columns.join('\n')}/></label>
 </fieldset>;
}

function CostBreakdown({label,bucket}:{label:string;bucket:ParsedBucket|null}){
 if(!bucket)return null;
 return <div><strong>{label} · {bucket.total??'Lỗi dữ liệu'} VNĐ</strong>
 <ul>{bucket.components.map(c=><li key={c.column}>{c.column}: {c.amount??'Lỗi dữ liệu'}</li>)}</ul></div>;
}
