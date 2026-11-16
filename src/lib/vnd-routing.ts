import {db} from './db';
import {sourceMarket,finalServiceBook,normalizeDestination} from './service-v1-source';
import {routeState} from './route-lifecycle';
/** Destination routing stays inside ePacket; ambiguity is an actionable error. */
export function vndEpacketDestination(clientId:number,service:string,sub:string,supplier:string,country:string){
 if(service.toUpperCase()!=='EPACKET'||sub.toUpperCase().includes('EU')||['US','USA','UNITED STATES','UNITED STATES OF AMERICA'].includes(normalizeDestination(country)))return {sub_service:sub,supplier};
 sourceMarket(finalServiceBook(),'EPACKET_EU',country);
 const routes=db.prepare("SELECT r.*,c.config_json FROM service_route_configs r JOIN service_v1_config_versions c ON c.route_id=r.id AND c.revision=(SELECT MAX(revision) FROM service_v1_config_versions WHERE route_id=r.id) WHERE r.service='ePacket' COLLATE NOCASE AND r.active=1 AND r.warehouse_hold=0").all() as Array<Record<string,unknown>>;
 const candidates=routes.filter(r=>{
  const cfg=JSON.parse(String(r.config_json));
  if(!String(r.sub_service).toUpperCase().includes('EU')||cfg.adapter!=='EPACKET'||!cfg.markets.includes(country.trim().toUpperCase())||routeState(Number(r.id))!=='ACTIVE')return false;
  const s=db.prepare("SELECT is_enabled FROM client_service_settings WHERE client_user_id=? AND service='ePacket' COLLATE NOCASE AND (sub_service=? COLLATE NOCASE OR sub_service='') ORDER BY length(sub_service) DESC LIMIT 1").get(clientId,r.sub_service) as {is_enabled:number}|undefined;
  return Boolean(s?.is_enabled);
 });
 if(candidates.length!==1)throw Error(candidates.length?'Có nhiều route ePacket EU hợp lệ; Admin cần chọn rõ route.':'Không có route ePacket EU được cấp và cấu hình cho quốc gia này.');
 return {sub_service:String(candidates[0].sub_service),supplier:String(candidates[0].supplier)};
}
