import {db} from './db';
export function ledgerPage(client:number,params:URLSearchParams){
 const raw=Number(params.get('ledger_page')||1),page=Number.isSafeInteger(raw)&&raw>0?Math.min(raw,1000000):1;
 const q=(params.get('q')||'').trim().slice(0,200),type=(params.get('type')||'').slice(0,80),status=params.get('status')||'';
 const where="e.client_user_id=? AND e.entry_type<>'SERVICE_COST' AND (?='' OR e.entry_type=?) AND (?='' OR (CAST(e.id AS TEXT)||' '||COALESCE(e.note,'')||' '||COALESCE(e.reference_type,'')||' '||COALESCE(e.reference_id,'')) LIKE ? ESCAPE '\\') AND (?='' OR EXISTS(SELECT 1 FROM rejected_payments r WHERE r.ledger_id=e.id)=?)";
 const escaped=q.replace(/[\\%_]/g,'\\$&');
 const args=[client,type,type,q,'%'+escaped+'%',status,status==='REVERSED'?1:0];
 const total=Number((db.prepare('SELECT COUNT(*) n FROM ledger_entries e WHERE '+where).get(...args) as {n:number}).n);
 const pages=Math.max(1,Math.ceil(total/25)),shown=Math.min(page,pages);
 const items=db.prepare('SELECT e.*,COALESCE((SELECT SUM(amount_cents) FROM credit_allocations WHERE ledger_id=e.id),0) allocated_cents,EXISTS(SELECT 1 FROM rejected_payments WHERE ledger_id=e.id) rejected FROM ledger_entries e WHERE '+where+' ORDER BY e.id DESC LIMIT 25 OFFSET ?').all(...args,(shown-1)*25);
 const types=(db.prepare("SELECT DISTINCT entry_type FROM ledger_entries WHERE client_user_id=? AND entry_type<>'SERVICE_COST' ORDER BY entry_type").all(client) as {entry_type:string}[]).map(r=>r.entry_type);
 return {transactions:items,ledger_pagination:{total,page:shown,pages},ledger_types:types};
}
