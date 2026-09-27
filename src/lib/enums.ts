import { db } from "./db";

const text = (value: unknown) => String(value ?? "").trim();

export const ENUM_TYPES = ["SERVICE","SUB_SERVICE","SUPPLIER","COUNTRY"] as const;
export type EnumType = typeof ENUM_TYPES[number];

export type EnumValue = {
  id:number;
  enum_type:EnumType;
  value:string;
  parent_value:string;
  active:number;
  sort_order:number;
  created_at:string;
  updated_at:string;
};

export function isEnumType(value: unknown): value is EnumType {
  return ENUM_TYPES.includes(String(value).toUpperCase() as EnumType);
}

export function enumRows(activeOnly=false) {
  const where=activeOnly?"WHERE active=1":"";
  return db.prepare(
    `SELECT id,enum_type,value,parent_value,active,sort_order,created_at,updated_at
     FROM enum_values ${where}
     ORDER BY CASE enum_type
       WHEN 'SERVICE' THEN 1 WHEN 'SUB_SERVICE' THEN 2 WHEN 'SUPPLIER' THEN 3 WHEN 'COUNTRY' THEN 4 ELSE 9 END,
       parent_value,sort_order,value COLLATE NOCASE`
  ).all() as EnumValue[];
}

export function findEnum(type: EnumType, valueRaw: unknown, parentRaw: unknown = "", activeOnly=true) {
  const value=text(valueRaw);
  const parent=text(parentRaw);
  if(!value)return undefined;
  return db.prepare(
    `SELECT id,enum_type,value,parent_value,active,sort_order,created_at,updated_at
     FROM enum_values
     WHERE enum_type=? AND lower(value)=lower(?) AND lower(parent_value)=lower(?)
       ${activeOnly?"AND active=1":""}
     LIMIT 1`
  ).get(type,value,parent) as EnumValue|undefined;
}

export function canonicalEnumValue(type: EnumType, valueRaw: unknown, parentRaw: unknown = "", options?:{allowInactive?:boolean}) {
  const value=text(valueRaw);
  if(!value)return "";
  const row=findEnum(type,value,parentRaw,!options?.allowInactive);
  if(!row){
    const label=type==="SUB_SERVICE"?"Sub-Service":type==="SERVICE"?"Dịch vụ":type==="SUPPLIER"?"Supplier":"Nước";
    throw new Error(`${label} "${value}" không nằm trong danh sách ${options?.allowInactive?"enum":"enum đang active"}.`);
  }
  return row.value;
}

export function validateOrderEnums(input:{
  service?:unknown;sub_service?:unknown;supplier?:unknown;country?:unknown;
}, existing?:{service?:unknown;sub_service?:unknown;supplier?:unknown;country?:unknown}) {
  const existingService=text(existing?.service);
  const requestedService=input.service===undefined?existingService:text(input.service);
  const sameService=Boolean(existingService)&&requestedService.toLowerCase()===existingService.toLowerCase();
  const service=requestedService
    ? canonicalEnumValue("SERVICE",requestedService,"",{allowInactive:sameService})
    : "";

  const validateField=(type:EnumType,incoming:unknown,oldValue:unknown,parent="",allowOld=true)=>{
    const old=text(oldValue);
    const value=incoming===undefined?old:text(incoming);
    if(!value)return "";
    const allowInactive=allowOld&&Boolean(old)&&value.toLowerCase()===old.toLowerCase();
    return canonicalEnumValue(type,value,parent,{allowInactive});
  };

  return {
    service,
    sub_service:validateField("SUB_SERVICE",input.sub_service,existing?.sub_service,service,sameService),
    supplier:validateField("SUPPLIER",input.supplier,existing?.supplier),
    country:validateField("COUNTRY",input.country,existing?.country),
  };
}

export function validateSupplierCostEnums(input:{service?:unknown;sub_service?:unknown;supplier?:unknown}) {
  const service=text(input.service)?canonicalEnumValue("SERVICE",input.service):"";
  return {
    service,
    sub_service:text(input.sub_service)?canonicalEnumValue("SUB_SERVICE",input.sub_service,service):"",
    supplier:text(input.supplier)?canonicalEnumValue("SUPPLIER",input.supplier):"",
  };
}

export function createEnumValue(input:{enum_type:unknown;value:unknown;parent_value?:unknown;sort_order?:unknown},userId:number) {
  const type=String(input.enum_type||"").toUpperCase();
  if(!isEnumType(type))throw new Error("Loại enum không hợp lệ.");
  const value=text(input.value);
  if(!value)throw new Error("Tên enum là bắt buộc.");
  let parent=text(input.parent_value);
  if(type==="SUB_SERVICE"){
    if(!parent)throw new Error("Sub-Service cần Dịch vụ cha.");
    parent=canonicalEnumValue("SERVICE",parent);
  } else parent="";
  const sortOrder=Number(input.sort_order||0)||0;
  try{
    const result=db.prepare(
      "INSERT INTO enum_values(enum_type,value,parent_value,active,sort_order,created_by_user_id,updated_by_user_id) VALUES (?,?,?,1,?,?,?)"
    ).run(type,value,parent,sortOrder,userId,userId);
    return db.prepare("SELECT * FROM enum_values WHERE id=?").get(result.lastInsertRowid) as EnumValue;
  }catch(error){
    if(error instanceof Error&&error.message.toLowerCase().includes("unique"))throw new Error("Giá trị enum này đã tồn tại.");
    throw error;
  }
}

function cascadeRename(type:EnumType,oldValue:string,newValue:string,parent:string) {
  if(oldValue.toLowerCase()===newValue.toLowerCase()&&oldValue===newValue)return;
  if(type==="SERVICE"){
    db.prepare("UPDATE orders SET service=? WHERE lower(service)=lower(?)").run(newValue,oldValue);
    db.prepare("UPDATE supplier_costs SET service=? WHERE lower(service)=lower(?)").run(newValue,oldValue);
    db.prepare("UPDATE service_costs SET service=? WHERE lower(service)=lower(?)").run(newValue,oldValue);
    db.prepare("UPDATE enum_values SET parent_value=? WHERE enum_type='SUB_SERVICE' AND lower(parent_value)=lower(?)").run(newValue,oldValue);
  }else if(type==="SUB_SERVICE"){
    if(parent){
      db.prepare("UPDATE orders SET sub_service=? WHERE lower(sub_service)=lower(?) AND lower(service)=lower(?)").run(newValue,oldValue,parent);
      db.prepare("UPDATE supplier_costs SET sub_service=? WHERE lower(sub_service)=lower(?) AND lower(service)=lower(?)").run(newValue,oldValue,parent);
    }else{
      db.prepare("UPDATE orders SET sub_service=? WHERE lower(sub_service)=lower(?)").run(newValue,oldValue);
      db.prepare("UPDATE supplier_costs SET sub_service=? WHERE lower(sub_service)=lower(?)").run(newValue,oldValue);
    }
  }else if(type==="SUPPLIER"){
    db.prepare("UPDATE orders SET supplier=? WHERE lower(supplier)=lower(?)").run(newValue,oldValue);
    db.prepare("UPDATE supplier_costs SET supplier=? WHERE lower(supplier)=lower(?)").run(newValue,oldValue);
  }else if(type==="COUNTRY"){
    db.prepare("UPDATE orders SET country=? WHERE lower(country)=lower(?)").run(newValue,oldValue);
  }
}

export function updateEnumValue(id:number,input:{value?:unknown;parent_value?:unknown;active?:unknown;sort_order?:unknown},userId:number) {
  const current=db.prepare("SELECT * FROM enum_values WHERE id=?").get(id) as EnumValue|undefined;
  if(!current)throw new Error("Không tìm thấy enum.");

  const nextValue=input.value===undefined?current.value:text(input.value);
  if(!nextValue)throw new Error("Tên enum là bắt buộc.");
  let nextParent=current.parent_value;
  if(current.enum_type==="SUB_SERVICE"&&input.parent_value!==undefined){
    const requestedParent=canonicalEnumValue("SERVICE",input.parent_value);
    if(requestedParent.toLowerCase()!==current.parent_value.toLowerCase()){
      throw new Error("Không đổi Dịch vụ cha của Sub-Service đã tồn tại. Hãy tạo Sub-Service mới và deactivate giá trị cũ.");
    }
    nextParent=requestedParent;
  }
  if(current.enum_type!=="SUB_SERVICE")nextParent="";
  const nextActive=input.active===undefined?current.active:(input.active?1:0);
  const nextSort=input.sort_order===undefined?current.sort_order:(Number(input.sort_order)||0);

  const tx=db.transaction(()=>{
    cascadeRename(current.enum_type,current.value,nextValue,current.parent_value);
    if(current.enum_type==="SUB_SERVICE"&&current.parent_value.toLowerCase()!==nextParent.toLowerCase()){
      // Moving a Sub-Service only changes its catalog scope; historical rows keep their existing service.
    }
    db.prepare(
      "UPDATE enum_values SET value=?,parent_value=?,active=?,sort_order=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?"
    ).run(nextValue,nextParent,nextActive,nextSort,userId,id);
    if(current.enum_type==="SERVICE"&&nextActive===0){
      db.prepare(
        "UPDATE enum_values SET active=0,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE enum_type='SUB_SERVICE' AND lower(parent_value)=lower(?)"
      ).run(userId,nextValue);
    }
  });
  try{tx()}catch(error){
    if(error instanceof Error&&error.message.toLowerCase().includes("unique"))throw new Error("Giá trị enum này đã tồn tại.");
    throw error;
  }
  return db.prepare("SELECT * FROM enum_values WHERE id=?").get(id) as EnumValue;
}
