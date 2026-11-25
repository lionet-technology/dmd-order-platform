import {db} from './db';
import {logInternalEvent} from './order-audit';
import {subtractVnd} from './vnd-money';

type Row = Record<string, unknown>;
type Tracking = {id: number; lot_number: number; tracking: string; label_url: string | null};
type Snapshot = {
 route: [string, string, string];
 trackings: Tracking[];
 vnd_ledger_cutoff?: number;
};
type Boundary = {id: number; created_at: string; snapshot: Snapshot};
type Attempt = {
 id: number;
 lot_id: number;
 service: string;
 sub_service: string;
 supplier: string;
 trackings: Tracking[];
 start?: Boundary;
 end?: Boundary;
};
const normalize = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');

export function fulfillmentSnapshot(orderId: number): Snapshot {
 const order = db.prepare('SELECT service,sub_service,supplier,workflow_status FROM orders WHERE id=?').get(orderId) as {service:string;sub_service:string;supplier:string;workflow_status:string};
 return {
  route: [order.service, order.sub_service, order.supplier],
  trackings: db.prepare("SELECT id,lot_number,tracking,label_url FROM order_trackings WHERE order_id=? AND (status='ACTIVE' OR (?='CANCELLED' AND status='CANCELLED')) ORDER BY id").all(orderId,order.workflow_status) as Tracking[],
  vnd_ledger_cutoff: (db.prepare('SELECT COALESCE(MAX(id),0) id FROM vnd_supplier_ledger').get() as {id:number}).id,
 };
}

export function captureTrackingFulfillment(orderId: number) {
 return db.prepare("SELECT 1 FROM vnd_purchase_requests WHERE order_id=? AND status='CHARGED'").get(orderId)
  ? fulfillmentSnapshot(orderId) : undefined;
}

export function recordTrackingFulfillment(orderId: number, before: Snapshot | undefined, actorId?: number | null) {
 if (!before) return;
 const after = fulfillmentSnapshot(orderId);
 if (JSON.stringify([before.route,before.trackings]) !== JSON.stringify([after.route,after.trackings]))
  logInternalEvent({orderId, actorId, eventType:'VND_FULFILLMENT_TRACKING_CHANGE', summary:'Lưu lịch sử Tracking/Label để đối soát Supplier VNĐ.', before, after});
}

export function lotFulfillments(lotId: number) {
 const lot = db.prepare(`SELECT l.id,l.order_id,l.lot_number,o.order_id order_code
  FROM order_lots l JOIN orders o ON o.id=l.order_id JOIN vnd_purchase_requests p ON p.order_id=o.id
  WHERE l.id=? AND p.status IN ('CHARGED','CANCELLED')`).get(lotId) as
  {id:number;order_id:number;lot_number:number;order_code:string} | undefined;
 if (!lot) return undefined;
 const current = fulfillmentSnapshot(lot.order_id);
 const snapshotTracks = (snapshot: Snapshot) => snapshot.trackings.filter(t => Number(t.lot_number) === lot.lot_number)
  .map(({id,lot_number,tracking,label_url})=>({id,lot_number,tracking,label_url}));
 const events = db.prepare(`SELECT id,event_type,before_json,after_json,created_at FROM order_events
  WHERE order_id=? AND event_type IN ('EMERGENCY_ROUTE_SWITCH','VND_FULFILLMENT_TRACKING_CHANGE','TRACKING_REPLACED') ORDER BY id`).all(lot.order_id) as
  {id:number;event_type:string;before_json:string;after_json:string;created_at:string}[];
 const boundaries: Boundary[] = [];
 const replaced = new Set<number>();
 const snapshots = new Map<number,Boundary>();
 let emergencyCount = 0;
 for (const event of events) {
  if(event.event_type==='TRACKING_REPLACED')continue;
  const before = JSON.parse(event.before_json) as Snapshot;
  const after = JSON.parse(event.after_json);
  if (event.event_type === 'EMERGENCY_ROUTE_SWITCH') {
   emergencyCount++;
   for (const tracking of after.trackings ?? []) replaced.add(Number(tracking.old_tracking_id));
  } else {
   const outgoing = snapshotTracks(before), incoming = snapshotTracks(after);
   if (JSON.stringify(before.route) === JSON.stringify(after.route) && JSON.stringify(outgoing) === JSON.stringify(incoming)) continue;
   for (const tracking of outgoing) if (!incoming.some(incoming => incoming.id === tracking.id)) replaced.add(tracking.id);
  }
  snapshots.set(event.id,{id:event.id,created_at:event.created_at,snapshot:before});
 }
 // Older replacement audit has one before/after pair. Rewind it only if the
 // recorded successor fits the next snapshot and SQLite confirms the lineage.
 let upcoming=current;
 for(const event of [...events].reverse()){
  let boundary=snapshots.get(event.id);
  if(event.event_type==='TRACKING_REPLACED'){
   const before=JSON.parse(event.before_json) as Partial<Tracking>|null;
   const after=JSON.parse(event.after_json) as Partial<Tracking>|null;
   const successor=snapshotTracks(upcoming).find(t=>t.id===after?.id&&t.tracking===after?.tracking);
   if(!successor||!before?.tracking||!Object.hasOwn(before,'label_url'))continue;
   const prior=db.prepare("SELECT id,lot_number,tracking FROM order_trackings WHERE order_id=? AND normalized_tracking=? AND status='REPLACED' AND replaced_by_tracking_id=?")
    .get(lot.order_id,normalize(before.tracking),successor.id) as Omit<Tracking,'label_url'>|undefined;
   if(!prior||prior.lot_number!==lot.lot_number||replaced.has(prior.id)||before.id&&before.id!==prior.id)continue;
   replaced.add(prior.id);
   const trackings=upcoming.trackings.map(t=>t.id===successor.id?{...prior,label_url:before.label_url??null}:t);
   boundary={id:event.id,created_at:event.created_at,snapshot:{route:upcoming.route,trackings}};
  }
  if(boundary){boundaries.unshift(boundary);upcoming=boundary.snapshot;}
 }
 const missingEmergency = (db.prepare("SELECT count(*) n FROM emergency_hold_orders WHERE order_id=? AND resolved_at IS NOT NULL AND COALESCE(resolution_kind,'SWITCH')='SWITCH'").get(lot.order_id) as {n:number}).n !== emergencyCount;
 const missingTracking = (db.prepare("SELECT id FROM order_trackings WHERE order_id=? AND lot_number=? AND status='REPLACED'").all(lot.order_id,lot.lot_number) as {id:number}[])
  .some(t => !replaced.has(t.id));
 const attempts: Attempt[] = [...boundaries.map(b => b.snapshot),current].map((snapshot,index) => ({
  id: boundaries[index-1]?.id ?? 0, lot_id:lotId, service:snapshot.route[0], sub_service:snapshot.route[1],
  supplier:snapshot.route[2],trackings:snapshotTracks(snapshot),start:boundaries[index-1],end:boundaries[index],
 }));
 return {lot,attempts,incomplete:missingEmergency || missingTracking};
}

export function legacyPostingAttempt(attempts: Attempt[], supplier: string, ledgerId: number, createdAt: unknown) {
 const matches = attempts.filter(attempt => {
  if (attempt.supplier !== supplier) return false;
  if (attempt.start && (attempt.start.snapshot.vnd_ledger_cutoff !== undefined
   ? ledgerId <= attempt.start.snapshot.vnd_ledger_cutoff : String(createdAt) < attempt.start.created_at)) return false;
  return !attempt.end || (attempt.end.snapshot.vnd_ledger_cutoff !== undefined
   ? ledgerId <= attempt.end.snapshot.vnd_ledger_cutoff : String(createdAt) <= attempt.end.created_at);
 });
 return matches.length === 1 ? matches[0].id : null;
}

export function postingAttempt(cost: Row, ledger: Row) {
 if (cost.fulfillment_epoch != null) return Number(cost.fulfillment_epoch);
 const history = lotFulfillments(Number(cost.lot_id));
 return history && !history.incomplete ? legacyPostingAttempt(history.attempts,String(cost.supplier),Number(ledger.id),ledger.created_at) : null;
}

export function resolveFulfillment(data: Row, supplier: string, source?: Row) {
 const tracking = normalize(data.tracking), label = String(data.label_url ?? '').trim();
 const lots = db.prepare(`SELECT DISTINCT l.id FROM order_lots l JOIN orders o ON o.id=l.order_id
  JOIN vnd_purchase_requests p ON p.order_id=o.id
  WHERE p.status IN ('CHARGED','CANCELLED') AND (
   l.id=? OR o.order_id=? OR (?!='' AND EXISTS (
    SELECT 1 FROM order_trackings t WHERE t.order_id=l.order_id AND t.normalized_tracking=?
   ))
  )`).all(data.lot_id ?? null,data.order_code || null,tracking,tracking) as {id:number}[];
 const candidates: Attempt[] = [];
 let requiresReview = false;
 let changed = false;
 for (const {id} of lots) {
  const history = lotFulfillments(id)!;
  const relevant = history.attempts.filter(a => a.supplier === supplier);
  changed ||= history.attempts.length > 1 || history.incomplete;
  if (history.incomplete) {
   // Incomplete pre-migration audit may omit an entire route or tracking assignment.
   requiresReview = true;
   continue;
  }
  for (const attempt of relevant) {
   if (source && (attempt.service !== source.service || attempt.sub_service !== source.sub_service)) continue;
   if (tracking && !attempt.trackings.some(t => normalize(t.tracking) === tracking && (!label || t.label_url === label))) continue;
   candidates.push(attempt);
  }

 }
 // One documentary Tracking may have survived several route or Label changes.
 const ambiguous = candidates.length > 1;
 const attempt = !requiresReview && candidates.length === 1 ? candidates[0] : undefined;
 return {attempt, ids:candidates.map(a=>a.lot_id), requiresReview:requiresReview || ambiguous || (lots.length > 0 && candidates.length === 0) || (!!label && !attempt), changed};
}

export function approvedFulfillment(lotId: number, supplier: string, epoch: number) {
 const history = lotFulfillments(lotId);
 const costs = db.prepare(`SELECT c.*,e.id ledger_id,e.created_at posted_at,e.delta posting_delta FROM vnd_supplier_costs c
  JOIN vnd_supplier_ledger e ON e.cost_id=c.id AND e.kind='ACTUAL'
  WHERE c.lot_id=? AND c.supplier=? ORDER BY e.id`).all(lotId,supplier) as Row[];
 let uncertain = false;
 const totals = new Map<number,Row>();
 for (const {ledger_id,posted_at,posting_delta,...cost} of costs) {
  const explicit = cost.fulfillment_epoch != null;
  const id = explicit ? Number(cost.fulfillment_epoch)
   : history && !history.incomplete ? legacyPostingAttempt(history.attempts,supplier,Number(ledger_id),posted_at) : null;
  if (id === null) {
   uncertain = true;
   continue;
  }
  // Some legacy totals may have netted against a previous attempt's Actual.
  // Keep that journal intact and require review if its delta cannot be reconciled.
  if (!explicit && subtractVnd(String(cost.amount),String(totals.get(id)?.amount??'0')) !== posting_delta)
   uncertain = true;
  totals.set(id,cost);
 }
 return {approved:totals.get(epoch), uncertain};
}

export function hasPostedSupplierReference(supplier: string, lotId: number, reference: unknown) {
 return Boolean(db.prepare(`SELECT 1 FROM vnd_supplier_ledger e JOIN vnd_supplier_costs c ON c.id=e.cost_id
  WHERE e.supplier=? AND e.kind='ACTUAL' AND lower(e.reference)=lower(?) AND c.lot_id=?`).get(supplier,reference,lotId));
}

export function hasSupplierReferenceOutsideActual(supplier: string, reference: unknown) {
 return Boolean(db.prepare(`
  SELECT 1 FROM vnd_supplier_ledger WHERE supplier=@supplier AND lower(reference)=lower(@reference) AND kind<>'ACTUAL'
  UNION ALL
  SELECT 1 FROM vnd_supplier_claims WHERE supplier=@supplier AND lower(reference)=lower(@reference)
  UNION ALL
  SELECT 1 FROM vnd_supplier_claim_events e JOIN vnd_supplier_claims c ON c.id=e.claim_id
   WHERE c.supplier=@supplier AND lower(e.reference)=lower(@reference)
  LIMIT 1`).get({supplier,reference}));
}
