'use client';

import {useState} from 'react';
import type {readVndMonthlyCommission} from '@/lib/vnd-commission-statements';

const statusLabel:Record<string,string>={
 CLOSED:'Đã khóa · Trạng thái chi trả theo dõi riêng',
 OPEN:'Tạm tính · Tự chốt cuối tháng',
 FUTURE:'Kỳ chưa bắt đầu',
 PENDING_CLOSE:'Chưa có snapshot tháng',
};
const categoryLabel:Record<string,string>={
 RECONCILIATION_ERROR:'Sai lệch đối soát',
 SHIPPING_ISSUE:'Sự cố dịch vụ',
 FORCE_MAJEURE:'Bất khả kháng',
};

export default function VndCommissionStatementPanel(){
 const [month,setMonth]=useState(()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',
 }).format(new Date()));
 const [statement,setStatement]=useState<ReturnType<typeof readVndMonthlyCommission>|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const url='/api/service-v1/commission-statements?month='+encodeURIComponent(month);
 async function load(){
  setBusy(true);
  setError('');
  try{
   const response=await fetch(url);
   const data=await response.json();
   if(!response.ok)throw Error(data.error);
   setStatement(data);
  }catch(error){
   setError(error instanceof Error?error.message:'Không tải được kỳ hoa hồng.');
  }finally{
   setBusy(false);
  }
 }
 return <section aria-label="Kỳ hoa hồng VNĐ">
  <h2>Kỳ hoa hồng VNĐ</h2>
  <label>Tháng hoa hồng <input type="month" value={month} disabled={busy} onChange={event=>{
   setMonth(event.target.value);setStatement(null);setError('');
  }}/></label>{' '}
  <button type="button" disabled={!month||busy} onClick={()=>void load()}>Xem kỳ hoa hồng</button>{' '}
  {month&&<a href={url+'&format=xlsx'}>Tải Excel kỳ hoa hồng</a>}
  {error&&<p role="alert">{error}</p>}
  {statement&&<>
   <p role="status">{statusLabel[statement.status]}</p>
   <div style={{overflowX:'auto'}}>
    <table><thead><tr><th>Sales ID</th><th>Kỳ gốc VNĐ</th><th>Điều chỉnh VNĐ</th><th>Tổng VNĐ</th><th>Order cần rà soát</th></tr></thead>
     <tbody>{statement.sales.map(row=><tr key={row.sales_user_id??'unknown'}>
      <td>{row.sales_user_id??'Chưa gán'}</td><td>{row.base_vnd}</td><td>{row.adjustment_vnd}</td>
      <td>{row.total_vnd}</td><td>{row.unresolved_orders}</td>
     </tr>)}</tbody>
    </table>
    <table><thead><tr><th>Order ID</th><th>Sales ID</th><th>Kỳ gốc</th><th>Hoa hồng Order VNĐ</th><th>Ghi nhận tháng VNĐ</th><th>Nguồn điều chỉnh</th></tr></thead>
     <tbody>{statement.lines.map(row=><tr key={row.order_id}>
      <td>{row.order_id}</td><td>{row.sales_user_id??'Chưa gán'}</td><td>{row.origin_month}</td>
      <td>{row.order_commission_vnd??'Cần rà soát'}</td><td>{row.posting_vnd??'Cần rà soát'}</td>
      <td>{row.evidence.decisions.map(item=><div key={String(item.id)}>
       Claim {String(item.claim_id)} · {categoryLabel[String(item.category)]??String(item.category)} · QĐ {String(item.id)}
       {item.allocated_vnd===null&&' · Thiếu phân bổ'}
      </div>)}{row.evidence.ledger.map(item=><div key={String(item.id)}>{String(item.kind)} · #{String(item.id)}</div>)}</td>
     </tr>)}</tbody>
    </table>
   </div>
  </>}
 </section>;
}
