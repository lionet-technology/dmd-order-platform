"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
type Doc={id:number;kind:string;config_id:number;body_json:string};
type Workspace={net:Doc|null;selling:Doc|null;documents:Doc[]};
type Config={id:number;revision:number;config_json:string};
export function FinalSourcePricingPanel({routeId,service}:{routeId:number;service:string}){
 const [data,setData]=useState<Workspace|null>(null),[config,setConfig]=useState<Config|null>(null),[markets,setMarkets]=useState('US'),[netMarkup,setNetMarkup]=useState(service.toLowerCase()==='epacket'?'6':'12'),[baseMarkup,setBaseMarkup]=useState(service.toLowerCase()==='epacket'?'16':'32'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef<{payload:string;key:string}|null>(null);
 const load=useCallback(async()=>{
  const responses=await Promise.all([fetch('/api/service-v1/pricing?route_id='+routeId),fetch('/api/service-v1/configuration?route_id='+routeId)]);
  const [pricing,cfg]=await Promise.all(responses.map(r=>r.json()));
  if(!responses[0].ok||!responses[1].ok)throw Error(pricing.error||cfg.error);
  setData(pricing);setConfig(cfg.configuration);
  if(cfg.configuration)setMarkets(JSON.parse(cfg.configuration.config_json).markets.join(', '));
 },[routeId]);
 useEffect(()=>{void load().catch(e=>setMessage(e.message));},[load]);
 async function command(url:string,body:Record<string,unknown>){
  setBusy(true);setMessage('');
  try{
   const payload=JSON.stringify({url,...body});
   if(pending.current?.payload!==payload)pending.current={payload,key:crypto.randomUUID()};
   const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,request_key:pending.current.key})}),result=await r.json();
   if(!r.ok)throw Error(result.error);
   pending.current=null;await load();setMessage('Đã lưu. Kiểm tra trạng thái phát hành bên dưới.');
  }catch(e){setMessage(e instanceof Error?e.message:'Không xử lý được.');}finally{setBusy(false);}
 }
 const event=(d:Doc,action:string)=>command('/api/service-v1/pricing',{document_id:d.id,action,expected_published_id:(d.kind==='NET'?data?.net:data?.selling)?.id??null});
 const current=data?.selling?JSON.parse(data.selling.body_json):null;
 return <section className="settingsSection">
  <h3>Bảng giá VNĐ · Excel cuối (2)</h3>
  <p>Áp dụng cho tài khoản VNĐ đã mở. Nhập Net từ nguồn đã kiểm chứng, sau đó kiểm tra và phát hành Net, Base và Retail.</p>
  <label className="field"><span>Quốc gia được phép (mã hai chữ, cách nhau bằng dấu phẩy)</span><input value={markets} disabled={busy} onChange={e=>setMarkets(e.target.value)}/></label>
  <button className="secondaryBtn" disabled={busy||!data} onClick={()=>void command('/api/service-v1/configuration',{route_id:routeId,expected_revision:config?.revision??0,config:{currency:'VND',adapter:service.toLowerCase()==='epacket'?'EPACKET':'YUNEXPRESS',markets:markets.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean)}})}>Lưu cấu hình quốc gia</button>
  <p>Net đang phát hành: {data?.net?'#'+data.net.id:'Chưa có'} · Giá bán đang phát hành: {data?.selling?'#'+data.selling.id:'Chưa có'}.</p>
  <button className="secondaryBtn" disabled={busy||!config} onClick={()=>void command('/api/service-v1/source',{action:'import',route_id:routeId})}>Nhập Net từ Excel (2)</button>
  <div className="settingsGrid">
   <label className="field"><span>Net → Base (%)</span><input type="number" min="0" step="any" value={netMarkup} onChange={e=>setNetMarkup(e.target.value)}/></label>
   <label className="field"><span>Base → Retail (%)</span><input type="number" min="0" step="any" value={baseMarkup} onChange={e=>setBaseMarkup(e.target.value)}/></label>
  </div>
  <button className="secondaryBtn" disabled={busy||!config||!data?.net} onClick={()=>void command('/api/service-v1/pricing',{action:'CREATE_PROPOSAL',route_id:routeId,config_id:config!.id,net_id:data!.net!.id,net_markup:Number(netMarkup)/100,base_markup:Number(baseMarkup)/100})}>Tạo đề xuất Base / Retail</button>
  <h4>Phiên bản để kiểm tra và phát hành</h4>
  {data?.documents.slice(0,10).map(d=><details key={d.id}><summary>#{d.id} · {d.kind==='NET'?'Net':'Base / Retail'} · cấu hình #{d.config_id}</summary>
   <div style={{maxHeight:260,overflow:'auto'}}><table><thead><tr><th>Thị trường / hạng cân</th><th>Net</th><th>Base VNĐ</th><th>Retail VNĐ</th></tr></thead><tbody>{(JSON.parse(d.body_json).rows as Array<{key:string;net_usd?:number;net_vnd:number;base_vnd?:number;retail_vnd?:number;base_vnd_decimal?:string;retail_vnd_decimal?:string}>).map(row=><tr key={row.key}><td>{row.key}</td><td>{row.net_usd!==undefined?row.net_usd+' USD':row.net_vnd+' VNĐ'}</td><td>{row.base_vnd_decimal??row.base_vnd??'—'}</td><td>{row.retail_vnd_decimal??row.retail_vnd??'—'}</td></tr>)}</tbody></table></div>
   <button disabled={busy} onClick={()=>void event(d,'REVIEW')}>Đã kiểm tra phiên bản #{d.id}</button>
   <button disabled={busy} onClick={()=>void event(d,'PUBLISH')}>Phát hành phiên bản #{d.id}</button>
  </details>)}
  {current&&<p>Markup đang phát hành: Net → Base {current.net_markup*100}% · Base → Retail {current.base_markup*100}%. FX mới chỉ áp dụng sau xác nhận; đơn đã cấp nhãn giữ snapshot.</p>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
