import {db} from './db';

type Side = 'CLIENT' | 'SUPPLIER';

export function claimProcessing(side: Side, claimId: unknown, completed: boolean) {
 const column = side === 'CLIENT' ? 'client_claim_id' : 'supplier_claim_id';
 const processing = db.prepare(`SELECT id,note,evidence,actor_id,created_at FROM vnd_claim_processing WHERE ${column}=? ORDER BY id`).all(claimId);
 return {case_status: completed ? 'COMPLETE' : processing.length ? 'PROCESSING' : 'CREATED', processing};
}

export function addClaimProcessing(side: Side, claimId: unknown, note: string, evidence: unknown, actorId: number) {
 const proof = typeof evidence === 'string' ? evidence.trim() : '';
 if (!note.trim() || note.length > 2000 || proof.length > 2000) throw Error('Nội dung trao đổi/chứng từ không hợp lệ.');
 db.prepare('INSERT INTO vnd_claim_processing(client_claim_id,supplier_claim_id,note,evidence,actor_id) VALUES (?,?,?,?,?)')
  .run(side === 'CLIENT' ? claimId : null, side === 'SUPPLIER' ? claimId : null, note, proof, actorId);
}

export function claimOrderIds(value: unknown): number[] {
 if (!Array.isArray(value) || !value.length || value.length > 200 || value.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(value).size !== value.length) {
  throw Error('Cần danh sách Order ID hợp lệ và duy nhất.');
 }
 return value;
}

export function supplierClaimOrders(lots: unknown): number[] {
 return (db.prepare('SELECT DISTINCT order_id FROM order_lots WHERE id IN (SELECT value FROM json_each(?)) ORDER BY order_id')
  .all(lots) as {order_id:number}[]).map(row => row.order_id);
}

export function setClaimWatchlist(side: Side, scope: number | string, ids: number[], active: unknown, reason: string, actorId: number) {
 if (typeof active !== 'boolean' || !reason.trim() || reason.length > 2000) throw Error('Cần trạng thái và lý do theo dõi hợp lệ.');
 const field = side === 'CLIENT' ? 'o.client_user_id' : 'o.supplier';
 const scoped = db.prepare(`SELECT o.id FROM orders o JOIN vnd_purchase_requests r ON r.order_id=o.id WHERE o.id=? AND ${field}=?`);
 const append = db.prepare('INSERT INTO vnd_claim_watchlist(side,supplier,order_id,active,reason,actor_id) VALUES (?,?,?,?,?,?)');
 for (const id of ids) {
  if (!scoped.get(id,scope)) throw Error('Order VNĐ ngoài phạm vi theo dõi.');
  append.run(side,side === 'SUPPLIER' ? scope : '',id,Number(active),reason,actorId);
 }
}

export function claimWatchlist(side: Side, scope: number | string, claims: {id:unknown;order_ids:number[]}[]) {
 const field = side === 'CLIENT' ? 'o.client_user_id' : 'o.supplier';
 const rows = db.prepare(`SELECT w.order_id,w.reason,w.actor_id,w.created_at
  FROM vnd_claim_watchlist w JOIN orders o ON o.id=w.order_id JOIN vnd_purchase_requests r ON r.order_id=o.id
  WHERE w.side=? AND w.supplier=? AND ${field}=? AND w.active=1 AND w.id=(
   SELECT max(h.id) FROM vnd_claim_watchlist h WHERE h.side=w.side AND h.supplier=w.supplier AND h.order_id=w.order_id
  ) ORDER BY w.id DESC`).all(side,side === 'SUPPLIER' ? scope : '',scope) as {order_id:number;reason:string;actor_id:number;created_at:string}[];
 const byOrder = new Map<number,unknown[]>();
 for (const claim of claims) for (const id of claim.order_ids) {
  const linked = byOrder.get(id) ?? [];
  linked.push(claim.id);
  byOrder.set(id, linked);
 }
 return rows.map(row => ({...row, claim_ids: byOrder.get(row.order_id) ?? []}));
}
