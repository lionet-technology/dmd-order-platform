# Finance and operations domain consolidation

Statement is immutable weekly usage; ledger is money movement; allocation bridges eligible credit/payment to AR. Credits default to Wallet. Economic occurred_at is retained; created_at records system time. Issued-period postings are current-period adjustments with original references.

Money command receipts store canonical payload hash and original result in the same IMMEDIATE transaction as money writes. Request keys are scoped to actor/account and reject changed payloads. Payment and allocation HTTP commands require request_key (or Idempotency-Key); UI ledger rows retain a key through retries in the same entry sheet. Existing domain guards remain: claim_decisions unique case, weight adjustment unique measurement/ledger, supplier receipt unique recovery/reference. Balance imports use content SHA-256 (or an explicit request key) to reuse the original batch atomically. Legacy direct ledger callers without a key retain existing behavior; future external integrations must supply a durable request key. Keys are never pruned automatically.

operation_cases remains the common case core. Existing claim_decisions, supplier_recoveries and weight_adjustments are extension/composition records. Preserve legacy nullable claim follow-up/hold-request columns in this batch. Future extensions should use a one-to-one case extension table, backfill within a transaction, dual-read during rollout, then remove legacy fields only after consumer migration. No schema cleanup of existing case columns in this batch.

Deferred: scheduler primary trigger (lazy issue stays safety net), FX, deeper supplier reconciliation, Finance role, external Client API, ZIP routing, VOID, and product-specific compensation policies.

Supplier receipts now record created_at for new receipts. Legacy rows retain NULL when recording time is unknown; no historical timestamp is fabricated. SERVICE_COST projections are Admin-only. Legacy DEPOSIT remains a Wallet credit, outside auto-FIFO and manual Apply Credit eligibility.

Internal SERVICE_COST remains in the Admin ledger, outside Client purchasing balance and Statement/AR. Existing client-associated ledger data was inspected: no SERVICE_COST entries were present, so this separation does not rewrite issued documents or alter existing balances.
