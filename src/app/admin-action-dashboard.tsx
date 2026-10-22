'use client';
import {useCallback,useEffect,useState} from 'react';
type Row=Record<string,unknown>;
type Queue={unpriced:Row[];blocked_statement_count:number;partial_labels:Row[];age_review:Row[];as_of:string};
export function AdminActionDashboard({openOrder,openDebt,openStatement}:{openOrder:(id:number)=>void;openDebt:(clientId:number)=>void;openStatement:()=>void}){
 const [queue,setQueue]=useState<Queue|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const refresh=useCallback(async()=>{setLoading(true);try{const r=await fetch('/api/admin-action-queue',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error);setQueue(j);setError('')}catch(e){setError((e as Error).message)}finally{setLoading(false)}},[]);
 useEffect(()=>{void refresh()},[refresh]);
 return <section className="panel" aria-label="Việc Admin cần xử lý">
  <div className="panelHead"><div><h3>Việc cần xử lý</h3><p>Ưu tiên hoàn tất trước khi chốt Statement · không tự thay đổi tiền</p></div><button className="secondaryBtn" disabled={loading} onClick={()=>void refresh()}>Làm mới</button></div>
  {loading&&<p role="status">Đang tải…</p>}{error&&<p role="alert">{error}</p>}
  {queue&&<div className="dashboardGrid">
   <div><h4>Chưa chốt giá bán ({queue.unpriced.length}{queue.unpriced.length===100?'+':''})</h4>{queue.blocked_statement_count>0&&<p role="alert">Ưu tiên: {queue.blocked_statement_count} Order đã qua kỳ đối soát còn thiếu giá. Xử lý trước khi Finalize Statement.</p>}{queue.unpriced.length===0?<p className="emptyState">Không có Order thiếu giá.</p>:<ul>{queue.unpriced.slice(0,12).map(o=><li key={String(o.id)}><button className="rowAction" onClick={()=>openOrder(Number(o.id))}>{String(o.system_order_code||o.order_id||o.id)} · {String(o.service)} · {String(o.labels)} Label · {o.priority==='BLOCKS_STATEMENT'?'Ưu tiên chốt kỳ':'Nhập giá'}</button></li>)}</ul>}<button className="secondaryBtn" onClick={openStatement}>Đối chiếu / chốt Statement</button></div>
   <div><h4>Label chưa đủ ({queue.partial_labels.length}{queue.partial_labels.length===100?'+':''})</h4>{queue.partial_labels.length===0?<p className="emptyState">Không có Order thiếu Label.</p>:<ul>{queue.partial_labels.slice(0,12).map(o=><li key={String(o.id)}><button className="rowAction" onClick={()=>openOrder(Number(o.id))}>{String(o.system_order_code||o.order_id||o.id)} · {String(o.labelled)}/{String(o.carton_count)} Carton</button></li>)}</ul>}
    <h4>Tuổi nợ cần xác minh ({queue.age_review.length})</h4>{queue.age_review.length===0?<p className="emptyState">Không có Client cần đối chiếu.</p>:<ul>{queue.age_review.slice(0,10).map(c=><li key={String(c.client_id)}><button className="rowAction" onClick={()=>openDebt(Number(c.client_id))}>{String(c.client)} · {String((c.warnings as string[]||[]).join('; '))}</button></li>)}</ul>}</div>
  </div>}
 </section>;
}
