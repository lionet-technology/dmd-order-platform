# Payment reconciliation

## UI clarification — 20/10/2026

Admin credit detail is labelled **Xem Payment / Debt / Balance**, removing the obsolete reallocation wording. It remains a detail view with audited full rejection where allowed; partial actual-receipt correction belongs in Finance Payment Adjustment. No manual allocation action was reintroduced. See [current audit](STATUS-AS-IS-2026-10-20.md).

## Statement V2 operational integration — 20/10/2026 (current implementation)

This section supersedes earlier delivery-status notes below; approved business rules are unchanged. Statement V2 is connected to the active operational Ledger, Debt/allocations, daily interest and Refund events, with API and UI. `fc_*` remains inactive. See [implementation, evidence and remaining gates](VERIFICATION-STATEMENT-V2-2026-10-20.md).

Payment allocation now runs inside `addLedgerEntry`'s money-command transaction, so Sales/Admin receipt immediately settles accrued interest, then principal, then Balance surplus. Backdated `occurred_at` remains economic metadata; ascending Ledger IDs determine allocation sequence. Each first-posting surplus is frozen to Balance. A later Finance reduction can restore Debt without a subsequent financial read consuming a different older Payment's wallet surplus. Admin principal-first requests are rejected.

Statement V2 captures immutable allocation movements (Payment ID, Debt ID, amount and interest cents). A later Payment Adjustment appends projection deltas in the subsequent/current reporting period and never rewrites the issued allocation snapshot. Reconciliation still moves no money; no new Payment allocation targets Statement. Historical Statement-allocation adjustment guards remain. New Admin `allocate`/`apply_credit` commands are retired and denied before receipts/mutations; the UI no longer offers reallocation. Existing historical allocations are retained. Admin rejection remains an audited compensating reversal; Finance partial corrections use Payment Adjustment.


## Cutover ứng dụng 20/10/2026 (từng phần)
`credit.ts` đã ngừng tự phân bổ Payment vào Statement; auto allocation chỉ đến Debt (lãi/gốc) rồi số dư phần còn lại vào Balance. Statement quá hạn không chặn mua. Payment Adjustment áp dụng cho Payment mới không có legacy Statement allocation; các khoản lịch sử từng phân bổ Statement vẫn fail-closed đến khi migration. `credit_settlement_wallet_freezes` bảo toàn phần Payment dư từ trước khi Admin chuyển Balance sang Debt. **Chưa có** Statement snapshot đầy đủ hoặc migration dữ liệu cũ; không phải xác nhận production.

**Status:** confirmation/discrepancy implemented locally; linked Payment Adjustment implemented with a legacy Statement-allocation migration guard. Full Owner financial scope remains incomplete.

## Workflow and permissions

Sales Payment already affects the current wallet when posted. Finance opens Payment Reconciliation, filters by Client/name/reference/ID and status, selects up to 50 visible rows, adds evidence/reason and submits one atomic batch. API supports 1–100 rows. Finance can change CONFIRMED ↔ DISCREPANCY with a new reason; PENDING means no reconciliation event exists. Repeating the current status is rejected. Reversed Payments cannot be reconciled.

Only FINANCE writes reconciliation events. ADMIN/BOD read all Clients; SALES reads assigned Clients; CLIENT reads self; WAREHOUSE is denied. Finance receives no additional Client/Order/credit administration rights. Client and responsible Sales receive durable in-app notifications and recipient-only read acknowledgement. The 100 latest notifications are shown, including prior confirmations and discrepancies. External email/push delivery is not implemented.

Reconciliation does not create a receipt of money, undo Sales Payment, change allocation, create Debt or change Statement. A discrepancy requires a later linked Payment Adjustment; no automatic correction or suspicious-payment detector is added.

## Integrity

Every selected row includes its latest event ID (0 for PENDING). Under one immediate SQLite transaction, the server validates all rows, appends event/history and financial audit, creates notifications, and stores an actor-scoped request receipt. A stale row, duplicate Payment, missing Client, rejected Payment or notification failure rolls back the entire batch. Exact payload/key replay returns the original receipt; changed payload with the same key fails. UI preserves the key for retry of the same submitted payload.

Events, receipts, notifications and read acknowledgements are append-only. Once a Payment has reconciliation history, its original ledger row cannot be updated/deleted. CONFIRMED can later become DISCREPANCY without rewriting earlier evidence. The original immutable amount is captured in integer cents in every event. Amounts and prior Payment allocations are not recomputed by this service.

## API and storage

- `GET /api/payment-reconciliation`: paginated list (50 rows), `q`, `status`, `page`, optional `client_id`, scoped notifications.
- `GET /api/payment-reconciliation?ledger_id=…`: ownership-checked event history.
- `POST /api/payment-reconciliation`: `action=reconcile`, `request_key`, `status`, `reason`, `rows=[{ledger_id,expected_event_id}]`; `action=acknowledge`, `notification_id`.
- `src/lib/payment-reconciliation.ts`, `src/app/payment-reconciliation-workspace.tsx`, `scripts/verify-payment-reconciliation.cjs`.

## Migration and remaining scope

Schema is additive and never backfills a historical Payment as confirmed. Existing linked-Client credit Payments appear PENDING until Finance reconciles them. Unowned legacy rows do not appear and require explicit ownership reconciliation; no Client is guessed from a display name. There is no operational DB reset. Reconciliation evidence cannot be rolled back by deleting source alone after activation; retain its schema/history on rollback.

Payment Adjustment, replacement Debt and allocation only to Debt interest/principal plus Balance, immutable full financial Statements, unified BOD reports and historical migration remain open. Current legacy FIFO still exists and is not approved target behavior. See [Owner target](OWNER-FINANCE-2026-10-20.md). Do not interpret this subset as completed financial release.

## Linked actual-receipt adjustment — 20/10/2026

Only FINANCE submits `action=adjust_payment` on the existing API with `ledger_id`, `actual_cents` (integer 0–100 billion cents), `expected_adjustment_event_id` (0 initially), `reason`, `request_key`. Finance opens the per-Payment adjustment/history panel; Admin/BOD/all scoped Sales/Client histories are read-only. `GET ?adjustment_ledger_id=…` returns immutable original amount, effective actual receipt, latest adjustment version and history. `action=acknowledge_adjustment` accepts a recipient-owned notification ID.

The original Payment never changes. `PAYMENT_ADJUSTMENT` rows carry the signed receipt delta and link the original Payment; direct generic Ledger posting of this type/reference is rejected. Neither adjustment rows nor the adjusted Payment are automatically allocated to Statements. Legacy FIFO is materialized inside the transaction before validation; if any original allocation points to a Statement, the entire adjustment fails with an explicit migration message. Multiple unpaid legacy Debts block increased allocation. No reset, guessed mapping, fake fee or fake Statement is used.

For supported Payments, the original unallocated receipt portion is consumed first on reduction, then paid principal, then paid interest. This restores the existing Debt; it creates no new Debt or Order cancellation. On increase, current Debt interest precedes principal, then surplus. Full signed receipt delta is recorded in the historical ledger; the existing Debt exclusion offsets the allocated portion in net Balance. Writing only the surplus into this legacy ledger would count Debt twice. Original allocation is frozen against future FIFO, and Admin reject/manual allocation overrides are denied after an adjustment. Adjustments retain before-allocation and change snapshots, audit, actor, reason, request receipt, and durable Client/Sales notifications in one immediate transaction. A failing audit/notification/snapshot rolls back money and allocations.

Reconciliation stores original and current actual cents separately. Historical reconciliation rows retain their original amount; an additive nullable actual-cents column preserves compatibility, including actual zero. A same-status confirmation can be appended after an amount change. UI shows the original/current amounts and warns when the latest reconciliation amount differs; confirmation itself never moves money. Recent activity identifies adjustments separately from service usage.

Sources: `src/lib/payment-adjustments.ts`, the existing reconciliation service/API/UI, `scripts/verify-payment-adjustments.cjs`, `scripts/payment-adjustment-worker.cjs`. This adapter does not activate `fc_*` or certify the global financial migration. Payment Adjustment remains unavailable for legacy Statement allocations; complete Financial Statement snapshots, enduring Statement-independent Debt, BOD cash-flow parity, historical restore rehearsal and full Owner UAT remain open. Evidence: [current verification](VERIFICATION-PAYMENT-ADJUSTMENTS-2026-10-20.md).
