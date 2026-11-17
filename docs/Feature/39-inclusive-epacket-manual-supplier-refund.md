# Inclusive ePacket Net and manual Supplier refund choice
**Status: approved Owner clarification 17/11/2026; implemented and verified on synthetic data; V1/pilot still partial.**

Workbook Standard/Eco Net includes mid-mile + last-mile; detailed component accounting deferred. Report coverage labels describe workbook scope, not certification of Supplier documents or finalized GP. Missing Actual remains missing; no amounts, quotes, ledger, cost or historical Statements are rewritten. No extra mid-mile posting is inferred.

Supplier follow-up remains manual. New VNĐ-only Admin choice: AMOUNT (explicit nonnegative amount) or PERCENT (explicit nonnegative Supplier-cost basis, percentage 0..100). Amount is computed using exact decimal strings; percentage never uses Client revenue or an inferred basis. Evidence is required. Choice is an immutable operational record attached to its follow-up event, not a receivable, carrier confirmation, cost reversal, Client refund or Bank receipt. RESOLVED still only closes follow-up. Finance/BOD may update status but cannot author the Admin choice. The existing explicit Supplier financial permissions stay unchanged. Legacy USD follow-up is not relabelled VNĐ. Policy values and carrier proof must be configured per service/route, never seeded from TEST fixtures.

Code: vnd-reporting.ts, supplier-cancellation.ts, supplier-cancellation-workspace.tsx; regression: verify-vnd-supplier.cjs, verify-supplier-cancellation.cjs, e2e-vnd-v1.cjs. Existing Claim/receivable journals remain separate; cancellation with deactivated Tracking is not silently turned into a new active-Tracking Claim.

## API and data
Existing `/api/supplier-cancellations` POST optionally accepts refund_choice `{mode:AMOUNT,amount,evidence}` or `{mode:PERCENT,basis,percent,evidence}`; nonnegative finite decimal strings, percent <=100, active ADMIN on a VNĐ Order only. Status note, expected_event_id and request_key remain required. Immutable `supplier_cancellation_refund_choices` links one canonical choice to the same transactional event/audit. History returns choice_json to authorized Admin/Finance/BOD only. Retry conflict includes canonical choice; stale event and audit failure roll back the entire choice. Amount choice can record 0 (no Supplier refund); no policy/amount is inferred.

The follow-up panel is also accessible from `/vnd` for Admin/Finance/BOD; only Admin sees choice inputs. Estimate coverage report is `WORKBOOK_INCLUSIVE_MID_LAST_MILE`, component_breakdown `DEFERRED`; actual status remains APPROVED_TOTAL/MISSING_ACTUAL, not automatic FINALIZED. Old issued Statements and earlier verification artifacts are historical and unchanged.

Verification: `artifacts/owner-coverage-supplier-choice-2026-11-17/VERIFICATION.md`; targeted 47/37 assertions, five-role Chrome 52 checks, build/typecheck/lint PASS. Full-suite result recorded in the artifact. Per-service Supplier policy/void evidence setup remains required.
