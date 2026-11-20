"use client";
import {useState,useRef,useEffect} from 'react';
import VndChargeImportTools from './vnd-charge-import-tools';
import VndRefundTools from './vnd-refund-tools';
import VndSupplierTools from './vnd-supplier-tools';
import VndSupplierAddonTools from './vnd-supplier-addon-tools';
import {SupplierCancellationWorkspace} from './supplier-cancellation-workspace';
type User={id:number;role:string};
type Addon={id:number;name:string;revenue:string;cost?:string|null;supplier?:string;note?:string;revision:number};
type Carton={carton_number:number;lot_number:number;weight:number;length:number;width:number;height:number;items:Array<{sku:string;description:string;material:string;quantity:number;unit_manufacturing_value:number|null;currency:string}>};
type Statement={id:number;period_start:string;period_end:string;snapshot:{closing:{balance:string;debt_principal:string;debt_interest:string}}};
export default function VndTools({client,user,onChange}:{client:string;user:User;onChange:()=>void}){
 const [mode,setMode]=useState(user.role==='ADMIN'?'edit':['BOD','SALES'].includes(user.role)?'addon':'statement'),[order,setOrder]=useState(''),[revision,setRevision]=useState(''),[reason,setReason]=useState(''),[amount,setAmount]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [country,setCountry]=useState(''),[region,setRegion]=useState(''),[city,setCity]=useState(''),[address,setAddress]=useState(''),[service,setService]=useState(''),[sub,setSub]=useState(''),[supplier,setSupplier]=useState('');
 const [name,setName]=useState(''),[cost,setCost]=useState(''),[note,setNote]=useState(''),[addonId,setAddonId]=useState(''),[addons,setAddons]=useState<Addon[]>([]),[statements,setStatements]=useState<Statement[]>([]),[deadline,setDeadline]=useState(''),[rate,setRate]=useState('0');
 const [month,setMonth]=useState(''),[report,setReport]=useState<{performance:Array<{service:string;sub_service:string;client_id:number;orders:number;revenue:string;refunds:string;estimated_gp_net:string|null;actual_cost_status:string}>;commission:{orders:Array<{order_id:number;sales_user_id:number|null;live_after_refund:{allocated_refund_vnd:string;net_revenue_vnd:string|null;gp_base_vnd:string|null;commission_vnd:string|null}}>;unallocated_claims:Array<{claim_id:number;order_ids:number[];approved_vnd:string}>;performance:Array<{sales_user_id:number|null;group:string;orders:number;revenue:string;signed_gp_base:string|null;gp_base_for_consideration:string|null;commission_reference:string|null;refund_review_required:boolean;claim_refund:string|null;gp_base_minus_claim_refund:string|null}>};cash_flow:Array<{kind:string;delta:string}>;refund_obligations:Array<{sales_user_id:number|null;category:string;delta:string}>;refund_cash:Array<{kind:string;delta:string;executed_day:string}>;gp_reconciliation:Array<{order_id:number;freight_revenue:string;surcharge_revenue:string;actual_net:string|null;gp_net_before_client_refunds:string|null}>;supplier_actuals:Array<{order_id:number;actual_net:string|null;status:string;coverage:string}>}|null>(null);
 async function loadReport(){
  setBusy(true);try{const r=await fetch('/api/service-v1/reporting?month='+encodeURIComponent(month)),d=await r.json();if(!r.ok)throw Error(d.error);setReport(d);setMessage('Đã tải báo cáo VNĐ.');}catch(e){setMessage(e instanceof Error?e.message:'Không tải được báo cáo.');}finally{setBusy(false);}
 }
 const [cartons,setCartons]=useState<Carton[]>([]);
 async function loadOrder(){
  setBusy(true);try{
   const [r,s]=await Promise.all([fetch('/api/service-v1/operations?client_id='+encodeURIComponent(client)),fetch('/api/orders/'+Number(order)+'/shipment-structure')]);
   const [account,structure]=await Promise.all([r.json(),s.json()]);if(!r.ok||!s.ok)throw Error(account.error||structure.error);
   const request=account.requests.find((q:{order_id:number})=>q.order_id===Number(order));setRevision(String(request?.revision??0));
   setCartons(structure.cartons.map((c:Record<string,unknown>)=>({carton_number:Number(c.carton_number),lot_number:Number(c.lot_number),weight:Number(c.weight),length:Number(c.length),width:Number(c.width),height:Number(c.height),items:structure.allocations.filter((a:Record<string,unknown>)=>a.carton_id===c.id).map((a:Record<string,unknown>)=>({sku:String(a.sku),description:String(a.description),material:String(a.material??''),quantity:Number(a.quantity),unit_manufacturing_value:a.unit_manufacturing_value===null?null:Number(a.unit_manufacturing_value),currency:String(a.currency)}))})));
   setMessage('Đã tải kiện và giá hiện hành. Kiểm tra thay đổi trước khi lưu.');
  }catch(e){setMessage(e instanceof Error?e.message:'Không tải được Order.');}finally{setBusy(false);}
 }
 const [pendingPrices,setPendingPrices]=useState<{body:Record<string,unknown>;offer:string;automatic:string|null;automatic_error:string|null;can_keep:boolean;offer_below_net:boolean}|null>(null);
 const priceDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(pendingPrices&&!priceDialog.current?.open)priceDialog.current?.showModal();else if(!pendingPrices)priceDialog.current?.close();},[pendingPrices]);
 const receipt=useRef<{payload:string;key:string}|null>(null);
 const admin=user.role==='ADMIN',finance=['ADMIN','BOD','FINANCE'].includes(user.role),seller=['ADMIN','BOD','SALES'].includes(user.role);
 async function read(kind:'addons'|'statements'){
  setBusy(true);try{const r=await fetch('/api/service-v1/'+kind+'?client_id='+encodeURIComponent(client)),d=await r.json();if(!r.ok)throw Error(d.error);if(kind==='addons')setAddons(d.addons);else setStatements(d.statements);setMessage('Đã tải.');}catch(e){setMessage(e instanceof Error?e.message:'Không tải được.');}finally{setBusy(false);}
 }
 async function submit(selection?:'KEEP_OFFER'|'AUTOMATIC'){
  setBusy(true);setMessage('');try{
   let body:Record<string,unknown>={action:mode,client_id:Number(client),reason};
   if(['edit','duplicate'].includes(mode))body.order_id=Number(order);
   if(mode==='edit'){
    body.expected_revision=Number(revision);
    if(cartons.length)body.cartons=cartons;
    body.shipping=Object.fromEntries(Object.entries({country,city,address1:address,service,sub_service:sub,supplier}).filter(([,v])=>v.trim()));
    if(region)body.china_region=region;

   }
   if(mode==='addon'||mode==='addon_edit'){
    body.name=name;body.revenue=amount;body.cost=cost||null;body.supplier=supplier;body.note=note;
    if(mode==='addon_edit'){body.addon_id=Number(addonId);body.expected_revision=Number(revision);}
   }
   if(['debt','debt_rate','extend_debt'].includes(mode)){body.amount=amount;body.deadline=deadline;body.daily_rate_pct=rate;}
   if(selection&&pendingPrices)body={...pendingPrices.body,price_selection:selection,expected_offer:pendingPrices.offer,expected_automatic:pendingPrices.automatic,confirm_below_net:pendingPrices.offer_below_net};
   const payload=JSON.stringify(body);if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
   body.request_key=receipt.current!.key;
   const r=await fetch('/api/service-v1/'+(mode.startsWith('addon')?'addons':'operations'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();
   if(r.status===409&&d.prices){setPendingPrices({body,...d.prices});return;}
   if(!r.ok)throw Error(d.error);
   setPendingPrices(null);
   setMessage('Đã ghi nhận.');onChange();
  }catch(e){setMessage(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);}
 }
 return <>{['ADMIN','FINANCE','BOD'].includes(user.role)&&<SupplierCancellationWorkspace/>}<VndSupplierTools role={user.role}/>{['ADMIN','FINANCE','BOD'].includes(user.role)&&<VndSupplierAddonTools onChange={onChange}/>}{['ADMIN','SALES'].includes(user.role)&&<VndChargeImportTools key={client} client={client} onChange={onChange}/>}<VndRefundTools key={client+user.id+user.role} client={client} user={user} onChange={onChange}/><section aria-label="Công cụ tài khoản VNĐ"><h2>Edit Order · Add-on · Statement · Debt</h2>
  <p>Edit Order chỉ trước Tracking hoặc Label. Đổi giá bán và cấp Tracking/Label dùng các thao tác riêng ở trên.</p>
  {user.role==='BOD'&&<div><label>Tháng báo cáo <input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><button disabled={busy||!month} onClick={()=>void loadReport()}>Xem báo cáo VNĐ</button>{month&&<a href={'/api/service-v1/reporting?format=xlsx&month='+encodeURIComponent(month)}>Tải Excel hoa hồng</a>}{report&&<><p>Hiệu quả theo kỳ mua Order; dòng tiền theo ngày posting. GP-Net trước Refund chỉ hiện khi đủ Actual được duyệt; không cộng phải thu Supplier vào GP. Claim/Refund ở pool Client; báo cáo quyết định và thực trả tách riêng.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Service</th><th>Client</th><th>Order</th><th>Doanh số cước VNĐ</th><th>Refund huỷ VNĐ</th><th>GP Net ước tính VNĐ</th></tr></thead><tbody>{report.performance.map((r,i)=><tr key={i}><td>{r.service} {r.sub_service}</td><td>{r.client_id}</td><td>{r.orders}</td><td>{r.revenue}</td><td>{r.refunds}</td><td>{r.estimated_gp_net??'Chưa đủ cost'}</td></tr>)}</tbody></table></div><h3>Commission · dữ liệu tham khảo VNĐ</h3><p>GP Base xét riêng từng Order, không bù đơn âm; đơn huỷ không tính commission. Số tham khảo = 0,1% doanh số cước + 12% GP Base khi doanh số cước cao hơn Base; bằng hoặc thấp hơn Base = 0. Quyết định mới phân bổ Refund theo Order khi duyệt. Bảng theo Order dùng dữ liệu live của kỳ mua. Claim cũ thiếu phân bổ cần rà soát trước khi quyết toán.</p><div style={{overflowX:'auto',maxWidth:'100%'}}><table><thead><tr><th>Sales lịch sử</th><th>Nhóm</th><th>Order</th><th>Doanh số cước VNĐ</th><th>GP Base có dấu VNĐ</th><th>GP Base tham khảo VNĐ</th><th>Hoa hồng tham khảo VNĐ</th><th>Refund cùng nhóm VNĐ</th><th>GP Base − Refund VNĐ</th><th>Rà soát Refund</th></tr></thead><tbody>{report.commission.performance.map((r,i)=><tr key={i}><td>{r.sales_user_id??'Cần rà soát'}</td><td>{r.group}</td><td>{r.orders}</td><td>{r.revenue}</td><td>{r.signed_gp_base??'Chưa đủ Base'}</td><td>{r.gp_base_for_consideration??'Cần rà soát'}</td><td>{r.commission_reference??'Cần rà soát'}</td><td>{r.claim_refund??'Chưa phân bổ liên nhóm'}</td><td>{r.gp_base_minus_claim_refund??'Cần rà soát'}</td><td>{r.refund_review_required?'Có · xác nhận thủ công':'Không'}</td></tr>)}</tbody></table></div><h3>Doanh thu và hoa hồng sau Refund theo Order</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Order</th><th>Sales lịch sử</th><th>Refund phân bổ VNĐ</th><th>Doanh thu ròng VNĐ</th><th>GP-Base VNĐ</th><th>Hoa hồng VNĐ</th></tr></thead><tbody>{report.commission.orders.map(r=><tr key={r.order_id}><td>{r.order_id}</td><td>{r.sales_user_id??'Cần rà soát'}</td><td>{r.live_after_refund.allocated_refund_vnd}</td><td>{r.live_after_refund.net_revenue_vnd??'Cần rà soát'}</td><td>{r.live_after_refund.gp_base_vnd??'Cần rà soát'}</td><td>{r.live_after_refund.commission_vnd??'Cần rà soát'}</td></tr>)}</tbody></table></div>{report.commission.unallocated_claims.length>0&&<section aria-label="Claim chưa phân bổ"><h3>Claim chưa phân bổ</h3><p>Số tiền duyệt thuộc toàn Claim. Claim có thể xuất hiện ở nhiều kỳ mua.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Claim ID</th><th>Order ID</th><th>Tổng duyệt VNĐ</th></tr></thead><tbody>{report.commission.unallocated_claims.map(claim=><tr key={claim.claim_id}><td>{claim.claim_id}</td><td>{claim.order_ids.join(', ')}</td><td>{claim.approved_vnd}</td></tr>)}</tbody></table></div></section>}<h3>Claim theo kỳ quyết định VNĐ</h3><p>Delta duyệt theo Sales lịch sử và nhóm sự cố; nhiều Sales chưa phân bổ sẽ ghi cần rà soát. Không trừ khoản thực trả lần hai khỏi GP.</p><div style={{overflowX:'auto'}}><table><thead><tr><th>Sales lịch sử</th><th>Nhóm Claim</th><th>Delta nghĩa vụ VNĐ</th></tr></thead><tbody>{report.refund_obligations.map((r,i)=><tr key={i}><td>{r.sales_user_id??'Cần rà soát phân bổ'}</td><td>{r.category}</td><td>{r.delta}</td></tr>)}</tbody></table><table><thead><tr><th>Order</th><th>Actual Net đã chốt VNĐ</th><th>Trạng thái</th><th>Phạm vi Net trong workbook</th></tr></thead><tbody>{report.supplier_actuals.map(r=><tr key={r.order_id}><td>{r.order_id}</td><td>{r.actual_net??'Chưa đủ actual'}</td><td>{r.status}</td><td>{r.coverage==='WORKBOOK_INCLUSIVE_MID_LAST_MILE'?'Đã gồm mid-mile + last-mile; chi tiết để giai đoạn sau':r.coverage}</td></tr>)}</tbody></table></div><h3>Đối chiếu GP-Net trước Refund</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Order</th><th>Cước VNĐ</th><th>Phụ phí VNĐ</th><th>Actual Net VNĐ</th><th>GP-Net trước Refund VNĐ</th></tr></thead><tbody>{report.gp_reconciliation.map(r=><tr key={r.order_id}><td>{r.order_id}</td><td>{r.freight_revenue}</td><td>{r.surcharge_revenue}</td><td>{r.actual_net??'Chưa đủ Actual'}</td><td>{r.gp_net_before_client_refunds??'Chưa chốt'}</td></tr>)}</tbody></table></div><h3>Refund Bank theo ngày thực hiện</h3>{report.refund_cash.map((r,i)=><p key={i}>{r.executed_day} · {r.kind}: {r.delta} VNĐ (delta pool)</p>)}<h3>Dòng tiền VNĐ</h3>{report.cash_flow.map(r=><p key={r.kind}>{r.kind}: {r.delta} VNĐ</p>)}</>}</div>}
  <button disabled={busy||!client} onClick={()=>void read('addons')}>Xem Add-on</button> <button disabled={busy||!client} onClick={()=>void read('statements')}>Xem Statement</button>
  {addons.length>0&&<div style={{overflowX:'auto',maxWidth:'100%'}}><table><thead><tr><th>Tên</th><th>Doanh thu VNĐ</th>{user.role!=='CLIENT'&&<><th>Cost VNĐ</th><th>Supplier</th><th>Chọn</th></>}</tr></thead><tbody>{addons.map(a=><tr key={a.id}><td>{a.name}</td><td>{a.revenue}</td>{user.role!=='CLIENT'&&<><td>{a.cost??'Chờ cost'}</td><td>{a.supplier}</td><td><button onClick={()=>{setMode('addon_edit');setAddonId(String(a.id));setRevision(String(a.revision));setName(a.name);setAmount(a.revenue);setCost(a.cost??'');setSupplier(a.supplier??'');setNote(a.note??'');}}>Sửa Add-on</button></td></>}</tr>)}</tbody></table></div>}
  {statements.map(s=><p key={s.id}>Kỳ {s.period_start} → {s.period_end}: Balance {s.snapshot.closing.balance} VNĐ · Debt gốc {s.snapshot.closing.debt_principal} · Lãi {s.snapshot.closing.debt_interest}. Refund được ghi theo kỳ quyết định/thực hiện; Statement cũ giữ nguyên.</p>)}
  {(admin||finance||seller)&&<form style={{display:'grid',gap:10,maxWidth:600}} onSubmit={e=>{e.preventDefault();void submit();}}>
   <label>Thao tác <select value={mode} onChange={e=>setMode(e.target.value)}>
    {admin&&<><option value="edit">Edit Order · trước phát hành</option><option value="duplicate">Huỷ & Duplicate theo policy</option></>}
    {seller&&<><option value="addon">Tạo Add-on</option><option value="addon_edit">Financial Correction Add-on</option></>}
    {finance&&<option value="statement">Chốt Statement VNĐ</option>}
    {['ADMIN','BOD'].includes(user.role)&&<><option value="debt">Chuyển Balance âm sang Debt</option><option value="debt_rate">Đổi lãi suất Debt</option><option value="extend_debt">Gia hạn Debt</option></>}
   </select></label>
   {['edit','duplicate'].includes(mode)&&<label>Order ID <input required value={order} onChange={e=>{setOrder(e.target.value);setCartons([]);}}/></label>}
   {['edit','addon_edit'].includes(mode)&&<label>Revision hiện hành <input required value={revision} onChange={e=>setRevision(e.target.value)}/></label>}
   {mode==='edit'&&<>
    <button type="button" disabled={busy||!order} onClick={()=>void loadOrder()}>Tải kiện và giá hiện hành</button>
    {cartons.length>0&&<div style={{overflowX:'auto'}}><table><thead><tr><th>Kiện</th><th>Lot</th><th>Kg</th><th>Dài cm</th><th>Rộng cm</th><th>Cao cm</th><th>Thao tác</th></tr></thead><tbody>{cartons.map((c,i)=><tr key={c.carton_number}><td>{c.carton_number}</td>{(['lot_number','weight','length','width','height'] as const).map(field=><td key={field}><input aria-label={'Kiện '+c.carton_number+' '+field} type="number" min={field==='lot_number'?1:0.001} step={field==='lot_number'?1:'any'} style={{width:75}} value={c[field]} onChange={e=>setCartons(rows=>rows.map((row,j)=>j===i?{...row,[field]:Number(e.target.value)}:row))}/></td>)}<td><button type="button" disabled={busy||cartons.length===1} onClick={()=>setCartons(rows=>rows.filter((_,j)=>j!==i))}>Xóa kiện {c.carton_number}</button></td></tr>)}</tbody></table></div>}
    <p>Chỉ điền trường cần sửa; bỏ trống để giữ dữ liệu hiện hành.</p>
    <label>Quốc gia (mã) <input value={country} onChange={e=>setCountry(e.target.value.toUpperCase())}/></label>
    <label>China region <select value={region} onChange={e=>setRegion(e.target.value)}><option value="">Giữ hiện hành</option><option value="SOUTH">China South</option><option value="OTHER">China excluding South</option></select></label>
    <label>Thành phố <input value={city} onChange={e=>setCity(e.target.value)}/></label>
    <label>Địa chỉ <input value={address} onChange={e=>setAddress(e.target.value)}/></label>
    <label>Service <input value={service} onChange={e=>setService(e.target.value)}/></label>
    <label>Sub-Service <input value={sub} onChange={e=>setSub(e.target.value)}/></label>
    <label>Supplier <input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label>
   </>}
   {mode.startsWith('addon')&&<><label>Tên dịch vụ <input required value={name} onChange={e=>setName(e.target.value)}/></label>{mode==='addon_edit'&&<label>Add-on ID <input required value={addonId} onChange={e=>setAddonId(e.target.value)}/></label>}<label>Cost VNĐ (trống = chờ cost) <input value={cost} onChange={e=>setCost(e.target.value)}/></label><label>Supplier tự nhập <input value={supplier} onChange={e=>setSupplier(e.target.value)}/></label><label>Note <input value={note} onChange={e=>setNote(e.target.value)}/></label></>}
   {(mode.startsWith('addon')||mode==='debt')&&<label>{mode.startsWith('addon')?'Doanh thu VNĐ':'Số tiền VNĐ'} <input required value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
   {mode==='statement'&&<p>Chốt bù các kỳ tuần đã kết thúc, đến hết Chủ nhật theo giờ Việt Nam.</p>}
   {['debt','extend_debt'].includes(mode)&&<label>Debt deadline <input type="date" required value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>}
   {['debt','debt_rate'].includes(mode)&&<label>Lãi suất %/ngày <input required value={rate} onChange={e=>setRate(e.target.value)}/></label>}
   <label>Lý do / tham chiếu <input required value={reason} onChange={e=>setReason(e.target.value)}/></label>
   {mode==='duplicate'&&<p>Đơn gốc huỷ theo policy, đơn mới vào Purchasing chờ giá/xác nhận/sức mua. Huỷ nội bộ không tự huỷ label tại Supplier.</p>}
   <button disabled={busy||!client}>{busy?'Đang xử lý…':'Thực hiện'}</button>
   <button type="button" onClick={()=>{receipt.current=null;setMessage('Đã bắt đầu thao tác mới.');}}>Bắt đầu thao tác mới</button>
  </form>}
  <dialog ref={priceDialog} aria-labelledby="service-price-heading" onCancel={e=>{e.preventDefault();if(!busy)setPendingPrices(null);}}>
   {pendingPrices&&<>
    <h3 id="service-price-heading">Chọn giá khi đổi Service</h3>
    <p>Offer hiện hành: {pendingPrices.offer} VNĐ</p>
    <p>Giá tự động: {pendingPrices.automatic===null?pendingPrices.automatic_error:pendingPrices.automatic+' VNĐ'}</p>
    {pendingPrices.offer_below_net&&<p role="alert">Offer hiện hành thấp hơn Net Cost ước tính của Service mới.</p>}
    <button disabled={busy||!pendingPrices.can_keep} onClick={()=>void submit('KEEP_OFFER')}>Giữ offer</button>
    <button disabled={busy||pendingPrices.automatic===null} onClick={()=>void submit('AUTOMATIC')}>Áp giá tự động</button>
    <button disabled={busy} onClick={()=>setPendingPrices(null)}>Quay lại</button>
    {message&&<p role="alert">{message}</p>}
   </>}
  </dialog>
  <p role="status">{message}</p>
 </section></>;
}
