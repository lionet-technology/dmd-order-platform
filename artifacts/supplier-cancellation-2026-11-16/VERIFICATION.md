# Cancellation / Supplier follow-up verification — 16/11/2026
Repository: /Users/quan/Desktop/report. Origin: git@github.com:lionet-technology/dmd-order-platform.git. Starting main HEAD: 6279d417cccc5a6db4214fe8d9aa0f867b2791fc.
Pre-existing AGENTS.md change and untracked Codex/ preserved and excluded from this increment.

Implemented: ordinary cancellation Owner 100/90, ADMIN support 100, shipped deny; atomic original-Supplier pending record, archived Tracking/Label snapshot, append-only status/history, scoped filter/UI and separate role-gated API. No Supplier money/cost posting.
No production/carrier/Jenkins activity. Tests use disposable databases; Next build uses build-isolated.cjs disposable DB.

PASS:
- npm test: ALL DOMAIN SUITES PASS (52 suites), regression.log.
- verify-order-cancellation.cjs: 128 assertions.
- verify-supplier-cancellation.cjs: 32 assertions.
- e2e-supplier-cancellation.cjs: 28 HTTP assertions, owned temporary DB/server, all six roles, concurrent cancellations/follow-up retries, filters, support and rollback; http.log.
- npm run lint, lint.log.
- npm run typecheck, typecheck.log.
- npm run build, build.log.
- git diff --check.

Environment findings: shell PATH initially omitted Node/npm. Node v22 is x86_64 while installed SQLite native module is arm64; use /Users/quan/.nvm/versions/node/v20.20.2/bin. Existing duplicate generated “ 2.ts” files under .next/types caused TypeScript conflicts; moved only those generated copies to a temporary backup, not source changes.
HTTP test caught requireUser intentionally rejecting Finance/BOD on generic operational routes. Fixed the new Supplier follow-up route to use existing requireAnyRole with exact ADMIN/FINANCE/BOD membership, without broadening generic permissions. Rebuilt and reran successfully.

Unfinished: full Cancel & Duplicate, unified Edit/Client confirmation/Sales override, operational VND Purchase/ledger and real Excel import/mapping. No browser UI acceptance or production rollout claimed.
Excel source located read-only at /Users/quan/Downloads/Bảng Net Cost Dịch vụ.xlsx. No rates were guessed or seeded into operational DB.
Owner requested concrete questions for further discussion. Only pending-consent Reserve handling and atomic failure behavior of new Duplicate Purchase are presented as proposed choices; established 100/90/ADMIN/VND/FX rules are not reopened.
