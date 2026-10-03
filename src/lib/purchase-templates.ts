import ExcelJS from "exceljs";
import { db } from "./db";
import { validatePurchaseReadiness } from "./order-shipments";

export const REPEAT_SCOPES=["ORDER","LOT","CARTON","CARTON_ITEM"] as const;
export type RepeatScope=typeof REPEAT_SCOPES[number];
export type RepeatSection={sheet:string;row:number;scope:RepeatScope};

export const PURCHASE_PLACEHOLDERS=[
  "recipient_name","address_1","address_2","city","state","postal_code","country","phone",
  "item_description","sku","quantity","material","unit_manufacturing_value","line_manufacturing_value",
  "weight","length","width","height","volume","chargeable_weight","carton_count","carton_slot",
  "lot_count","lot_number","client_order_id","dmd_order_id","client","service","sub_service","supplier",
  "tracking","label_url","order_total_manufacturing_value","lot_total_manufacturing_value","carton_total_manufacturing_value",
  "order.recipient_name","order.address_1","order.address_2","order.city","order.state","order.postal_code",
  "order.country","order.phone","order.client_order_id","order.dmd_order_id","order.client","order.service",
  "order.sub_service","order.supplier","order.carton_count","order.lot_count","order.total_manufacturing_value",
  "lot.number","lot.net_cost","lot.total_manufacturing_value",
  "carton.number","carton.weight","carton.length","carton.width","carton.height","carton.volume",
  "carton.chargeable_weight","carton.tracking","carton.label_url","carton.total_manufacturing_value",
  "item.sku","item.description","item.quantity","item.material","item.unit_manufacturing_value","item.total_manufacturing_value",
] as const;

const TOKEN=/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;
const text=(value:unknown)=>String(value??"").trim();
const safeName=(value:string)=>value.replace(/[\\/:*?"<>|]+/g,"-").replace(/\s+/g,"-").slice(0,100)||"Purchase";

type DataRow=Record<string,unknown>;
type ExportContext={order:DataRow;lot?:DataRow;carton?:DataRow;item?:DataRow};

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
          if(!known.has(match[1]))unknown.push(entry);
        }
      });
    });
  });
  return {placeholders,unknown,sheets:workbook.worksheets.map(sheet=>sheet.name)};
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

function contextsFor(orderIds:number[],scope:RepeatScope,lotId?:number){
  const contexts:ExportContext[]=[];
  for(const orderId of orderIds){
    const data=exportData(orderId);
    const lots=lotId?data.lots.filter(row=>Number(row.id)===lotId):data.lots;
    const lotIds=new Set(lots.map(row=>Number(row.id)));
    if(scope==="ORDER"){contexts.push({order:data.order});continue}
    if(scope==="LOT"){for(const lot of lots)contexts.push({order:data.order,lot});continue}
    if(scope==="CARTON"){
      for(const carton of data.cartons.filter(row=>!lotId||lotIds.has(Number(row.order_lot_id)))){
        const lot=data.lots.find(row=>Number(row.id)===Number(carton.order_lot_id));
        contexts.push({order:data.order,lot,carton});
      }
      continue;
    }
    for(const item of data.items.filter(row=>!lotId||lotIds.has(Number(row.order_lot_id)))){
      const carton=data.cartons.find(row=>Number(row.id)===Number(item.carton_id));
      const lot=data.lots.find(row=>Number(row.id)===Number(carton?.order_lot_id));
      contexts.push({order:data.order,lot,carton,item});
    }
  }
  return contexts;
}

function valueFor(token:string,context:ExportContext):unknown{
  const {order,lot,carton,item}=context;
  const aliases:Record<string,unknown>={
    recipient_name:order.recipient_name,address_1:order.address1,address_2:order.address2,city:order.city,state:order.state,
    postal_code:order.zip,country:order.country,phone:order.phone,item_description:item?.description||order.item,sku:item?.sku,
    quantity:item?.quantity,material:item?.material||order.material,unit_manufacturing_value:item?.unit_manufacturing_value,
    line_manufacturing_value:item?.total_manufacturing_value,weight:carton?.weight||order.weight,length:carton?.length||order.length,
    width:carton?.width||order.width,height:carton?.height||order.height,volume:carton?.volume||order.volume,
    chargeable_weight:carton?.chargeable_weight||order.chargeable_weight,carton_count:order.carton_count,
    carton_slot:carton?.carton_number,lot_count:order.expected_lot_count,lot_number:lot?.lot_number,
    client_order_id:order.order_id,dmd_order_id:order.system_order_code,client:order.customer,service:order.service,
    sub_service:order.sub_service,supplier:order.supplier,tracking:carton?.tracking||order.tracking,label_url:carton?.label_url||order.label,
    order_total_manufacturing_value:order.total_manufacturing_value,lot_total_manufacturing_value:lot?.total_manufacturing_value,
    carton_total_manufacturing_value:carton?.total_manufacturing_value,
  };
  if(token in aliases)return aliases[token]??"";
  const namespaced:Record<string,DataRow|undefined>={order,lot,carton,item};
  const [root,...path]=token.split(".");
  const source=namespaced[root];
  if(!source)return "";
  const key=path.join(".");
  const keyMap:Record<string,string>={
    address_1:"address1",address_2:"address2",postal_code:"zip",client_order_id:"order_id",dmd_order_id:"system_order_code",
    client:"customer",lot_count:"expected_lot_count",number:root==="lot"?"lot_number":"carton_number",
    description:"description",quantity:"quantity",total_manufacturing_value:"total_manufacturing_value",
  };
  return source[keyMap[key]||key]??"";
}

function fillCell(cell:ExcelJS.Cell,context:ExportContext){
  if(typeof cell.value!=="string")return;
  const original=cell.value;
  const matches=[...original.matchAll(TOKEN)];
  if(!matches.length)return;
  if(matches.length===1&&matches[0][0]===original){
    const value=valueFor(matches[0][1],context);
    cell.value=typeof value==="number"&&Number.isFinite(value)?value:text(value);
    return;
  }
  cell.value=original.replace(TOKEN,(_,token)=>text(valueFor(token,context)));
}

async function renderWorkbook(input:{storedPath:string;repeatSections:RepeatSection[];orderIds:number[];lotId?:number}){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input.storedPath);
  const occupied=new Map<string,Array<[number,number]>>();
  const sections=[...input.repeatSections].sort((a,b)=>a.sheet.localeCompare(b.sheet)||b.row-a.row);
  for(const section of sections){
    const worksheet=workbook.getWorksheet(section.sheet);
    if(!worksheet)throw new Error("Không tìm thấy sheet "+section.sheet+".");
    const contexts=contextsFor(input.orderIds,section.scope,input.lotId);
    if(!contexts.length)throw new Error("Không có dữ liệu cho repeat section "+section.sheet+"!"+section.row+".");
    if(contexts.length>1)worksheet.duplicateRow(section.row,contexts.length-1,true);
    contexts.forEach((context,index)=>worksheet.getRow(section.row+index).eachCell({includeEmpty:true},cell=>fillCell(cell,context)));
    const ranges=occupied.get(section.sheet)||[];
    ranges.push([section.row,section.row+contexts.length-1]);occupied.set(section.sheet,ranges);
  }
  const base=contextsFor(input.orderIds,input.lotId?"LOT":"ORDER",input.lotId)[0]||contextsFor(input.orderIds,"ORDER")[0];
  workbook.eachSheet(sheet=>{
    const ranges=occupied.get(sheet.name)||[];
    sheet.eachRow({includeEmpty:true},row=>{
      if(ranges.some(([from,to])=>row.number>=from&&row.number<=to))return;
      row.eachCell({includeEmpty:true},cell=>fillCell(cell,base));
    });
  });
  const result=await workbook.xlsx.writeBuffer();
  return Buffer.from(result);
}

type TemplateRecord={
  template_id:number;template_name:string;output_mode:"MULTI_ORDER"|"PER_ORDER"|"PER_LOT";repeat_sections_json:string;
  active_version_id:number;version_number:number;stored_path:string;service:string;sub_service:string;supplier:string;
};

export function resolvePurchaseTemplate(order:DataRow){
  return db.prepare(
    "SELECT pt.id template_id,pt.name template_name,pt.output_mode,pt.repeat_sections_json,pv.id active_version_id,pv.version_number,pv.stored_path,rc.service,rc.sub_service,rc.supplier "+
    "FROM service_route_configs rc JOIN purchase_templates pt ON pt.route_config_id=rc.id AND pt.active=1 "+
    "JOIN purchase_template_versions pv ON pv.template_id=pt.id AND pv.status='ACTIVE' "+
    "WHERE rc.active=1 AND lower(rc.service)=lower(?) AND lower(rc.sub_service)=lower(?) AND lower(rc.supplier)=lower(?) LIMIT 1"
  ).get(text(order.service),text(order.sub_service),text(order.supplier)) as TemplateRecord|undefined;
}

export async function generatePreview(versionId:number,orderId:number){
  const row=db.prepare(
    "SELECT pt.id template_id,pt.name template_name,pt.output_mode,pt.repeat_sections_json,pv.id active_version_id,pv.version_number,pv.stored_path,rc.service,rc.sub_service,rc.supplier "+
    "FROM purchase_template_versions pv JOIN purchase_templates pt ON pt.id=pv.template_id JOIN service_route_configs rc ON rc.id=pt.route_config_id WHERE pv.id=?"
  ).get(versionId) as TemplateRecord|undefined;
  if(!row)throw new Error("Không tìm thấy version template.");
  const sections=JSON.parse(row.repeat_sections_json||"[]") as RepeatSection[];
  const data=exportData(orderId);
  const lotId=row.output_mode==="PER_LOT"?Number(data.lots[0]?.id||0)||undefined:undefined;
  return {buffer:await renderWorkbook({storedPath:row.stored_path,repeatSections:sections,orderIds:[orderId],lotId}),filename:"PREVIEW_"+safeName(text(data.order.system_order_code||orderId))+".xlsx"};
}

export async function generatePurchaseFiles(orderIds:number[]){
  const missing:Array<{order_id:number;dmd_id:string;reason:string}>=[];
  const groups=new Map<number,{template:TemplateRecord;orderIds:number[]}>();
  for(const orderId of [...new Set(orderIds)]){
    const order=db.prepare("SELECT * FROM orders WHERE id=?").get(orderId) as DataRow|undefined;
    if(!order){missing.push({order_id:orderId,dmd_id:String(orderId),reason:"Order không tồn tại"});continue}
    const readiness=validatePurchaseReadiness(orderId);
    if(!readiness.ready){missing.push({order_id:orderId,dmd_id:text(order.system_order_code),reason:readiness.issues.map(row=>row.message).join(" ")});continue}
    const template=resolvePurchaseTemplate(order);
    if(!template){missing.push({order_id:orderId,dmd_id:text(order.system_order_code),reason:"Chưa có Purchase Template"});continue}
    const group=groups.get(template.template_id)||{template,orderIds:[]};group.orderIds.push(orderId);groups.set(template.template_id,group);
  }
  const files:Array<{name:string;buffer:Buffer;service:string}>=[];
  for(const group of groups.values()){
    const sections=JSON.parse(group.template.repeat_sections_json||"[]") as RepeatSection[];
    if(group.template.output_mode==="MULTI_ORDER"){
      files.push({name:safeName(group.template.service+"_"+group.template.sub_service+"_"+group.template.supplier+"_"+group.orderIds.length+"-orders")+".xlsx",buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:sections,orderIds:group.orderIds}),service:group.template.service});
    }else if(group.template.output_mode==="PER_ORDER"){
      for(const orderId of group.orderIds){
        const order=db.prepare("SELECT system_order_code FROM orders WHERE id=?").get(orderId) as {system_order_code:string};
        files.push({name:safeName(group.template.service+"_"+order.system_order_code)+".xlsx",buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:sections,orderIds:[orderId]}),service:group.template.service});
      }
    }else{
      for(const orderId of group.orderIds){
        const data=exportData(orderId);
        for(const lot of data.lots){
          files.push({name:safeName(group.template.service+"_"+text(data.order.system_order_code)+"_Lot-"+text(lot.lot_number))+".xlsx",buffer:await renderWorkbook({storedPath:group.template.stored_path,repeatSections:sections,orderIds:[orderId],lotId:Number(lot.id)}),service:group.template.service});
        }
      }
    }
  }
  return {files,missing,valid_order_count:[...groups.values()].reduce((sum,group)=>sum+group.orderIds.length,0)};
}

export function genericPurchaseRows(orderIds:number[]){
  const rows:Array<Record<string,unknown>>=[];
  for(const orderId of [...new Set(orderIds)]){
    const data=exportData(orderId);
    for(const carton of data.cartons){
      const cartonItems=data.items.filter(item=>Number(item.carton_id)===Number(carton.id));
      if(!cartonItems.length)cartonItems.push({description:data.order.item,material:data.order.material,quantity:1,unit_manufacturing_value:data.order.declared_value,total_manufacturing_value:data.order.declared_value});
      for(const item of cartonItems)rows.push({
        dmd_id:data.order.system_order_code,client_order_id:data.order.order_id,client:data.order.customer,
        recipient_name:data.order.recipient_name,address_1:data.order.address1,address_2:data.order.address2,city:data.order.city,
        state:data.order.state,postal_code:data.order.zip,country:data.order.country,phone:data.order.phone,
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
