import { db } from "./db";

export type OrderEventVisibility="PUBLIC"|"ADMIN";

export function logOrderEvent(input:{
  orderId:number;
  eventType:string;
  summary:string;
  actorId?:number|null;
  visibility?:OrderEventVisibility;
  source?:string;
  before?:unknown;
  after?:unknown;
}){
  const actor=input.actorId
    ? db.prepare("SELECT username,display_name,role FROM users WHERE id=?").get(input.actorId) as {username:string;display_name:string;role:string}|undefined
    : undefined;
  const result=db.prepare(`
    INSERT INTO order_events(
      order_id,event_type,summary,visibility,source,actor_user_id,
      actor_username,actor_display_name,actor_role,before_json,after_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    input.orderId,input.eventType,input.summary,input.visibility||"PUBLIC",input.source||"UI",input.actorId||null,
    actor?.username||null,actor?.display_name||null,actor?.role||null,
    input.before===undefined?null:JSON.stringify(input.before),
    input.after===undefined?null:JSON.stringify(input.after),
  );
  return Number(result.lastInsertRowid);
}

export function listOrderEvents(orderId:number,includeAdmin=false){
  return db.prepare(`
    SELECT id,order_id,event_type,summary,visibility,source,actor_user_id,
           actor_username,actor_display_name,actor_role,before_json,after_json,created_at
    FROM order_events
    WHERE order_id=? ${includeAdmin?"":"AND visibility='PUBLIC'"}
    ORDER BY datetime(created_at) DESC,id DESC
  `).all(orderId);
}
