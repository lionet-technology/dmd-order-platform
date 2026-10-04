import { z } from "zod";
import { db } from "./db";

const identifier=z.string().trim().min(1).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const definition=z.object({
  rule_type:identifier,
  segments:z.array(identifier).max(100).refine(values=>new Set(values).size===values.length,"Segment không được trùng."),
  priority:z.number().int().min(-10000).max(10000),
  active:z.boolean(),
  config:z.record(z.unknown()),
}).strict();
export const segmentationSchema=z.object({enabled:z.boolean(),rules:z.array(definition).max(50)}).strict();
export type RouteSegmentation=z.infer<typeof segmentationSchema>;

export function parseSegmentation(value:unknown):RouteSegmentation {
  const parsed=segmentationSchema.parse(value);
  const json=JSON.stringify(parsed);
  if(json.length>65536)throw new Error("Cấu hình phân vùng quá dài.");
  function validate(value:unknown,depth=0){
    if(depth>12)throw new Error("Cấu hình phân vùng quá nhiều cấp.");
    if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)){
      if(["__proto__","constructor","prototype"].includes(key))throw new Error("Key cấu hình phân vùng không hợp lệ.");
      validate(item,depth+1);
    }
  }
  validate(value);
  validate(parsed);
  return parsed;
}
export function readSegmentation(routeId:number):RouteSegmentation {
  const route=db.prepare("SELECT segmentation_enabled FROM service_route_configs WHERE id=?").get(routeId) as {segmentation_enabled:number};
  const rules=db.prepare("SELECT * FROM warehouse_routing_rules WHERE route_config_id=? ORDER BY priority DESC,id").all(routeId) as Array<{evaluator_key:string;config_json:string;priority:number;active:number}>;
  return {enabled:Boolean(route.segmentation_enabled),rules:rules.map(rule=>{
    let config:Record<string,unknown>={};try{const parsed=JSON.parse(rule.config_json);if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))config=parsed}catch{}
    const {segments,...extra}=config;
    return {rule_type:rule.evaluator_key,segments:Array.isArray(segments)?segments.filter((value):value is string=>typeof value==="string"):[],priority:rule.priority,active:Boolean(rule.active),config:extra};
  })};
}
// Caller uses the same transaction as the route update, so invalid requests never partially save.
export function saveSegmentation(routeId:number,value:RouteSegmentation){
  db.prepare("UPDATE service_route_configs SET segmentation_enabled=? WHERE id=?").run(value.enabled?1:0,routeId);
  db.prepare("DELETE FROM warehouse_routing_rules WHERE route_config_id=?").run(routeId);
  const insert=db.prepare("INSERT INTO warehouse_routing_rules(route_config_id,evaluator_key,config_json,priority,active) VALUES (?,?,?,?,?)");
  for(const rule of value.rules)insert.run(routeId,rule.rule_type,JSON.stringify({...rule.config,segments:rule.segments}),rule.priority,rule.active?1:0);
}
