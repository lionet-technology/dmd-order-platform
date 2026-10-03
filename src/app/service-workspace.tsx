"use client";

import { useCallback,useEffect,useState } from "react";

type EnumRow={id:number;enum_type:string;value:string;parent_value:string;active:number;sort_order:number};
type RouteRow={
  id:number;service:string;sub_service:string;supplier:string;active:number;
  template_id?:number;template_name?:string;output_mode?:string;active_version_id?:number;version_number?:number;
  purchase_template_id?:number;purchase_template_name?:string;purchase_output_mode?:string;purchase_active_version_id?:number;purchase_version_number?:number;
  manifest_template_id?:number;manifest_template_name?:string;manifest_output_mode?:string;manifest_active_version_id?:number;manifest_version_number?:number;
  original_filename?:string;placeholder_map_json?:string;validation_json?:string;route_variables_json?:string;
};
type RouteVariable={key:string;value:string};
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
  const [templateKind,setTemplateKind]=useState<"PURCHASE"|"MANIFEST">("PURCHASE");
  const [template,setTemplate]=useState({name:"",output_mode:"MULTI_ORDER"});
  const [routeVariables,setRouteVariables]=useState<RouteVariable[]>([]);
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
  async function saveRouteVariables(){
    if(!selected)return;
    setBusy(true);setMessage("");
    try{
      const variables=Object.fromEntries(routeVariables.map(row=>[row.key.trim(),row.value]));
      await responseJson(await fetch("/api/service-routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected.id,service:selected.service,sub_service:selected.sub_service,supplier:selected.supplier,route_variables:variables,active:selected.active})}));
      setMessage("Đã lưu biến cố định cho cấu hình dịch vụ.");await load();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  function chooseTemplateKind(kind:"PURCHASE"|"MANIFEST",route:RouteRow=selected as RouteRow){
    if(!route)return;
    setTemplateKind(kind);setResult(null);setFile(null);
    if(kind==="MANIFEST")setTemplate({name:route.manifest_template_name||route.service+" Manifest "+route.supplier,output_mode:route.manifest_output_mode||"MULTI_ORDER"});
    else setTemplate({name:route.purchase_template_name||route.template_name||route.service+" "+route.supplier,output_mode:route.purchase_output_mode||route.output_mode||"MULTI_ORDER"});
  }
  async function upload(){
    if(!selected||!file){setMessage("Lỗi: Chọn Service Route và file .xlsx.");return}
    setBusy(true);setMessage("");setResult(null);
    try{
      const data=new FormData();
      data.set("route_config_id",String(selected.id));
      const currentTemplateId=templateKind==="MANIFEST"?selected.manifest_template_id:(selected.purchase_template_id||selected.template_id);
      if(currentTemplateId)data.set("template_id",String(currentTemplateId));
      data.set("template_kind",templateKind);data.set("name",template.name);data.set("output_mode",template.output_mode);
      data.set("repeat_sections",JSON.stringify(sections.filter(row=>row.sheet.trim()).map(row=>({sheet:row.sheet.trim(),row:Number(row.row),scope:row.scope}))));
      data.set("file",file);
      const body=await responseJson(await fetch("/api/purchase-templates",{method:"POST",body:data})) as UploadResult;
      setResult(body);
      setMessage(body.errors.length?"Template có lỗi, chưa thể activate.":"Đã upload và validate "+(templateKind==="MANIFEST"?"Manifest":"Purchase")+" version "+body.version.version_number+".");
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
      <div className="configHead"><div><b>Service Route Configuration</b><span>Mỗi cấu hình Service + optional Sub-Service + Supplier có thể có Purchase Template và Manifest Template riêng.</span></div></div>
      <div className="routeCreate">
        <label><span>Service</span><select value={form.service} onChange={e=>setForm({...form,service:e.target.value,sub_service:""})}><option value="">Chọn Service</option>{services.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <label><span>Sub-Service</span><select value={form.sub_service} disabled={!form.service} onChange={e=>setForm({...form,sub_service:e.target.value})}><option value="">{form.service?"Không có":"Chọn Service trước"}</option>{subServices.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <label><span>Supplier</span><select value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}><option value="">Chọn Supplier</option>{suppliers.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <button className="primaryBtn" disabled={busy||!form.service||!form.supplier} onClick={()=>void createRoute()}>＋ Thêm cấu hình</button>
      </div>
      <div className="tableWrap routeTable"><table><thead><tr><th>Service</th><th>Sub-Service</th><th>Supplier</th><th>Purchase Template</th><th>Manifest Template</th><th>Status</th><th></th></tr></thead><tbody>
        {routes.length?routes.map(row=><tr key={row.id} className={selected?.id===row.id?"selectedRoute":""}><td><b>{row.service}</b></td><td>{row.sub_service||"—"}</td><td>{row.supplier}</td><td>{row.purchase_template_name||row.template_name||"Chưa có"}{row.purchase_version_number||row.version_number?<small>Active v{row.purchase_version_number||row.version_number}</small>:null}</td><td>{row.manifest_template_name||"Chưa có"}{row.manifest_version_number?<small>Active v{row.manifest_version_number}</small>:null}</td><td><span className={row.active?"status goodStatus":"status neutralStatus"}>{row.active?"Active":"Inactive"}</span></td><td><button className="editBtn" onClick={()=>{setSelected(row);chooseTemplateKind("PURCHASE",row);let vars:Record<string,string>={};try{vars=JSON.parse(row.route_variables_json||"{}")}catch{}setRouteVariables(Object.entries(vars).map(([key,value])=>({key,value:String(value)})))}}>Cấu hình</button></td></tr>):<tr><td colSpan={7} className="empty">Chưa có Service Route.</td></tr>}
      </tbody></table></div>
    </section>

    {selected&&<section className="templateConfigCard">
      <div className="configHead"><div><b>Cấu hình file · {selected.service} / {selected.sub_service||"—"} / {selected.supplier}</b><span>Purchase = file mua label/đơn. Manifest = file khai báo sau khi đã có Tracking.</span></div><button className="iconBtn" onClick={()=>setSelected(null)}>×</button></div>
      <div className="templateKindTabs"><button className={templateKind==="PURCHASE"?"active":""} onClick={()=>chooseTemplateKind("PURCHASE")}>Purchase Template</button><button className={templateKind==="MANIFEST"?"active":""} onClick={()=>chooseTemplateKind("MANIFEST")}>Manifest Template</button></div>
      <div className="routeVariablesEditor">
        <div className="routeVariablesHead"><div><b>Biến cố định cho template</b><span>Dữ liệu cố định của cấu hình này. Dùng trong Excel bằng <code>{"{{route.service_code}}"}</code>, <code>{"{{route.sender_address}}"}</code>…</span></div><button className="secondaryBtn" disabled={busy} onClick={()=>void saveRouteVariables()}>Lưu biến cố định</button></div>
        {routeVariables.map((row,index)=><div className="routeVariableRow" key={index}>
          <input placeholder="Key, ví dụ service_code" value={row.key} onChange={e=>setRouteVariables(prev=>prev.map((item,i)=>i===index?{...item,key:e.target.value}:item))}/>
          <input placeholder="Giá trị cố định" value={row.value} onChange={e=>setRouteVariables(prev=>prev.map((item,i)=>i===index?{...item,value:e.target.value}:item))}/>
          <code>{row.key.trim()?"{{route."+row.key.trim().toLowerCase()+"}}":"{{route.key}}"}</code>
          <button className="editBtn" onClick={()=>setRouteVariables(prev=>prev.filter((_,i)=>i!==index))}>Bỏ</button>
        </div>)}
        <button className="textBtn" onClick={()=>setRouteVariables(prev=>[...prev,{key:"",value:""}])}>＋ Thêm biến cố định</button>
      </div>
      <div className="templateGrid">
        <label><span>Tên Template</span><input value={template.name} onChange={e=>setTemplate({...template,name:e.target.value})}/></label>
        <label><span>Cách chia file</span><select value={template.output_mode} onChange={e=>setTemplate({...template,output_mode:e.target.value})}><option value="MULTI_ORDER">Gộp nhiều Order</option><option value="PER_ORDER">Tách theo Order</option><option value="PER_LOT">Tách theo Lot</option></select></label>
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
      <div className="templateActions"><button className="primaryBtn" disabled={busy||!file||!template.name} onClick={()=>void upload()}>Upload & Validate {templateKind==="MANIFEST"?"Manifest":"Purchase"}</button>
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
