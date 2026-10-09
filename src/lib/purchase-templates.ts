import {resolveRoute} from "./routes";
import { orderQuote,assertConfiguredPurchase } from "./route-pricing";
import ExcelJS from "exceljs";
import { db } from "./db";
import { validatePurchaseReadiness } from "./order-shipments";

export const REPEAT_SCOPES=["ORDER","LOT","CARTON","CARTON_ITEM"] as const;
export type RepeatScope=typeof REPEAT_SCOPES[number];
export type RepeatSection={sheet:string;row:number;scope:RepeatScope};

export const PURCHASE_PLACEHOLDERS=[
  "recipient_name","address_1","address_2","city","state","postal_code","country","phone","recipient_email","recipient_address",
  "item_description","sku","quantity","material","unit_manufacturing_value","line_manufacturing_value",
  "weight","weight_g","length","width","height","volume","chargeable_weight","carton_count","carton_slot","row.index",
  "lot_count","lot_number","client_order_id","dmd_order_id","client","service","sub_service","supplier",
  "tracking","label_url","order_total_manufacturing_value","lot_total_manufacturing_value","carton_total_manufacturing_value",
  "order.recipient_name","order.address_1","order.address_2","order.city","order.state","order.postal_code",
  "order.country","order.phone","order.recipient_email","order.recipient_address","order.client_order_id","order.dmd_order_id","order.client","order.service",
  "order.sub_service","order.supplier","order.carton_count","order.lot_count","order.total_manufacturing_value",
  "lot.number","lot.net_cost","lot.total_manufacturing_value",
  "carton.number","carton.weight","carton.weight_g","carton.length","carton.width","carton.height","carton.volume",
  "carton.chargeable_weight","carton.tracking","carton.label_url","carton.total_manufacturing_value",
  "item.sku","item.description","item.quantity","item.material","item.unit_manufacturing_value","item.total_manufacturing_value",
] as const;

const TOKEN=/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
const text=(value:unknown)=>String(value??"").trim();
const safeName=(value:string)=>value.replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"-").slice(0,100)||"Purchase";

type DataRow=Record<string,unknown>;
type ExportContext={order:DataRow;lot?:DataRow;carton?:DataRow;item?:DataRow;row?:DataRow};
type RouteVariables=Record<string,string>;

export async function scanPurchaseWorkbook(buffer:Buffer){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const placeholders:Array<{sheet:string;cell:string;token:string}>=[];
  const unknown:Array<{sheet:string;cell:string;token:string}>=[];
  const known=new Set<string>(PURCHASE_PLACEHOLDERS as readonly string[]);
  workbook.eachSheet(sheet=>{
    sheet.eachRow({includeEmpty:true},row=>{
      row.eachCell({includeEmpty:true},cell=>{
        const raw=typeof cell.value==="string"?cell.value:"";
        for(const match of raw.matchAll(TOKEN)){
          const entry={sheet:sheet.name,cell:cell.address,token:match[1]};
          placeholders.push(entry);
          if(!known.has(match[1])&&!/^route\.[a-z][a-z0-9_]*$/.test(match[1]))unknown.push(entry);
        }
      });
    });
  });
  return {placeholders,unknown,sheets:workbook.worksheets.map(sheet=>sheet.name)};
}

export function missingRoutePlaceholders(placeholders:Array<{token:string}>,routeVariables:Record<string,string>){
  return [...new Set(placeholders.filter(row=>row.token.startsWith("route.")&&!text(routeVariables[row.token.slice(6)])).map(row=>row.token))];
}

export function validateRepeatSections(raw:unknown,sheets:string[]):RepeatSection[]{
  const rows=Array.isArray(raw)?raw:[];
  return rows.map((value,index)=>{
    const row=value as Record<string,unknown>;
    const sheet=text(row.sheet);
    const line=Math.trunc(Number(row.row||0));
    const scope=String(row.scope||"").toUpperCase() as RepeatScope;
    if(!sheet||!sheets.includes(sheet))throw new Error("Repeat section "+(index+1)+" chọn sheet không tồn tại.");
    if(line<1)throw new Error("Repeat section "+(index+1)+" cần số dòng hợp lệ.");
    if(!REPEAT_SCOPES.includes(scope))throw new Error("Repeat section "+(index+1)+" có kiểu dữ liệu không hợp lệ.");
    return {sheet,row:line,scope};
  });
}

function exportData(orderId:number):{order:DataRow;lots:DataRow[];cartons:DataRow[];items:DataRow[]}{
  const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as DataRow|undefined;
  if(!order)throw new Error("Order không tồn tại.");
  const lots=db.prepare("SELECT * FROM order_lots WHERE order_id=? ORDER BY lot_number").all(orderId) as DataRow[];
  const cartons=db.prepare(
    "SELECT c.*,l.lot_number,ot.tracking,ot.label_url FROM order_cartons c "+
    "LEFT JOIN order_lots l ON l.id=c.order_lot_id "+
    "LEFT JOIN order_trackings ot ON ot.carton_id=c.id AND ot.status='ACTIVE' "+
    "WHERE c.order_id=? GROUP BY c.id ORDER BY c.carton_number"
  ).all(orderId) as DataRow[];
  const items=db.prepare(
    "SELECT ci.*,oi.sku,oi.description,oi.material,oi.unit_manufacturing_value,oi.currency,c.order_lot_id,c.carton_number "+
    "FROM carton_items ci JOIN order_items oi ON oi.id=ci.order_item_id "+
    "JOIN order_cartons c ON c.id=ci.carton_id WHERE c.order_id=? ORDER BY c.carton_number,ci.id"
  ).all(orderId) as DataRow[];
  const lineValue=(item:DataRow)=>Number(item.quantity||0)*Number(item.unit_manufacturing_value||0);
  const cartonValue=(cartonId:unknown)=>items.filter(item=>Number(item.carton_id)===Number(cartonId)).reduce((sum,item)=>sum+lineValue(item),0);
  const lotValue=(lotId:unknown)=>cartons.filter(carton=>Number(carton.order_lot_id)===Number(lotId)).reduce((sum,carton)=>sum+cartonValue(carton.id),0);
  const orderValue=lots.reduce((sum,lot)=>sum+lotValue(lot.id),0);
  return {
    order:{...order,total_manufacturing_value:orderValue} as DataRow,
    lots:lots.map(lot=>({...lot,total_manufacturing_value:lotValue(lot.id)} as DataRow)),
    cartons:cartons.map(carton=>({...carton,total_manufacturing_value:cartonValue(carton.id)} as DataRow)),
    items:items.map(item=>({...item,total_manufacturing_value:lineValue(item)} as DataRow)),
  };
}

function contextsFor(orderIds:number[],scope:RepeatScope,lotId?:number,cartonIds?:number[]){
  const contexts:ExportContext[]=[];
  for(const orderId of orderIds){
    const data=exportData(orderId);
    if(cartonIds){data.cartons=data.cartons.filter(row=>cartonIds.includes(Number(row.id)));data.items=data.items.filter(row=>cartonIds.includes(Number(row.carton_id)));data.lots=data.lots.filter(row=>data.cartons.some(c=>Number(c.order_lot_id)===Number(row.id)))}
    const lots=lotId?data.lots.filter(row=>Number(row.id)===lotId):data.lots;
    const lotIds=new Set(lots.map(row=>Number(row.id)));
    if(scope==="ORDER"){contexts.push({order:data.order});continue}
    if(scope==="LOT"){for(const lot of lots)contexts.push({order:data.order,lot});continue}
    if(scope==="CARTON"){
      for(const carton of data.cartons.filter(row=>!lotId||lotIds.has(Number(row.order_lot_id)))){
        const lot=data.lots.find(row=>Number(row.id)===Number(carton.order_lot_id));
        const item=data.items.find(row=>Number(row.carton_id)===Number(carton.id))||{
          description:data.order.item,material:data.order.material,quantity:1,
          unit_manufacturing_value:data.order.declared_value,
        };
        contexts.push({order:data.order,lot,carton,item});
      }
      continue;
    }
    for(const item of data.items.filter(row=>!lotId||lotIds.has(Number(row.order_lot_id)))){
      const carton=data.cartons.find(row=>Number(row.id)===Number(item.carton_id));
      const lot=data.lots.find(row=>Number(row.id)===Number(carton?.order_lot_id));
      contexts.push({order:data.order,lot,carton,item});
    }
  }
  return contexts.map((context,index)=>({...context,row:{index:index+1}}));
}

function valueFor(token:string,context:ExportContext,routeVariables:RouteVariables={}):unknown{
  const {order,lot,carton,item,row}=context;
  const weight=Number(carton?.weight||order.weight||0);
  const recipientAddress=[order.address1,order.address2].map(text).filter(Boolean).join(" ");
  const aliases:Record<string,unknown>={
    recipient_name:order.recipient_name,address_1:order.address1,address_2:order.address2,city:order.city,state:order.state,
    postal_code:order.zip,country:order.country,phone:order.phone,recipient_email:order.recipient_email,recipient_address:recipientAddress,
    item_description:item?.description||order.item,sku:item?.sku,quantity:Number(item?.quantity||0)||1,material:item?.material||order.material,
    unit_manufacturing_value:item?.unit_manufacturing_value??order.declared_value,line_manufacturing_value:item?.total_manufacturing_value??order.declared_value,
    weight,weight_g:weight*1000,length:carton?.length||order.length,
    width:carton?.width||order.width,height:carton?.height||order.height,volume:carton?.volume||order.volume,
    chargeable_weight:carton?.chargeable_weight||order.chargeable_weight,carton_count:order.carton_count,
    carton_slot:carton?.carton_number,lot_count:order.expected_lot_count,lot_number:lot?.lot_number,
    client_order_id:order.order_id,dmd_order_id:order.system_order_code,client:order.customer,service:order.service,
    sub_service:order.sub_service,supplier:order.supplier,tracking:carton?.tracking||order.tracking,label_url:carton?.label_url||order.label,
    order_total_manufacturing_value:order.total_manufacturing_value,lot_total_manufacturing_value:lot?.total_manufacturing_value,
    carton_total_manufacturing_value:carton?.total_manufacturing_value,
  };
  if(token in aliases)return aliases[token]??"";
  if(token.startsWith("route."))return routeVariables[token.slice(6)]??"";
  const namespaced:Record<string,DataRow|undefined>={order,lot,carton,item,row};
  const [root,...path]=token.split(".");
  const source=namespaced[root];
  if(!source)return "";
  const key=path.join(".");
  const keyMap:Record<string,string>={
    address_1:"address1",address_2:"address2",postal_code:"zip",client_order_id:"order_id",dmd_order_id:"system_order_code",
    client:"customer",lot_count:"expected_lot_count",number:root==="lot"?"lot_number":"carton_number",
    description:"description",quantity:"quantity",total_manufacturing_value:"total_manufacturing_value",recipient_email:"recipient_email",
  };
  if(root==="order"&&key==="recipient_address")return recipientAddress;
  if(root==="carton"&&key==="weight_g")return Number(carton?.weight||order.weight||0)*1000;
  if(root==="item"&&key==="quantity")return Number(item?.quantity||0)||1;
  if(root==="item"&&key==="unit_manufacturing_value")return item?.unit_manufacturing_value??order.declared_value??"";
  return source[keyMap[key]||key]??"";
}

function fillCell(cell:ExcelJS.Cell,context:ExportContext,routeVariables:RouteVariables={}){
  if(typeof cell.value!=="string")return;
  const original=cell.value;
  const matches=[...original.matchAll(TOKEN)];
  if(!matches.length)return;
  if(matches.length===1&&matches[0][0]===original){
    const value=valueFor(matches[0][1],context,routeVariables);
    cell.value=typeof value==="number"&&Number.isFinite(value)?value:text(value);
    return;
  }
  cell.value=original.replace(TOKEN,(_,token)=>text(valueFor(token,context,routeVariables)));
}

async function renderWorkbook(input:{storedPath:string;repeatSections:RepeatSection[];orderIds:number[];lotId?:number;cartonIds?:number[];routeVariables?:RouteVariables}){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input.storedPath);
  // ExcelJS drops defined names whose range is #REF!, but retains validations
  // pointing to those names. That creates dangling formula1 references in Excel.
  const names=new Set(workbook.definedNames.model.filter(n=>n.ranges.length&&n.ranges.every(r=>!r.includes("#REF!"))).map(n=>n.name));
  workbook.eachSheet(sheet=>{
    const validations=(sheet as unknown as {dataValidations:{model:Record<string,{formulae?:unknown[]}>}}).dataValidations.model;
    for(const [range,rule] of Object.entries(validations)){
      if(rule.formulae?.some(raw=>{
        const formula=String(raw).replace(/^=/,"").trim();
        return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(formula)&&!/^\$?[A-Za-z]{1,3}\$?[1-9][0-9]*$/.test(formula)&&!names.has(formula);
      }))delete validations[range];
    }
  });

  const occupied=new Map<string,Array<[number,number]>>();
  const sections=[...input.repeatSections].sort((a,b)=>a.sheet.localeCompare(b.sheet)||b.row-a.row);
  for(const section of sections){
    const worksheet=workbook.getWorksheet(section.sheet);
    if(!worksheet)throw new Error("Không tìm thấy sheet "+section.sheet+".");
    const contexts=contextsFor(input.orderIds,section.scope,input.lotId,input.cartonIds);
    if(!contexts.length)throw new Error("Không có dữ liệu cho repeat section "+section.sheet+"!"+section.row+".");
    if(contexts.length>1)worksheet.duplicateRow(section.row,contexts.length-1,true);
    contexts.forEach((context,index)=>worksheet.getRow(section.row+index).eachCell({includeEmpty:true},cell=>fillCell(cell,context,input.routeVariables)));
    const ranges=occupied.get(section.sheet)||[];
    ranges.push([section.row,section.row+contexts.length-1]);occupied.set(section.sheet,ranges);
  }
  const base=(input.cartonIds?contextsFor(input.orderIds,"CARTON",input.lotId,input.cartonIds)[0]:undefined)||contextsFor(input.orderIds,input.lotId?"LOT":"ORDER",input.lotId)[0]||contextsFor(input.orderIds,"ORDER")[0];
  workbook.eachSheet(sheet=>{
    const ranges=occupied.get(sheet.name)||[];
    sheet.eachRow({includeEmpty:true},row=>{
      if(ranges.some(([from,to])=>row.number>=from&&row.number<=to))return;
      row.eachCell({includeEmpty:true},cell=>fillCell(cell,base,input.routeVariables));
    });
  });
  const result=await workbook.xlsx.writeBuffer();
  return Buffer.from(result);
}

type TemplateRecord={
  template_id:number;template_name:string;output_mode:"MULTI_ORDER"|"PER_ORDER"|"PER_LOT";repeat_sections_json:string;
  active_version_id:number;version_number:number;stored_path:string;service:string;sub_service:string;supplier:string;route_variables_json:string;template_kind:"PURCHASE"|"MANIFEST";
};

export function resolveRouteTemplate(order:DataRow,kind:"PURCHASE"|"MANIFEST"="PURCHASE"){
  return db.prepare(
    "SELECT pt.id template_id,pt.name template_name,pt.template_kind,pt.output_mode,pt.repeat_sections_json,pv.id active_version_id,pv.version_number,pv.stored_path,rc.service,rc.sub_service,rc.supplier,rc.route_variables_json "+
    "FROM service_route_configs rc JOIN purchase_templates pt ON pt.route_config_id=rc.id AND pt.active=1 AND pt.template_kind=? "+
    "JOIN purchase_template_versions pv ON pv.template_id=pt.id AND pv.status='ACTIVE' "+
    "WHERE rc.id=? LIMIT 1"
  ).get(kind,resolveRoute(order).id) as TemplateRecord|undefined;
}

export function resolvePurchaseTemplate(order:DataRow){return resolveRouteTemplate(order,"PURCHASE")}
export function resolveManifestTemplate(order:DataRow){return resolveRouteTemplate(order,"MANIFEST")}

export async function generatePreview(versionId:number,orderId:number){
  const row=db.prepare(
    "SELECT pt.id template_id,pt.name template_name,pt.template_kind,pt.output_mode,pt.repeat_sections_json,pv.id active_version_id,pv.version_number,pv.stored_path,rc.service,rc.sub_service,rc.supplier,rc.route_variables_json "+
    "FROM purchase_template_versions pv JOIN purchase_templates pt ON pt.id=pv.template_id JOIN service_route_configs rc ON rc.id=pt.route_config_id WHERE pv.id=?"
  ).get(versionId) as TemplateRecord|undefined;
  if(!row)throw new Error("Không tìm thấy version template.");
  const sections=JSON.parse(row.repeat_sections_json||"[]") as RepeatSection[];
  const data=exportData(orderId);
  const lotId=row.output_mode==="PER_LOT"?Number(data.lots[0]?.id||0)||undefined:undefined;
  const routeVariables=JSON.parse(row.route_variables_json||"{}") as RouteVariables;
  return {buffer:await renderWorkbook({storedPath:row.stored_path,repeatSections:sections,orderIds:[orderId],lotId,routeVariables}),filename:"PREVIEW_"+safeName(text(data.order.system_order_code||orderId))+".xlsx"};
}

export function validateManifestReadiness(orderId:number){
  const base=validatePurchaseReadiness(orderId);if(!base.ready)return base;
  const cartons=db.prepare("SELECT id,carton_number FROM order_cartons WHERE order_id=? ORDER BY carton_number").all(orderId) as Array<{id:number;carton_number:number}>;
  const missing=cartons.filter(carton=>!db.prepare("SELECT id FROM order_trackings WHERE order_id=? AND carton_id=? AND status='ACTIVE' LIMIT 1").get(orderId,carton.id));
  return missing.length?{ready:false,issues:missing.map(carton=>({message:"Carton "+carton.carton_number+" chưa có Tracking"}))}:{ready:true,issues:[]};
}

async function generateRouteFiles(orderIds:number[],kind:"PURCHASE"|"MANIFEST"){
  const missing:Array<{order_id:number;dmd_id:string;reason:string}>=[];
  const groups=new Map<number,{template:TemplateRecord;orderIds:number[]}>();
  for(const orderId of [...new Set(orderIds)]){
    const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as DataRow|undefined;
    if(!order){missing.push({order_id:orderId,dmd_id:String(orderId),reason:"Order không tồn tại"});continue}
    if(kind==="PURCHASE"){try{assertConfiguredPurchase(order)}catch(e){missing.push({order_id:orderId,dmd_id:text(order.system_order_code),reason:(e as Error).message});continue;}}
    const price=orderQuote(order);
    if(kind==="PURCHASE"&&price&&!price.eligible){missing.push({order_id:orderId,dmd_id:text(order.system_order_code),reason:price.reasons.join(" ")});continue}
    const readiness=kind==="MANIFEST"?validateManifestReadiness(orderId):validatePurchaseReadiness(orderId);
    if(!readiness.ready){missing.push({order_id:orderId,dmd_id:text(order.system_order_code),reason:readiness.issues.map(row=>row.message).join(" ")});continue}
    const template=resolveRouteTemplate(order,kind);
    if(!template){missing.push({order_id:orderId,dmd_id:text(order.system_order_code),reason:kind==="MANIFEST"?"Chưa có Manifest Template":"Chưa có Purchase Template"});continue}
    const group=groups.get(template.template_id)||{template,orderIds:[]};group.orderIds.push(orderId);groups.set(template.template_id,group);
  }
  const files:Array<{name:string;buffer:Buffer;service:string}>=[];
  for(const group of groups.values()){
    const sections=JSON.parse(group.template.repeat_sections_json||"[]") as RepeatSection[];
    const routeVariables=JSON.parse(group.template.route_variables_json||"{}") as RouteVariables;
    const prefix=kind==="MANIFEST"?"Manifest":"Purchase";
    if(group.template.output_mode==="MULTI_ORDER"){
      files.push({name:safeName(prefix+"_"+group.template.service+"_"+group.template.sub_service+"_"+group.template.supplier+"_"+group.orderIds.length+"-orders")+".xlsx",buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:sections,orderIds:group.orderIds,routeVariables}),service:group.template.service});
    }else if(group.template.output_mode==="PER_ORDER"){
      for(const orderId of group.orderIds){
        const order=db.prepare("SELECT system_order_code FROM orders WHERE id=?").get(orderId) as {system_order_code:string};
        files.push({name:safeName(prefix+"_"+group.template.service+"_"+order.system_order_code)+".xlsx",buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:sections,orderIds:[orderId],routeVariables}),service:group.template.service});
      }
    }else{
      for(const orderId of group.orderIds){
        const data=exportData(orderId);
        for(const lot of data.lots){
          files.push({name:safeName(prefix+"_"+group.template.service+"_"+text(data.order.system_order_code)+"_Lot-"+text(lot.lot_number))+".xlsx",buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:sections,orderIds:[orderId],lotId:Number(lot.id),routeVariables}),service:group.template.service});
        }
      }
    }
  }
  return {files,missing,valid_order_count:[...groups.values()].reduce((sum,group)=>sum+group.orderIds.length,0)};
}

export async function generatePurchaseFiles(orderIds:number[]){return generateRouteFiles(orderIds,"PURCHASE")}
export async function generateManifestFiles(orderIds:number[]){return generateRouteFiles(orderIds,"MANIFEST")}

export function genericPurchaseRows(orderIds:number[]){
  const rows:Array<Record<string,unknown>>=[];
  for(const orderId of [...new Set(orderIds)]){
    const data=exportData(orderId);
    assertConfiguredPurchase(data.order);
    for(const carton of data.cartons){
      const cartonItems=data.items.filter(item=>Number(item.carton_id)===Number(carton.id));
      if(!cartonItems.length)cartonItems.push({description:data.order.item,material:data.order.material,quantity:1,unit_manufacturing_value:data.order.declared_value,total_manufacturing_value:data.order.declared_value});
      for(const item of cartonItems)rows.push({
        dmd_id:data.order.system_order_code,client_order_id:data.order.order_id,client:data.order.customer,
        recipient_name:data.order.recipient_name,address_1:data.order.address1,address_2:data.order.address2,city:data.order.city,
        state:data.order.state,postal_code:data.order.zip,country:data.order.country,phone:data.order.phone,recipient_email:data.order.recipient_email,
        lot_number:carton.lot_number,carton_count:data.order.carton_count,carton_slot:carton.carton_number,
        sku:item.sku,item:item.description,quantity:item.quantity,material:item.material,
        unit_manufacturing_value:item.unit_manufacturing_value,line_manufacturing_value:item.total_manufacturing_value,
        order_total_manufacturing_value:data.order.total_manufacturing_value,lot_total_manufacturing_value:data.lots.find(lot=>Number(lot.id)===Number(carton.order_lot_id))?.total_manufacturing_value,
        weight:carton.weight,length:carton.length,width:carton.width,height:carton.height,volume:carton.volume,chargeable_weight:carton.chargeable_weight,
        service:data.order.service,sub_service:data.order.sub_service,supplier:data.order.supplier,expected_lot_count:data.order.expected_lot_count,
        tracking:carton.tracking,label_url:carton.label_url,
      });
    }
  }
  return rows;
}

export function lookupManifestTracking(tracking:string){
  const key=tracking.replace(/[\s-]+/g,"").toUpperCase();
  const row=db.prepare("SELECT ot.id tracking_id,ot.tracking,ot.status,ot.carton_id,o.id order_pk,o.system_order_code,o.order_id,o.customer,o.recipient_name,o.route_id,o.service,o.sub_service,o.supplier,o.workflow_status FROM order_trackings ot JOIN orders o ON o.id=ot.order_id WHERE ot.normalized_tracking=?").get(key) as DataRow|undefined;
  if(!row)throw new Error("Tracking không tồn tại: "+tracking);
  if(row.status!=="ACTIVE"||row.workflow_status==="CANCELLED")throw new Error("Tracking không còn active: "+tracking);
  if(!row.carton_id||!db.prepare("SELECT id FROM order_cartons WHERE id=? AND order_id=?").get(row.carton_id,row.order_pk))throw new Error("Tracking chưa gắn đúng carton: "+tracking);
  return row;
}

export async function generateScannedManifestFiles(trackings:string[]){
  if(!trackings.length||trackings.length>1000)throw new Error("Scan từ 1 đến 1000 tracking.");
  const rows=trackings.map(lookupManifestTracking);
  if(new Set(rows.map(r=>r.tracking_id)).size!==rows.length)throw new Error("Tracking bị trùng.");
  if(new Set(rows.map(r=>r.carton_id)).size!==rows.length)throw new Error("Mỗi carton chỉ được xuất một lần.");
  const groups=new Map<string,{template:TemplateRecord;orderIds:number[];cartonIds:number[];lotId?:number}>();
  for(const row of rows){
    const template=resolveManifestTemplate(row);
    if(!template)throw new Error("Chưa có Manifest Template cho "+row.service+" / "+row.sub_service+" / "+row.supplier);
    const sections=JSON.parse(template.repeat_sections_json||"[]") as RepeatSection[];
    if(!sections.length||sections.some(s=>s.scope!=="CARTON"&&s.scope!=="CARTON_ITEM"))throw new Error("Manifest scan cần template lặp theo Carton hoặc Carton Item.");
    const lot=db.prepare("SELECT order_lot_id FROM order_cartons WHERE id=?").get(row.carton_id) as {order_lot_id:number};
    const key=String(template.template_id)+(template.output_mode!=="MULTI_ORDER"?":"+row.order_pk:"")+(template.output_mode==="PER_LOT"?":"+lot.order_lot_id:"");
    const group=groups.get(key)||{template,orderIds:[],cartonIds:[],lotId:template.output_mode==="PER_LOT"?lot.order_lot_id:undefined};
    group.orderIds=[...new Set([...group.orderIds,Number(row.order_pk)])];group.cartonIds.push(Number(row.carton_id));groups.set(key,group);
  }
  const files=[];
  for(const [key,group] of groups){files.push({name:safeName("Manifest_"+group.template.service+"_"+group.template.sub_service+"_"+group.template.supplier+"_"+key)+".xlsx",service:group.template.service,buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:JSON.parse(group.template.repeat_sections_json),orderIds:group.orderIds,cartonIds:group.cartonIds,lotId:group.lotId,routeVariables:JSON.parse(group.template.route_variables_json||"{}")})})}
  for(const row of rows){const active=lookupManifestTracking(String(row.tracking));if(active.tracking_id!==row.tracking_id||active.carton_id!==row.carton_id)throw new Error("Tracking đã thay đổi; hãy scan lại.")}
  return {files,missing:[],valid_order_count:new Set(rows.map(r=>r.order_pk)).size};
}
