import {db} from './db';
type Row=Record<string,unknown>;
export function supplierClaimSourceSchema(){
 db.exec(`CREATE TABLE IF NOT EXISTS supplier_claim_recovery_links(
 recovery_id INTEGER PRIMARY KEY REFERENCES supplier_recoveries(id),
 claim_id INTEGER NOT NULL UNIQUE REFERENCES supplier_claims(id),
 evidence TEXT NOT NULL,reference TEXT NOT NULL,reason TEXT NOT NULL,
 actor_id INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TRIGGER IF NOT EXISTS immutable_supplier_claim_link_update BEFORE UPDATE ON supplier_claim_recovery_links BEGIN SELECT RAISE(ABORT,'Claim source links are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS immutable_supplier_claim_link_delete BEFORE DELETE ON supplier_claim_recovery_links BEGIN SELECT RAISE(ABORT,'Claim source links are immutable'); END;`);
}
supplierClaimSourceSchema();
const exists=(table:string)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
export function recoveryConflicts(claimId:number){
 if(!exists('supplier_recoveries'))return [] as Row[];
 return db.prepare(`SELECT DISTINCT r.*,l.claim_id linked_claim_id,
 (SELECT COUNT(*) FROM supplier_recovery_receipts x WHERE x.recovery_id=r.id) receipt_count
 FROM supplier_recoveries r JOIN operation_case_orders co ON co.case_id=r.case_id
 JOIN order_trackings t ON t.order_id=co.order_id
 JOIN supplier_claim_trackings ct ON ct.tracking_id=t.id
 JOIN supplier_claims c ON c.id=ct.claim_id AND c.supplier=r.supplier COLLATE NOCASE
 LEFT JOIN supplier_claim_recovery_links l ON l.recovery_id=r.id
 WHERE c.id=? AND (l.claim_id IS NULL OR l.claim_id<>c.id)`).all(claimId) as Row[];
}
export function accountClaimsForCase(caseId:number,supplier:string){
 if(!exists('supplier_claims'))return [] as Row[];
 return db.prepare(`SELECT DISTINCT c.id FROM supplier_claims c
 JOIN supplier_claim_trackings ct ON ct.claim_id=c.id
 JOIN order_trackings t ON t.id=ct.tracking_id
 JOIN operation_case_orders co ON co.order_id=t.order_id
 WHERE co.case_id=? AND c.supplier=? COLLATE NOCASE`).all(caseId,supplier) as Row[];
}
export function assertRecoveryOperational(recoveryId:number,caseId:number,supplier:string){
 if(db.prepare('SELECT 1 FROM supplier_claim_recovery_links WHERE recovery_id=?').get(recoveryId)||accountClaimsForCase(caseId,supplier).length)
 throw Error('Recovery trùng Supplier Account Claim; REVIEW / liên kết nguồn và ghi tại Supplier Account, không ghi hai lần.');
}
