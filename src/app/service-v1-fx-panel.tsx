"use client";
import {useEffect,useRef,useState} from 'react';
type Version={id:number;usd_vnd:number;created_at:string};
type Workspace={current:Version|null;versions:Version[]};
export function ServiceV1FxPanel(){
 const [data,setData]=useState<Workspace|null>(null),[value,setValue]=useState(''),[candidate,setCandidate]=useState<Version|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef<{payload:string;key:string}|null>(null);
 async function load(){const response=await fetch('/api/service-v1/fx'),body=await response.json();if(!response.ok)throw Error(body.error);setData(body);}
 useEffect(()=>{void load().catch(e=>setMessage(e.message))},[]);
 async function command(body:object){setBusy(true);setMessage('');try{
  const payload=JSON.stringify(body);if(pending.current?.payload!==payload)pending.current={payload,key:crypto.randomUUID()};
  const response=await fetch('/api/service-v1/fx',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,request_key:pending.current.key})}),result=await response.json();
  if(!response.ok)throw Error(result.error);pending.current=null;
  if('usd_vnd' in result){setCandidate(result);setMessage('Đã lưu phiên bản. Kiểm tra và xác nhận để áp dụng.');}else{setCandidate(null);setMessage('Đã xác nhận Rate. Báo giá mới dùng phiên bản vừa xác nhận.');}
  await load();
 }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}}
 return <section className="settingsSection"><div className="settingsSectionTitle"><h3>Rate USD–VND · ePacket</h3><p>Quy đổi Net USD sang VNĐ trước khi tính Base và Retail. Báo giá đã lưu giữ nguyên phiên bản tỷ giá.</p></div>
 {data&&<p>Rate đã xác nhận: <b>{data.current?data.current.usd_vnd.toLocaleString('vi-VN')+' VNĐ/USD · #'+data.current.id:'Chưa có'}</b></p>}
 <label className="field"><span>Rate mới (VNĐ cho 1 USD)</span><input type="number" min="0" step="any" disabled={busy} value={value} onChange={e=>setValue(e.target.value)}/></label>
 <button className="secondaryBtn" disabled={busy||!data||!Number.isFinite(Number(value))||Number(value)<=0} onClick={()=>void command({action:'SAVE',usd_vnd:Number(value)})}>Lưu phiên bản Rate</button>
 {candidate&&data&&<div className="settingsNotice"><p>Xác nhận phiên bản #{candidate.id}: <b>{candidate.usd_vnd.toLocaleString('vi-VN')} VNĐ/USD</b></p><button className="primaryBtn" disabled={busy} onClick={()=>void command({action:'CONFIRM',version_id:candidate.id,expected_previous_id:data.current?.id??null,confirmed:true})}>Xác nhận Rate này</button></div>}
 {message&&<p role="status">{message}</p>}
 {data&&<details><summary>Lịch sử phiên bản Rate</summary>{data.versions.map(v=><p key={v.id}>#{v.id} · {v.usd_vnd.toLocaleString('vi-VN')} VNĐ/USD · {v.created_at}</p>)}</details>}
 </section>;
}
