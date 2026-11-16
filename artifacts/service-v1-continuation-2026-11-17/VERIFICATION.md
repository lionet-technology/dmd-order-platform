# V1 continuation — verification 17/11/2026 (Asia/Ho_Chi_Minh)

Status: bounded new-account VND implementation; full V1 remains PARTIAL. No production acceptance.

## Verified baseline and authoritative inputs

- Initial local main and remote main: 3c6811aa3728ae424b7ed9805a7a7936abccf207. Re-fetched origin/main before task commit; still unchanged.
- Existing AGENTS.md modification and untracked Codex/ are unrelated and excluded from task commits. No Jenkins/production/Supplier API or default operator database action.
- Read prior final-source verification, required Feature index/Decisions/Roadmap/Contributing, Approved Decisions, handoff and affected Order/Finance/RBAC/UPS docs.
- Opened actual final workbook through scripts/import-final-net-cost.py parse(), read-only: 60,966 bytes, sheets ePacket/Yun Express/UPS, SHA256 a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2. Canonical XLSX and normalized JSON are unchanged.
- Source variables/markups and special zones verified; old workbook (1)(1) is not used.
- Gap-review-first commit: 65b6596. Implementation + tested artifacts commit: 647ee72. The following commit changes documentation only; no behavior change after verification.

## Owner clarification, closed

Handoff §5 left Service change after manual offer explicitly OPEN. Owner chose: require a new offer or explicit automatic pricing selection, then consent; retain reserve while pending. Implemented server-side and documented in Feature 35/Approved Decisions. No other previous decision was reopened; no outstanding clarification blocks this delivered slice.

## Delivered

See docs/Feature/35-service-v1-completion.md for exact behavior and interfaces.

1. UPS: final-source account draft import including wholly unavailable accounts; independent Review/Publish; per-zone components; full exact Net formula and minimum full-Net account selection per Lot; SDS→VTT→JD tie, (min,max], FIXED/PER_KG, 5000 divisor and approved carton/Lot rounding. Source o never becomes zero or an invented rate; unknown intervals/zone/max fail closed. China requires explicit SOUTH/OTHER, preserving special source codes.
2. Same VND Purchase/consent/Reserve/FIFO/Charge/Ledger engine. Current published accounts supply estimated Net; selling publication retains its account-version basis. Confirmed globals reapply to both without activating account drafts. Pending changed Selling requires consent even after later top-up. Issuance freezes snapshots; generic and configured purchase export include supplier account per Lot/carton.
3. ePacket EU routing stays inside ePacket, checks source market, active configuration and Client eligibility; exactly one candidate or explicit error. Applied at creation/edit and first Purchase of an existing unissued Draft. No Yun or US silent fallback.
4. Separate Admin shipping edit with carton/Lot edits and region selection; any Tracking OR Label blocks shipping. Offer/correction and Add Tracking/Label remain distinct. Service change after manual offer implements Owner decision.
5. Admin Cancel & Duplicate: configured per-Service refund on collected current revenue including corrections/fees/taxes, supplier follow-up, linked replacement Purchasing with fresh quote and no copied issuance/reserve/charge/cost snapshots. Price/funds pending keep valid cancellation; technical failure rolls back atomically; receipt replay returns the same replacement.
6. Client Add-on: exact revenue delta posting, cost pending/null, cost-only edit without Balance movement, free-text supplier, scoped Sales exception, Client privacy, immutable revisions/history. Postings may exceed credit without auto Debt or removing reserves.
7. New-account VND Statements/Debt/reporting: immutable openings/closings/journal cursors and consecutive periods, activation opening guard and late postings; explicit manual Debt, prospective simple daily interest and independent deadline; Payment interest→principal→Balance; no fake payment or double room release; overdue checks. BOD-only monthly performance/cash projection marks unavailable actual cost/GP. Claim Refund is explicitly NOT_ACTIVATED, never fake zero.

## Final verification

- npm test: PASS, 59 suites. test.log. Includes existing independent-writer reserve/financial regressions, final-source 44, automatic VND 38, manual VND 63.
- New operational continuation regression: PASS, 37 assertions, actual final source + disposable DB. UPS quote oracle, reserve/consent/funds/global update, account draft isolation, account export, charge/frozen snapshot, China South, wholly unavailable Express accounts, EU creation and existing-Draft routing, manual-offer Service change, Duplicate refund/replay and rollback, Add-on credit/cost/privacy.
- New VND finance regression: PASS, 39 assertions, disposable DB. Manual transfer conservation, exact interest, read-only projection, Payment order, one-time settlement, immutable Statement balances, posting after finalize, permissions and rollback. financial-cutover.log.
- UPS account publication targeted recheck: PASS, 18 checks. ups-accounts.log.
- npm run build: PASS on disposable build DB. build.log.
- npm run typecheck: PASS. typecheck.log.
- npm run lint: PASS. lint.log.
- git diff --check: PASS.

Full regression ran once after correcting a backward-compatible account validation error message. After final localized changes to existing-Draft routing, Statement opening guard and unavailable preview, affected regressions, build/typecheck/lint and browser UAT were rerun; no behavior change is left unverified.

## Browser UAT (actual Chrome)

PASS: 13 assertions, five authenticated roles on a localhost production build and owned disposable DB. browser.log and browser-uat.json; screenshots uat-admin-desktop.png, uat-client-mobile.png, uat-finance-statement.png.

Admin: creates Add-on and edits unissued shipping through UI. Sales: assigned-Client Add-on cost/supplier visibility. Client: Add-on readable, supplier/cost absent both UI and HTTP. Finance: finalizes immutable VND Statement through UI. BOD: VND monthly report available; Admin direct report access denied. No page errors. Client mobile has no page overflow; tables scroll within their containers. Desktop and mobile screenshots visually inspected.

The browser connector was unpaired. The initial system Chrome launch selected x64/Rosetta and closed; the runner now launches ARM Chrome explicitly through an owned temporary wrapper. Subsequent actual Chrome runs passed. Generated duplicate Next type files from the existing environment caused an initial standalone typecheck conflict; the isolated build regenerated types and final typecheck passed. No package reinstall or machine/browser preference change.

This is targeted five-role UAT, not full manual acceptance of every UPS tier, all role/device workflows, real Supplier template/onboarding or live carrier behavior.

## Git completion

Implementation committed as 647ee72 after the gap-first 65b6596. Staged-path inspection confirmed no AGENTS.md, Codex/, Jenkinsfile, jenkins/ or canonical workbook/JSON changes. All intended code, tests, Feature docs and evidence are committed. Normal origin/main fast-forward push and post-push SHA verification follow this documentation-only addendum; the final chat records the resulting evidence commit SHA.

## Remaining V1 gaps / boundaries

- Legacy USD migration/certified opening/cutover is not implemented by this new-account slice.
- VND Claim/Refund pool, bank/balance execution/recovery and Supplier actual/payable/claim financial cutover remain incomplete; old USD modules are not relabelled.
- Full Sales commission/refund-category reporting and complete actual-cost performance reporting remain incomplete. BOD report is a bounded monthly projection; actual GP unavailable until reconciliation.
- Fully automatic Statement scheduling/period policy, broad configuration RBAC target (current root Admin), complete pricing-mode acceptance, full Supplier workflows and broad pilot/browser matrix remain open.
- Real Supplier cancellation/void policy must be explicitly configured before activation. Unsupported/ambiguous destinations and missing published rates fail; no mapping, rate, cancellation percentage or automatic Supplier send was invented.
- No Jenkins, deployment or production action; no claim of production readiness.
