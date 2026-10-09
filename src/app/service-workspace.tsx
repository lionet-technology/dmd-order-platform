"use client";

import {ConfirmationDialog} from "./confirmation-dialog";
import { RoutePricingPanel } from "./route-pricing-panel";
import { useCallback,useEffect,useRef,useState } from "react";

type SegmentRule={rule_type:string;segments:string[];priority:number;active:boolean;config:Record<string,unknown>};
type Segmentation={enabled:boolean;rules:SegmentRule[]};
type EnumRow={id:number;enum_type:string;value:string;parent_value:string;active:number;sort_order:number};
type RouteRow={
  id:number;config_locked?:boolean;status?:string;missing_cost_orders?:number;open_claims?:number;can_delete?:boolean;service:string;sub_service:string;supplier:string;active:number;segmentation?:Segmentation;
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

function ActiveTemplateDownload({versionId,kind}:{versionId?:number;kind:"Purchase"|"Manifest"}){
  if(!versionId)return null;
  const label="Tải "+kind+" Template đang dùng (giữ placeholder)";
  return <a className="templateDownload" href={"/api/purchase-template-versions/"+versionId+"/download"} title={label} aria-label={label}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>
  </a>;
}

export function ServiceConfigurationPanel({enums}:{enums:EnumRow[]}){
  const [lifecycleReview,setLifecycleReview]=useState<{action:string;route:RouteRow}|null>(null);
  const [lifecycleError,setLifecycleError]=useState("");
  const [routeSearch,setRouteSearch]=useState("");
  const [routeTab,setRouteTab]=useState("pricing");
  const editorRef=useRef<HTMLDivElement>(null);
  const [loadingRoutes,setLoadingRoutes]=useState(true);
  const [routes,setRoutes]=useState<RouteRow[]>([]);
  const [selected,setSelected]=useState<RouteRow|null>(null);
  const [form,setForm]=useState({service:"",sub_service:"",supplier:""});
  const [segmentation,setSegmentation]=useState<Segmentation>({enabled:false,rules:[]});
  const [segmentDrafts,setSegmentDrafts]=useState<string[]>([]);
  const [configDrafts,setConfigDrafts]=useState<string[]>([]);
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
    setLoadingRoutes(true);
    try{const [routeResponse,orderResponse]=await Promise.all([fetch("/api/service-routes"),fetch("/api/orders?page=1&pageSize=50")]);
    if(routeResponse.ok){const next=await routeResponse.json() as RouteRow[];setRoutes(next);setSelected(previous=>previous?next.find(row=>row.id===previous.id)||null:null);}else throw Error((await routeResponse.json()).error||"Không thể tải cấu hình dịch vụ.");
    if(orderResponse.ok){const body=await orderResponse.json();setSamples(body.items||[])}
    }finally{setLoadingRoutes(false)}
  },[]);
  useEffect(()=>{void load().catch(e=>setMessage("Lỗi: "+e.message))},[load]);

  async function createRoute(){
    setBusy(true);setMessage("");
    try{
      const created=await responseJson(await fetch("/api/service-routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,create_new:true,active:false})})) as RouteRow;
      setSelected(created);setRouteTab("pricing");setRouteVariables([]);setSegmentation({enabled:false,rules:[]});chooseTemplateKind("PURCHASE",created);
      setForm({service:"",sub_service:"",supplier:""});setMessage("Đã tạo cấu hình nháp. Thiết lập giá và template trước khi kích hoạt.");await load();
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
  async function saveRouteSegmentation(){
    if(!selected)return;
    setBusy(true);setMessage("");
    try{
      const rules=segmentation.rules.map((rule,index)=>({...rule,segments:(segmentDrafts[index]||"").split(",").map(value=>value.trim()).filter(Boolean),config:JSON.parse(configDrafts[index]||"{}")}));
      const saved=await responseJson(await fetch("/api/service-routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected.id,service:selected.service,sub_service:selected.sub_service,supplier:selected.supplier,active:selected.active,segmentation:{...segmentation,rules}})})) as RouteRow;
      setSelected(saved);setSegmentation(saved.segmentation!);setSegmentDrafts(saved.segmentation!.rules.map(rule=>rule.segments.join(", ")));setConfigDrafts(saved.segmentation!.rules.map(rule=>JSON.stringify(rule.config,null,2)));
      setMessage("Đã lưu phân loại xuất hàng nâng cao.");await load();
    }catch(error){setMessage("Lỗi: "+(error as Error).message)}
    finally{setBusy(false)}
  }
  function updateSegmentRule(index:number,changes:Partial<SegmentRule>){setSegmentation(prev=>({...prev,rules:prev.rules.map((rule,i)=>i===index?{...rule,...changes}:rule)}))}
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

  const selectedRouteId=selected?.id;
  useEffect(()=>{if(selectedRouteId)editorRef.current?.scrollIntoView({block:"start"})},[selectedRouteId]);
  async function changeLifecycle(action:string,confirm=false){
    if(!selected)return;
    setBusy(true);setMessage("");setLifecycleError("");
    try{
      if(["ARCHIVED","DELETE"].includes(action)&&!confirm){
        const latest=await responseJson(await fetch("/api/service-routes")) as RouteRow[];
        const route=latest.find(r=>r.id===selected.id);if(!route)throw Error("Route không còn tồn tại.");
        setSelected(route);setLifecycleReview({action,route});return;
      }
      await responseJson(await fetch("/api/service-routes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:selected.id,action,confirm})}));
      setLifecycleReview(null);setSelected(null);await load();setMessage("Đã cập nhật vòng đời dịch vụ.");
    }catch(e){if(lifecycleReview)setLifecycleError((e as Error).message);else setMessage("Lỗi: "+(e as Error).message)}finally{setBusy(false)}
  }
  const filteredRoutes=routes.filter(row=>[row.service,row.sub_service,row.supplier].join(" ").toLowerCase().includes(routeSearch.trim().toLowerCase()));
  const services=options(enums,"SERVICE");
  const subServices=form.service?options(enums,"SUB_SERVICE",form.service):[];
  const suppliers=options(enums,"SUPPLIER");
  return <div className="serviceConfigWorkspace">
    <section className="routeConfigCard">
      <div className="configHead"><div><b>Cấu hình dịch vụ</b><span>Quản lý giá, phụ phí và file xuất theo Service / Sub-Service / Supplier.</span></div></div>
      <details className="routeCreateDisclosure settingsDisclosure"><summary>＋ Thêm cấu hình dịch vụ</summary><div className="routeCreate">
        <label><span>Service</span><select value={form.service} onChange={e=>setForm({...form,service:e.target.value,sub_service:""})}><option value="">Chọn Service</option>{services.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <label><span>Sub-Service</span><select value={form.sub_service} disabled={!form.service} onChange={e=>setForm({...form,sub_service:e.target.value})}><option value="">{form.service?"Không có":"Chọn Service trước"}</option>{subServices.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <label><span>Supplier</span><select value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})}><option value="">Chọn Supplier</option>{suppliers.map(row=><option key={row.id}>{row.value}</option>)}</select></label>
        <button className="primaryBtn" disabled={busy||!form.service||!form.supplier} onClick={()=>void createRoute()}>＋ Thêm cấu hình</button>
      </div>
      </details>
      <div className="routeListToolbar"><label className="searchBox"><span aria-hidden="true">⌕</span><input aria-label="Tìm cấu hình dịch vụ" placeholder="Tìm Service, Sub-Service, Supplier…" value={routeSearch} onChange={e=>setRouteSearch(e.target.value)}/></label><span>{filteredRoutes.length} / {routes.length} cấu hình · {routes.filter(row=>row.active).length} đang hoạt động</span></div>
      {loadingRoutes?<p role="status">Đang tải cấu hình dịch vụ…</p>:<div className="tableWrap routeTable"><table><thead><tr><th>Service</th><th>Sub-Service</th><th>Supplier</th><th>Purchase Template</th><th>Manifest Template</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {filteredRoutes.length?filteredRoutes.map(row=><tr key={row.id} className={selected?.id===row.id?"selectedRoute":""}><td data-label="Service"><b>{row.service}</b></td><td data-label="Sub-Service">{row.sub_service||"—"}</td><td data-label="Supplier">{row.supplier}</td><td data-label="Purchase Template">{row.purchase_template_name||row.template_name||"Chưa có"}{row.purchase_version_number||row.version_number?<small>Active v{row.purchase_version_number||row.version_number}<ActiveTemplateDownload versionId={row.purchase_active_version_id||row.active_version_id} kind="Purchase"/></small>:null}</td><td data-label="Manifest Template">{row.manifest_template_name||"Chưa có"}{row.manifest_version_number?<small>Active v{row.manifest_version_number}<ActiveTemplateDownload versionId={row.manifest_active_version_id} kind="Manifest"/></small>:null}</td><td data-label="Trạng thái"><span className={row.active?"status goodStatus":"status neutralStatus"}>{row.status||(row.active?"Active":"Inactive")}</span></td><td data-label="Thao tác"><button className="editBtn" onClick={()=>{setRouteTab("pricing");setSelected(row);setSegmentation(row.segmentation||{enabled:false,rules:[]});setSegmentDrafts((row.segmentation?.rules||[]).map(rule=>rule.segments.join(", ")));setConfigDrafts((row.segmentation?.rules||[]).map(rule=>JSON.stringify(rule.config,null,2)));chooseTemplateKind("PURCHASE",row);let vars:Record<string,string>={};try{vars=JSON.parse(row.route_variables_json||"{}")}catch{}setRouteVariables(Object.entries(vars).map(([key,value])=>({key,value:String(value)})))}}>Cấu hình</button></td></tr>):<tr><td colSpan={7} className="empty">{routes.length?"Không có cấu hình phù hợp với tìm kiếm.":"Chưa có cấu hình. Thêm dịch vụ để bắt đầu."}</td></tr>}
      </tbody></table></div>}
    </section>

    {selected&&<>
      <div className="routeEditorHeader" ref={editorRef}><div><span className="eyebrow">ĐANG CẤU HÌNH</span><h2>{selected.service}{selected.sub_service?" / "+selected.sub_service:""}</h2><p>Supplier: {selected.supplier} · {selected.active?"Đang hoạt động":"Không hoạt động"}</p></div><div className="routeLifecycleActions"><button className="secondaryBtn" disabled={busy} onClick={()=>void changeLifecycle(selected.active?"INACTIVE":"ACTIVE")}>{selected.active?"Ngừng hoạt động":"Kích hoạt"}</button><button className="secondaryBtn" disabled={busy||selected.status==="ARCHIVED"} onClick={()=>void changeLifecycle("ARCHIVED")}>Lưu trữ</button>{selected.can_delete&&<button className="secondaryBtn" disabled={busy} onClick={()=>void changeLifecycle("DELETE")}>Xóa</button>}<button className="secondaryBtn" onClick={()=>setSelected(null)}>Đóng cấu hình</button></div></div>
      <div className="routeEditorTabs" role="group" aria-label="Các mục cấu hình dịch vụ">{[["pricing","Giá & phụ phí"],["templates","Template xuất file"],["segmentation","Phân vùng nâng cao"]].map(([key,label])=><button key={key} className={routeTab===key?"active":""} aria-pressed={routeTab===key} onClick={()=>setRouteTab(key)}>{label}</button>)}</div>
      <div hidden={routeTab!=="pricing"}><RoutePricingPanel key={selected.id} routeId={selected.id}/></div>
      <section hidden={routeTab!=="segmentation"} className="templateConfigCard">
      <div className="routeVariablesEditor segmentationEditor">
        <div className="routeVariablesHead"><div><b>Phân loại xuất hàng nâng cao</b><span>Route chính vẫn là Service + optional Sub-Service + Supplier.</span></div><button className="secondaryBtn" disabled={busy} onClick={()=>void saveRouteSegmentation()}>Lưu phân vùng</button></div>
        <label className="segmentationToggle"><input type="checkbox" role="switch" checked={segmentation.enabled} disabled={busy} onChange={e=>setSegmentation({...segmentation,enabled:e.target.checked})}/> Bật phân vùng cho route này</label>
        {!segmentation.enabled?<p>Đang tắt — không áp dụng segment rule.</p>:<>
          <p role="status">{segmentation.rules.some(rule=>rule.active&&rule.segments.length)?"Đang hoạt động":"Chưa cấu hình rule"}</p>
          <p>Trạng thái phản ánh cấu hình rule. Chỉ kiểm tra phân vùng khi evaluator trả về segment cụ thể. Các rule ZIP_US / US_ZIP_REGION chưa hỗ trợ tự xác định vùng East/West theo ZIP.</p>
          {segmentation.rules.map((rule,index)=><fieldset key={index} disabled={busy}>
            <legend>Rule {index+1}</legend>
            <div className="templateGrid">
              <label><span>Rule type</span><input list="segmentRuleTypes" value={rule.rule_type} onChange={e=>updateSegmentRule(index,{rule_type:e.target.value})}/></label>
              <label><span>Segments (cách nhau bằng dấu phẩy)</span><input value={segmentDrafts[index]||""} onChange={e=>{setSegmentDrafts(prev=>prev.map((value,i)=>i===index?e.target.value:value));updateSegmentRule(index,{segments:e.target.value.split(",").map(value=>value.trim()).filter(Boolean)})}}/></label>
              <label><span>Priority (cao chạy trước)</span><input type="number" min="-10000" max="10000" value={rule.priority} onChange={e=>updateSegmentRule(index,{priority:Number(e.target.value)})}/></label>
              <label><span>Trạng thái rule</span><select value={rule.active?"active":"inactive"} onChange={e=>updateSegmentRule(index,{active:e.target.value==="active"})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </div>
            <label><span>Cấu hình mở rộng (JSON object)</span><textarea aria-label={"Cấu hình mở rộng rule "+(index+1)} rows={3} value={configDrafts[index]||"{}"} onChange={e=>setConfigDrafts(prev=>prev.map((value,i)=>i===index?e.target.value:value))}/></label>
            <button className="rowAction dangerBtn" onClick={()=>{setSegmentation({...segmentation,rules:segmentation.rules.filter((_,i)=>i!==index)});setConfigDrafts(prev=>prev.filter((_,i)=>i!==index));setSegmentDrafts(prev=>prev.filter((_,i)=>i!==index))}}>Bỏ rule</button>
          </fieldset>)}
          <datalist id="segmentRuleTypes"><option value="US_ZIP_REGION"/><option value="ZIP_US"/></datalist>
          <button className="textBtn" disabled={busy} onClick={()=>{setSegmentation({...segmentation,rules:[...segmentation.rules,{rule_type:"US_ZIP_REGION",segments:["EAST","WEST"],priority:0,active:false,config:{}}]});setConfigDrafts(prev=>[...prev,"{}"]);setSegmentDrafts(prev=>[...prev,"EAST, WEST"])}}>＋ Thêm rule</button>
        </>}
      </div>
      </section>
    </>}
    {selected&&<section hidden={routeTab!=="templates"} className="templateConfigCard">
      <div className="configHead"><div><b>Template xuất file</b><span>Purchase = file mua label/đơn. Manifest = file khai báo sau khi đã có Tracking.</span></div></div>
      <div className="templateKindTabs"><button className={templateKind==="PURCHASE"?"active":""} aria-pressed={templateKind==="PURCHASE"} onClick={()=>chooseTemplateKind("PURCHASE")}>Purchase Template</button><button className={templateKind==="MANIFEST"?"active":""} aria-pressed={templateKind==="MANIFEST"} onClick={()=>chooseTemplateKind("MANIFEST")}>Manifest Template</button></div>
      <details className="routeVariablesEditor settingsDisclosure"><summary>Biến cố định cho template</summary><fieldset className="routeConfigFields" disabled={busy||selected.config_locked}>
        <div className="routeVariablesHead"><div><b>Giá trị dùng chung</b><span>Dữ liệu cố định của cấu hình này. Dùng trong Excel bằng <code>{"{{route.service_code}}"}</code>, <code>{"{{route.sender_address}}"}</code>…</span></div><button className="secondaryBtn" disabled={busy||selected.config_locked} onClick={()=>void saveRouteVariables()}>Lưu biến cố định</button></div>
        {selected.config_locked&&<p role="note">Cấu hình đã có đơn và được giữ để bảo toàn lịch sử. Tạo cấu hình mới nếu cần thay đổi biến cố định.</p>}{routeVariables.map((row,index)=><div className="routeVariableRow" key={index}>
          <input aria-label={"Tên biến "+(index+1)} placeholder="Key, ví dụ service_code" value={row.key} onChange={e=>setRouteVariables(prev=>prev.map((item,i)=>i===index?{...item,key:e.target.value}:item))}/>
          <input aria-label={"Giá trị biến "+(index+1)} placeholder="Giá trị cố định" value={row.value} onChange={e=>setRouteVariables(prev=>prev.map((item,i)=>i===index?{...item,value:e.target.value}:item))}/>
          <code>{row.key.trim()?"{{route."+row.key.trim().toLowerCase()+"}}":"{{route.key}}"}</code>
          <button className="rowAction dangerBtn" onClick={()=>setRouteVariables(prev=>prev.filter((_,i)=>i!==index))}>Bỏ</button>
        </div>)}
        <button className="textBtn" onClick={()=>setRouteVariables(prev=>[...prev,{key:"",value:""}])}>＋ Thêm biến cố định</button>
      </fieldset></details>
      <div className="templateGrid templateFileGrid">
        <label><span>Tên Template</span><input value={template.name} onChange={e=>setTemplate({...template,name:e.target.value})}/></label>
        <label><span>Cách chia file</span><select value={template.output_mode} onChange={e=>setTemplate({...template,output_mode:e.target.value})}><option value="MULTI_ORDER">Multiple Orders · 1 Carton / Order</option>{template.output_mode==="PER_ORDER"&&<option value="PER_ORDER" disabled>Per Order (legacy)</option>}<option value="PER_LOT">Per Lot · Multi-Carton Order</option></select></label>
        <small>{template.output_mode==="MULTI_ORDER"?"1 Record = 1 Order = 1 Carton":"1 Order = x Inv-PKL = x Lot"}</small>
        <label className="file"><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/><span>{file?.name||"Chọn workbook .xlsx"}</span></label>
      </div>
      <details className="repeatEditor settingsDisclosure" open><summary>Dòng lặp trong template</summary><div><b>Ánh xạ dữ liệu</b><span>Mỗi dòng mẫu trong file tương ứng với dữ liệu nào. Bỏ trống Sheet nếu template chỉ thay các ô cố định.</span></div>
        {sections.map((row,index)=><div className="repeatRow" key={index}>
          <input aria-label={"Sheet dòng lặp "+(index+1)} placeholder="Tên Sheet chính xác" value={row.sheet} onChange={e=>setSections(prev=>prev.map((item,i)=>i===index?{...item,sheet:e.target.value}:item))}/>
          <input aria-label={"Số dòng lặp "+(index+1)} type="number" min="1" placeholder="Dòng" value={row.row} onChange={e=>setSections(prev=>prev.map((item,i)=>i===index?{...item,row:e.target.value}:item))}/>
          <select aria-label={"Dữ liệu dòng lặp "+(index+1)} value={row.scope} onChange={e=>setSections(prev=>prev.map((item,i)=>i===index?{...item,scope:e.target.value as RepeatDraft["scope"]}:item))}><option value="ORDER">Một Order</option><option value="LOT">Một Lot</option><option value="CARTON">Một Carton</option><option value="CARTON_ITEM">Một sản phẩm trong Carton</option></select>
          <button className="rowAction dangerBtn" onClick={()=>setSections(prev=>prev.filter((_,i)=>i!==index))}>Bỏ</button>
        </div>)}
        <button className="textBtn" onClick={()=>setSections(prev=>[...prev,{sheet:"",row:"2",scope:"CARTON_ITEM"}])}>＋ Thêm dòng lặp</button>
      </details>
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
    {lifecycleReview&&<ConfirmationDialog title={lifecycleReview.action==="DELETE"?"Xóa cấu hình dịch vụ":"Lưu trữ dịch vụ"} busy={busy} onClose={()=>setLifecycleReview(null)}>
      <p><b>{lifecycleReview.route.service}{lifecycleReview.route.sub_service?" - "+lifecycleReview.route.sub_service:""}</b> · Supplier {lifecycleReview.route.supplier}</p>
      <p>{lifecycleReview.route.missing_cost_orders||0} đơn chưa có True Net Cost · {lifecycleReview.route.open_claims||0} Claim đang mở.</p>
      <p>{lifecycleReview.action==="DELETE"?"Chỉ xóa cấu hình chưa có đơn hoặc tham chiếu nghiệp vụ. Thao tác này không thể hoàn tác.":"Dịch vụ ngừng nhận đơn mới. Lịch sử đơn, đối soát chi phí và Claim vẫn được giữ."}</p>
      {lifecycleError&&<p role="alert" className="inlineMsg error">{lifecycleError}</p>}
      <div className="confirmationActions"><button className="secondaryBtn" disabled={busy} onClick={()=>setLifecycleReview(null)}>Đóng</button><button className="primaryBtn" disabled={busy} onClick={()=>void changeLifecycle(lifecycleReview.action,true)}>{lifecycleReview.action==="DELETE"?"Xác nhận xóa":"Xác nhận lưu trữ"}</button></div>
    </ConfirmationDialog>}
    {message&&<div role="status" className={message.startsWith("Lỗi")?"enumMessage error":"enumMessage"}>{message}</div>}
  </div>;
}
