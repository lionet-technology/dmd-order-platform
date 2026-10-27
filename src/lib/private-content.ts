import {db} from './db';

const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Include retired values: historical notes must not become public after setup changes.
export function privateSupplierNames(){
 return (db.prepare("SELECT value name FROM enum_values WHERE enum_type='SUPPLIER' UNION SELECT supplier FROM orders WHERE supplier IS NOT NULL UNION SELECT supplier FROM service_route_configs UNION SELECT default_supplier FROM client_service_settings WHERE default_supplier IS NOT NULL").all() as {name:string}[]).map(r=>String(r.name||'').trim()).filter(Boolean);
}

export function redactPrivateContent(value:string,names:readonly string[]){
 let result=value;
 for(const name of names){
  // Token boundaries avoid matching e.g. a short Supplier inside an ordinary word.
  const pattern=new RegExp('(?<![\\p{L}\\p{N}])'+escape(name)+'(?![\\p{L}\\p{N}])','giu');
  result=result.replace(pattern,'[nội bộ]');
  const encoded=encodeURIComponent(name);
  if(encoded!==name)result=result.replace(new RegExp(escape(encoded),'gi'),'[nội bộ]');
 }
 // Redact only labelled financial values; retain delivery messages, timestamps and
 // customer charges elsewhere in the same note. Never guess from a bare number.
 result=result.replace(/\b(?:true[ _-]*(?:net[ _-]*)?cost|(?:est|estimated)[ _-]*(?:net[ _-]*)?cost|net[ _-]*(?:cost|price)|base[ _-]*(?:cost|rate|markup)|retail[ _-]*markup|(?:gp[ _-]*net|gross[ _-]*profit[ _-]*net)|giá vốn|chi phí nhà cung cấp)\s*[:=]?\s*(?:USD|VND|\$|₫)?\s*-?\d[\d.,]*(?:\s*(?:USD|VND|%|₫))?/gi,'[tài chính nội bộ]');
 return result;
}
