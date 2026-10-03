import { db } from "./db";
import type { UserRole } from "./auth";

export const PUBLIC_ORDER_EVENT_TYPES = [
  "SURCHARGE_NOTICE",
  "TAX_NOTICE",
  "TRACKING_LABEL_CHANGED",
  "DELIVERED",
  "REFUND",
] as const;

export type PublicOrderEventType=typeof PUBLIC_ORDER_EVENT_TYPES[number];
export type OrderEventVisibility="PUBLIC"|"INTERNAL"|"ADMIN";

type EventInput={
  orderId:number;
  eventType:string;
  summary:string;
  actorId?:number|null;
  source?:string;
  before?:unknown;
  after?:unknown;
};

function actorFor(actorId?:number|null){
  return actorId
    ? db.prepare("SELECT username,display_name,role FROM users WHERE id=?").get(actorId) as {username:string;display_name:string;role:string}|undefined
    : undefined;
}

function insertEvent(input:EventInput,visibility:OrderEventVisibility){
  const actor=actorFor(input.actorId);
  const result=db.prepare(
    "INSERT INTO order_events(order_id,event_type,summary,visibility,source,actor_user_id,actor_username,actor_display_name,actor_role,before_json,after_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
  ).run(
    input.orderId,input.eventType,input.summary,visibility,input.source||"UI",input.actorId||null,
    actor?.username||null,actor?.display_name||null,actor?.role||null,
    input.before===undefined?null:JSON.stringify(input.before),
    input.after===undefined?null:JSON.stringify(input.after),
  );
  return Number(result.lastInsertRowid);
}

export function logInternalEvent(input:EventInput){
  return insertEvent(input,"INTERNAL");
}

export function logAdminEvent(input:EventInput){
  return insertEvent(input,"ADMIN");
}

// Backwards-compatible alias: generic events are internal by default. Existing
// callers can still explicitly request ADMIN, but PUBLIC must go through the
// allowlisted publishPublicNote helper.
export function logOrderEvent(input:EventInput&{visibility?:OrderEventVisibility}){
  if(input.visibility==="PUBLIC")throw new Error("Public Order event phải dùng publishPublicNote().");
  return insertEvent(input,input.visibility==="ADMIN"?"ADMIN":"INTERNAL");
}

function appendLegacyPublicNote(orderId:number,message:string){
  const clean=String(message||"").trim();
  if(!clean)return;
  const stamp=new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",dateStyle:"short",timeStyle:"short"}).format(new Date());
  const note="["+stamp+"] "+clean;
  db.prepare("UPDATE orders SET public_note=CASE WHEN COALESCE(public_note,'')='' THEN ? ELSE public_note||char(10)||char(10)||? END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(note,note,orderId);
}

export function publishPublicNote(input:{
  orderId:number;
  eventType:PublicOrderEventType;
  summary:string;
  actorId?:number|null;
  source?:string;
  publicData?:Record<string,string|number|boolean|null|undefined>;
}){
  if(!(PUBLIC_ORDER_EVENT_TYPES as readonly string[]).includes(input.eventType)){
    throw new Error("Loại Note công khai không được phép.");
  }
  const summary=String(input.summary||"").trim();
  if(!summary)throw new Error("Nội dung Note công khai là bắt buộc.");
  appendLegacyPublicNote(input.orderId,summary);
  return insertEvent({
    orderId:input.orderId,
    eventType:input.eventType,
    summary,
    actorId:input.actorId,
    source:input.source,
    after:input.publicData||undefined,
  },"PUBLIC");
}

export function listOrderEvents(orderId:number,role:UserRole){
  const publicTypes=PUBLIC_ORDER_EVENT_TYPES.map(()=>"?").join(",");
  if(role==="CLIENT"){
    return db.prepare(
      "SELECT id,order_id,event_type,summary,visibility,created_at FROM order_events WHERE order_id=? AND visibility='PUBLIC' AND event_type IN ("+publicTypes+") ORDER BY datetime(created_at) DESC,id DESC"
    ).all(orderId,...PUBLIC_ORDER_EVENT_TYPES);
  }
  if(role==="SALES"){
    return db.prepare(
      "SELECT id,order_id,event_type,summary,visibility,source,actor_display_name,actor_role,created_at FROM order_events WHERE order_id=? AND (visibility='INTERNAL' OR (visibility='PUBLIC' AND event_type IN ("+publicTypes+"))) ORDER BY datetime(created_at) DESC,id DESC"
    ).all(orderId,...PUBLIC_ORDER_EVENT_TYPES);
  }
  return db.prepare(
    "SELECT id,order_id,event_type,summary,visibility,source,actor_user_id,actor_username,actor_display_name,actor_role,before_json,after_json,created_at FROM order_events WHERE order_id=? ORDER BY datetime(created_at) DESC,id DESC"
  ).all(orderId);
}

export function publicNoteText(orderId:number){
  const placeholders=PUBLIC_ORDER_EVENT_TYPES.map(()=>"?").join(",");
  const rows=db.prepare(
    "SELECT summary FROM order_events WHERE order_id=? AND visibility='PUBLIC' AND event_type IN ("+placeholders+") ORDER BY datetime(created_at),id"
  ).all(orderId,...PUBLIC_ORDER_EVENT_TYPES) as Array<{summary:string}>;
  return rows.map(row=>row.summary).filter(Boolean).join("\n\n");
}

export function sanitizePrivateNoteForSales(value:unknown,supplier?:unknown){
  const terms=["supplier","net cost","netcost","true net","est net","estimated net","base cost","giá vốn","chi phí nhà cung cấp"];
  const supplierName=String(supplier||"").trim().toLowerCase();
  if(supplierName)terms.push(supplierName);
  return String(value||"").split(/\n\s*\n/).map(part=>part.trim()).filter(part=>{
    const lower=part.toLowerCase();
    return part&&!terms.some(term=>lower.includes(term));
  }).join("\n\n");
}
