import {createHash} from 'node:crypto';
import {db} from './db';
import './cases';
import {RefundService} from './refunds';

export type CommissionCategory='CANCELLATION'|'SHIPPING_INCIDENT'|'RECONCILIATION_ERROR'|'FORCE_MAJEURE'|'OTHER';
export type CommissionDecision='APPROVE_SUPPLEMENT'|'EXCLUDE';
type Source={id:number;kind:string;status:string;summary:string;refund_cents:number;compensation_cents:number};
let schemaReady=false;
function schema(){
 if(schemaReady)return;
 new RefundService(db);
 db.exec(`CREATE TABLE IF NOT EXISTS commission_review_events(
 id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),
 decision TEXT NOT NULL CHECK(decision IN ('APPROVE_SUPPLEMENT','EXCLUDE')),
 category TEXT NOT NULL CHECK(category IN ('CANCELLATION','SHIPPING_INCIDENT','RECONCILIATION_ERROR','FORCE_MAJEURE','OTHER')),
 source_hash TEXT NOT NULL,reason TEXT NOT NULL,actor_id INTEGER NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE INDEX IF NOT EXISTS commission_review_order_idx ON commission_review_events(order_id,id);`);
 for(const op of ['UPDATE','DELETE'])db.exec(`CREATE TRIGGER IF NOT EXISTS commission_review_immutable_${op} BEFORE ${op} ON commission_review_events BEGIN SELECT RAISE(ABORT,'Commission review event is immutable'); END;`);
 schemaReady=true;
}
function sources(orderId:number){
 const claims=db.prepare(`SELECT c.id,c.status,c.summary,COALESCE((SELECT e.refund_cents FROM refund_events e WHERE e.claim_id=c.id AND e.kind='CLAIM_DECISION' ORDER BY e.id DESC LIMIT 1),0) refund_cents,COALESCE((SELECT e.compensation_cents FROM refund_events e WHERE e.claim_id=c.id AND e.kind='CLAIM_DECISION' ORDER BY e.id DESC LIMIT 1),0) compensation_cents
 FROM operation_cases c JOIN operation_case_orders co ON co.case_id=c.id WHERE co.order_id=? AND c.kind='CLAIM' ORDER BY c.id`).all(orderId) as Omit<Source,'kind'>[];
 const refunds=db.prepare(`SELECT l.id,l.reference_type,l.reference_id,ROUND(l.amount*100) amount_cents FROM ledger_entries l WHERE l.direction='CREDIT' AND l.entry_type='REFUND'
 AND ((l.reference_type='ORDER_CANCELLATION' AND l.reference_id=CAST(? AS TEXT))
 OR (l.reference_type='CLAIM' AND EXISTS(SELECT 1 FROM operation_case_orders co WHERE co.order_id=? AND CAST(co.case_id AS TEXT)=l.reference_id))) ORDER BY l.id`).all(orderId,orderId) as {id:number;reference_type:string;reference_id:string;amount_cents:number}[];
 const order=db.prepare('SELECT workflow_status FROM orders WHERE id=?').get(orderId) as {workflow_status:string}|undefined;
 const linked:Source[]=claims.map(c=>({...c,kind:'CLAIM'}));
 for(const r of refunds)linked.push({id:r.id,kind:'REFUND_'+r.reference_type,status:'POSTED',summary:'Reference '+r.reference_id,refund_cents:r.amount_cents,compensation_cents:0});
 if(order?.workflow_status==='CANCELLED')linked.push({id:orderId,kind:'CANCELLATION',status:'CANCELLED',summary:'Order cancelled',refund_cents:0,compensation_cents:0});
 const signature=createHash('sha256').update(JSON.stringify(linked)).digest('hex');
 return {sources:linked,signature,flagged:linked.length>0,cancelled:order?.workflow_status==='CANCELLED'};
}
export function commissionReviewForOrder(orderId:number){
 schema();const source=sources(orderId);
 const latest=db.prepare('SELECT id,decision,category,reason,actor_id,source_hash,created_at FROM commission_review_events WHERE order_id=? ORDER BY id DESC LIMIT 1').get(orderId) as {id:number;decision:CommissionDecision;category:CommissionCategory;reason:string;actor_id:number;source_hash:string;created_at:string}|undefined;
 const current=latest?.source_hash===source.signature?latest:null;
 const approved=source.flagged&&!source.cancelled&&current?.decision==='APPROVE_SUPPLEMENT';
 return {...source,latest:latest??null,decision:current??null,approved,requires_review:source.flagged&&!source.cancelled&&!current};
}
