"use client";

import { useCallback,useEffect,useState } from "react";

type EnumRow={id:number;enum_type:string;value:string;parent_value:string;active:number;sort_order:number};
type RouteRow={
  id:number;service:string;sub_service:string;supplier:string;active:number;
  template_id?:number;template_name?:string;output_mode?:string;active_version_id?:number;version_number?:number;
  original_filename?:string;placeholder_map_json?:string;validation_json?:string;
};
type RepeatDraft={sheet:string;row:string;scope:"ORDER"|"LOT"|"CARTON"|"CARTON_ITEM"};
type UploadResult={
  template_id:number;version:{id:number;version_number:number};placeholders:Array<{sheet:string;cell:string;token:string}>;
  errors:string[];warnings:string[];
};
type SampleOrder={id:number;system_order_code:string;order_id:string;customer:string};

const options=(rows:EnumRow[],type:string,parent="")=>rows.filter(row=>row.enum_type===type&&row.active!==0&&(!parent||row.parent_value===parent));
async function responseJson(response:Response){const body=await response.json();if(!response.ok)throw new Error(body.error||"Request failed");return body}
function download(response:Response,blob:Blob){
  const disposition=response.headers.get("content-disposition")||"";
  const filename=disposition.match(/filename="?([^";]+)"?/)?.[1]||"preview.xlsx";
  const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function ServiceConfigurationPanel({enums}:{enums:EnumRow[]}){
  const [routes,setRoutes]=useState<RouteRow[]>([]);
  const [selected,setSelected]=useState<RouteRow|null>(null);
  const [form,setForm]=useState({service:"",sub_service:"",supplier:""});
  const [template,setTemplate]=useState({name:"",output_mode:"MULTI_ORDER"});
  const [sections,setSections]=useState<RepeatDraft[]>([{sheet:"",row:"2",scope:"CARTON"}]);
  const [file,setFile]=useState<File|null>(null);
  const [result,setResult]=useState<UploadResult|null>(null);
  const [samples,setSamples]=useState<SampleOrder[]>([]);
  const [sampleOrderId,setSampleOrderId]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    const [routeResponse,orderResponse]=await Promise.all([fetch("/api/service-routes"),fetch("/api/orders?page=1&pageSize=50")]);
    if(routeResponse.ok)setRoutes(await routeResponse.json());
    if(orderResponse.ok){const body=await orderResponse.json();setSamples(body.items||[])}
  },[]);
  useEffect(()=>{void load()},[load]);

  async function createRoute(){
    setBusy(true);setMessage("");
    try{
      await responseJson(await fetch("/api/service-routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)}));
      setForm({service:"",sub_service:"",supplier:""});setMessage("Đã lưu Service Route.");await load();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  async function upload(){
    if(!selected||!file){setMessage("Lỗi: Chọn Service Route và file .xlsx.");return}
    setBusy(true);setMessage("");setResult(null);
    try{
      const data=new FormData();
      data.set("route_config_id",String(selected.id));if(selected.template_id)data.set("template_id",String(selected.template_id));
      data.set("name",template.name);data.set("output_mode",template.output_mode);
      data.set("repeat_sections",JSON.stringify(sections.filter(row=>row.sheet.trim()).map(row=>({sheet:row.sheet.trim(),row:Number(row.row),scope:row.scope}))));
      data.set("file",file);
      const body=await responseJson(await fetch("/api/purchase-templates",{method:"POST",body:data})) as UploadResult;
      setResult(body);
      setMessage(body.errors.length?"Template có lỗi, chưa thể activate.":"Đã upload và validate version "+body.version.version_number+".");
      await load();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  async function activate(){
    if(!result)return;
    setBusy(true);setMessage("");
    try{
      await responseJson(await fetch("/api/purchase-templates/"+result.template_id+"/activate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version_id:result.version.id})}));
      setMessage("Đã activate template version "+result.version.version_number+".");await load();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  async function preview(){
    if(!result||!sampleOrderId){setMessage("Lỗi: Chọn Order mẫu.");return}
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/purchase-template-versions/"+result.version.id+"/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order_id:Number(sampleOrderId)})});
      if(!response.ok){const body=await response.json();throw new Error(body.error)}
      download(response,await response.blob());setMessage("Đã tạo file preview.");
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }

  const services=options(enums,"SERVICE");
  const subServices=form.service?options(enums,"SUB_SERVICE",form.service):[];
  const suppliers=options(enums,"SUPPLIER");
  return <div className="serviceConfigWorkspace">
    <section className="routeConfigCard">
      <div className="configHead"><div><b>Service Route Configuration</b><span>Quan hệ Service + optional Sub-Service + Supplier dùng để tự resolve Purchase Template.</span></div></div>
      <div className="routeCreate">
        <label><span>Service</span><select value={form.service} onChange={e=>setForm({...form,service:e.target.value,sub_service:""})}><option value="">Chọn Service</option>{services.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <label><span>Sub-Service</span><select value={form.sub_service} disabled={!form.service} onChange={e=>setForm({...form,sub_service:e.target.value})}><option value="">{form.service?"Không có":"Chọn Service trước"}</option>{subServices.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <label><span>Supplier</span><select value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}><option value="">Chọn Supplier</option>{suppliers.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <button className="primaryBtn" disabled={busy||!form.service||!form.supplier} onClick={()=>void createRoute()}>＋ Thêm cấu hình</button>
      </div>
      <div className="tableWrap routeTable"><table><thead><tr><th>Service</th><th>Sub-Service</th><th>Supplier</th><th>Purchase Template</th><th>Output</th><th>Status</th><th></th></tr></thead><tbody>
        {routes.length?routes.map(row=><tr key={row.id} className={selected?.id===row.id?"selectedRoute":""}><td><b>{row.service}</b></td><td>{row.sub_service||"—"}</td><td>{row.supplier}</td><td>{row.template_name||"Chưa có Purchase Template"}{row.version_number?<small>Active v{row.version_number}</small>:null}</td><td>{row.output_mode||"—"}</td><td><span className={row.active?"status goodStatus":"status neutralStatus"}>{row.active?"Active":"Inactive"}</span></td><td><button className="editBtn" onClick={()=>{setSelected(row);setTemplate({name:row.template_name||row.service+" "+row.supplier,output_mode:row.output_mode||"MULTI_ORDER"});setResult(null)}}>Cấu hình Template</button></td></tr>):<tr><td colSpan={7} className="empty">Chưa có Service Route.</td></tr>}
      </tbody></table></div>
    </section>

    {selected&&<section className="templateConfigCard">
      <div className="configHead"><div><b>Purchase Template · {selected.service} / {selected.sub_service||"—"} / {selected.supplier}</b><span>Upload workbook thật của Supplier, validate placeholder, preview rồi mới activate.</span></div><button className="iconBtn" onClick={()=>setSelected(null)}>×</button></div>
      <div className="templateGrid">
        <label><span>Tên Template</span><input value={template.name} onChange={e=>setTemplate({...template,name:e.target.value})}/></label>
        <label><span>Output Mode</span><select value={template.output_mode} onChange={e=>setTemplate({...template,output_mode:e.target.value})}><option value="MULTI_ORDER">Multi Order</option><option value="PER_ORDER">Per Order</option><option value="PER_LOT">Per Lot</option></select></label>
        <label className="file"><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"Chọn workbook .xlsx"}</span></label>
      </div>
      <div className="repeatEditor"><div><b>Dòng lặp</b><span>Mỗi dòng mẫu trong file tương ứng với dữ liệu nào. Bỏ trống Sheet nếu template chỉ thay các ô cố định.</span></div>
        {sections.map((row,index)=><div className="repeatRow" key={index}>
          <input placeholder="Tên Sheet chính xác" value={row.sheet} onChange={e=>setSections(prev=>prev.map((item,i)=>i===index?{...item,sheet:e.target.value}:item))}/>
          <input type="number" min="1" placeholder="Dòng" value={row.row} onChange={e=>setSections(prev=>prev.map((item,i)=>i===index?{...item,row:e.target.value}:item))}/>
          <select value={row.scope} onChange={e=>setSections(prev=>prev.map((item,i)=>i===index?{...item,scope:e.target.value as RepeatDraft["scope"]}:item))}><option value="ORDER">Một Order</option><option value="LOT">Một Lot</option><option value="CARTON">Một Carton</option><option value="CARTON_ITEM">Một sản phẩm trong Carton</option></select>
          <button className="editBtn" onClick={()=>setSections(prev=>prev.filter((_,i)=>i!==index))}>Bỏ</button>
        </div>)}
        <button className="textBtn" onClick={()=>setSections(prev=>[...prev,{sheet:"",row:"2",scope:"CARTON_ITEM"}])}>＋ Thêm dòng lặp</button>
      </div>
      <div className="templateActions"><button className="primaryBtn" disabled={busy||!file||!template.name} onClick={()=>void upload()}>Upload & Validate</button>
        {result&&<><select value={sampleOrderId} onChange={e=>setSampleOrderId(e.target.value)}><option value="">Chọn Order mẫu</option>{samples.map(order=><option key={order.id} value={order.id}>{order.system_order_code} · {order.customer}</option>)}</select><button className="secondaryBtn" disabled={busy||!sampleOrderId} onClick={()=>void preview()}>Tạo file preview</button><button className="secondaryBtn" disabled={busy||Boolean(result.errors.length)} onClick={()=>void activate()}>Activate version</button></>}
      </div>
      {result&&<div className="validationResult">
        <b>{result.placeholders.length} placeholder được tìm thấy</b>
        {result.errors.map((value,index)=><p className="error" key={"e"+index}>Lỗi: {value}</p>)}
        {result.warnings.map((value,index)=><p key={"w"+index}>Cảnh báo: {value}</p>)}
        <div>{result.placeholders.map((row,index)=><code key={index}>{row.sheet}!{row.cell} → {row.token}</code>)}</div>
      </div>}
    </section>}
    {message&&<div className={message.startsWith("Lỗi")?"enumMessage error":"enumMessage"}>{message}</div>}
  </div>;
}
