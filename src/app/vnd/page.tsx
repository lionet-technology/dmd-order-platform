"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
type Purchase={order_id:number;status:string;offer:string|null;revision:number;reserve:string;cartons:Array<{id:number;carton_number:number}>};
type Entry={id:number;kind:string;delta:string;reason:string;created_at:string};
type Account={currency:string;balance:string;reserved:string;available:string;credit_limit:string;requests:Purchase[];ledger:Entry[]};
type User={id:number;role:string};
const labels:Record<string,string>={AWAITING_QUOTE:'Chờ báo giá',PRICE_CONFIRMATION_REQUIRED:'Chờ xác nhận giá',AWAITING_FUNDS:'Chờ sức mua',RESERVED:'Đã giữ tiền',CHARGED:'Đã thu tiền',CANCELLED:'Đã huỷ'};
export default function VndWorkspace(){
 const [user,setUser]=useState<User|null>(null),[client,setClient]=useState(''),[account,setAccount]=useState<Account|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [action,setAction]=useState('request'),[order,setOrder]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[revision,setRevision]=useState(''),[tracking,setTracking]=useState(''),[label,setLabel]=useState(''),[carton,setCarton]=useState('');
 const receipt=useRef<{payload:string;key:string}|null>(null);
 useEffect(()=>{fetch('/api/auth/status').then(r=>r.json()).then(d=>{setUser(d.user);if(['FINANCE','BOD'].includes(d.user?.role))setAction('payment');if(d.user?.role==='CLIENT')setClient(String(d.user.id));}).catch(()=>setMessage('Không đọc được phiên đăng nhập.'));},[]);
 async function load(){setBusy(true);try{const r=await fetch('/api/service-v1/operations?client_id='+encodeURIComponent(client));const d=await r.json();if(!r.ok)throw Error(d.error);setAccount(d);setMessage('Đã tải tài khoản.');}catch(e){setMessage(e instanceof Error?e.message:'Không tải được.');}finally{setBusy(false);}}
 async function submit(){
  setBusy(true);setMessage('');
  try{
   let url='/api/service-v1/operations',body:Record<string,unknown>={action,client_id:Number(client),reason};
   if(action==='tracking'){
    url='/api/orders/'+Number(order)+'/trackings';body={action:'save',trackings:[{tracking,label_url:label,carton_id:Number(carton)}]};
   }else if(action==='cancel'){url='/api/orders/'+Number(order)+'/cancel';body={reason};}
   else{
    if(['request','offer','consent','override','correction','surcharge','tax'].includes(action))body.order_id=Number(order);
    if(['offer','consent','override','correction'].includes(action))body.expected_revision=Number(revision);
    if(['offer','correction','surcharge','tax','credit_limit'].includes(action))body.amount=amount;
    if(action==='activate')body.credit_limit=amount||'0';
    if(action==='payment'||action==='adjustment'){body.action='post';body.kind=action==='payment'?'PAYMENT':'ADJUSTMENT';body.delta=amount;}
    const payload=JSON.stringify(body);
    if(receipt.current?.payload!==payload)receipt.current={payload,key:crypto.randomUUID()};
    body.request_key=receipt.current!.key;
   }
   const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),d=await r.json();
   if(!r.ok)throw Error(d.error||'Không xử lý được.');
   if(d.currency==='VND'&&d.requests)setAccount(d);
   else {const read=await fetch('/api/service-v1/operations?client_id='+encodeURIComponent(client));if(read.ok)setAccount(await read.json());}
   setMessage(action==='cancel'?'Đã huỷ. Hoàn '+String(d.refund_amount??'0')+' VNĐ.':'Đã xử lý. Các đơn đủ điều kiện được kiểm tra theo thứ tự yêu cầu mua.');
  }catch(e){setMessage(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);}
 }
 const admin=user&&['ADMIN','BOD'].includes(user.role),finance=admin||user?.role==='FINANCE',operator=user&&['ADMIN','SALES'].includes(user.role);
 return <main style={{maxWidth:1100,margin:'30px auto',padding:24}}>
  <Link href="/">← Về màn hình chính</Link><h1>Chuyên tuyến · tài khoản VNĐ</h1>
  <p>Báo giá thủ công cho Order. Tiền giữ nguyên số lẻ. Tạo Order và khai báo kiện trong màn hình Orders trước khi gửi yêu cầu mua.</p>
  {!user?<p>Đăng nhập ở màn hình chính để tiếp tục.</p>:<>
   <label>Client ID <input aria-label="Client ID" value={client} disabled={user.role==='CLIENT'||busy} onChange={e=>{setClient(e.target.value);setAccount(null);}}/></label>
   <button disabled={busy||!client} onClick={load}>Tải tài khoản</button>
   {account&&<><h2>Sức mua</h2><p>Balance: {account.balance} VNĐ · Credit Limit: {account.credit_limit} VNĐ · Reserve: {account.reserved} VNĐ · Còn lại: {account.available} VNĐ</p>
    {account.available.startsWith("-")&&<p role="alert">Sức mua đang âm. Posting đã ghi nhận; Purchase mới tiếp tục chờ đủ sức mua. Không tự tạo Debt.</p>}
    <h2>Yêu cầu mua</h2><table><thead><tr><th>Order</th><th>Trạng thái</th><th>Giá VNĐ</th><th>Reserve VNĐ</th><th>Revision</th><th>Chọn</th></tr></thead><tbody>{account.requests.map(r=><tr key={r.order_id}><td>{r.order_id}</td><td>{labels[r.status]}</td><td>{r.offer??'Chưa báo'}</td><td>{r.reserve}</td><td>{r.revision}</td><td><button onClick={()=>{setOrder(String(r.order_id));setCarton(String(r.cartons[0]?.id??''));setRevision(String(r.revision));setAmount(r.offer??'');}}>Chọn Order</button></td></tr>)}</tbody></table>
   </>}
   <h2>Thao tác</h2>
   <form onSubmit={e=>{e.preventDefault();void submit();}} style={{display:'grid',gap:12,maxWidth:600}}>
    <label>Thao tác <select value={action} disabled={busy} onChange={e=>setAction(e.target.value)}>
     {['ADMIN','SALES','CLIENT'].includes(user.role)&&<option value="request">Gửi yêu cầu Purchase</option>}
     {user.role==='CLIENT'&&<option value="consent">Xác nhận giá hiện hành</option>}
     {operator&&<><option value="offer">Edit Selling Price · offer trước phát hành</option><option value="override">Xác nhận giá thay Client (có lý do)</option><option value="correction">Financial Correction · giá sau charge</option><option value="surcharge">Ghi phụ phí Order</option><option value="tax">Ghi thuế Order</option></>}
     {user.role==='ADMIN'&&<option value="tracking">Add Tracking/Label</option>}
     {['ADMIN','SALES','CLIENT'].includes(user.role)&&<option value="cancel">Huỷ theo policy dịch vụ</option>}
     {finance&&<><option value="payment">Ghi nhận nạp tiền</option><option value="adjustment">Balance Adjustment (số có dấu)</option><option value="credit_limit">Thay Credit Limit</option></>}
     {admin&&<option value="activate">Mở VNĐ cho Client mới chưa có dữ liệu</option>}
    </select></label>
    {['request','offer','consent','override','correction','surcharge','tax','tracking','cancel'].includes(action)&&<label>Order ID <input required value={order} onChange={e=>setOrder(e.target.value)}/></label>}
    {['offer','consent','override','correction'].includes(action)&&<label>Revision đang xem <input required value={revision} onChange={e=>setRevision(e.target.value)}/></label>}
    {['offer','correction','surcharge','tax','payment','adjustment','credit_limit','activate'].includes(action)&&<label>Số tiền VNĐ <input required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="100000.123456"/></label>}
    {action==='tracking'&&<><label>Kiện hàng <select required value={carton} onChange={e=>setCarton(e.target.value)}><option value="">Chọn kiện</option>{account?.requests.find(r=>r.order_id===Number(order))?.cartons.map(c=><option key={c.id} value={c.id}>Kiện {c.carton_number}</option>)}</select></label><label>Tracking <input required value={tracking} onChange={e=>setTracking(e.target.value)}/></label><label>Link Label PDF <input required type="url" value={label} onChange={e=>setLabel(e.target.value)}/></label></>}
    <label>Lý do / tham chiếu <input value={reason} onChange={e=>setReason(e.target.value)} required={!['request','consent','tracking','activate'].includes(action)}/></label>
    {['consent','override'].includes(action)&&<p>Giá xác nhận: {account?.requests.find(r=>r.order_id===Number(order))?.offer??'Hãy tải và chọn Order'} VNĐ. Xác nhận không bỏ qua sức mua hoặc điều kiện dịch vụ.</p>}
    <button disabled={busy||!client} type="submit">{busy?'Đang xử lý…':'Thực hiện'}</button>
    <button type="button" disabled={busy} onClick={()=>{receipt.current=null;setMessage('Đã bắt đầu thao tác mới.');}}>Bắt đầu thao tác mới</button>
   </form>
   <p role="status">{message}</p>
   {account&&<><h2>Sổ giao dịch VNĐ</h2><table><thead><tr><th>Thời điểm</th><th>Loại</th><th>Biến động VNĐ</th><th>Lý do</th></tr></thead><tbody>{account.ledger.map(e=><tr key={e.id}><td>{e.created_at}</td><td>{e.kind}</td><td>{e.delta}</td><td>{e.reason}</td></tr>)}</tbody></table></>}
  </>}
 </main>;
}
