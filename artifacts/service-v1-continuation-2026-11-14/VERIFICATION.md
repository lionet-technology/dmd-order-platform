# Service V1 continuation — 14/11/2026
Repository /Users/quan/Desktop/report; origin git@github.com:lionet-technology/dmd-order-platform.git; branch main. Starting HEAD verified 254f9b9ee1dd67f76da96201d08d207108236643. Checks below cover this continuation's working tree before commit.

## Delivered
- Approved Decisions / Feature 23 / V1 Specification now record Owner's approved weight steps, rate-unit bands, Broker 3% discounted transportation Net and Customs 10,000 VND/kg as Global inputs; ePacket thresholds/non-cont list; shipment surcharge once per Lot.
- UPS approved Sub-Service rounding helper (explicit divisor), rate bands/unit validation, inclusive singleton rows; tie-break still rejects. No supplied account is silently dropped.
- ePacket strict longest-side classification and US non-cont list. Actual surcharge is null, price_ready=false.
- VND selected-row quote endpoint combines current configuration, published selling document and Client Discount. Immutable SQL snapshots/history, actor/time/request replay, scoped access and allowlisted public output. No money rounding; no fund movements.

## Validation
Runtime /Users/quan/.nvm/versions/node/v20.20.2/bin/node (Node 20.20.2 ARM64, matching installed better-sqlite3).
- All 50 domain suites PASS: tests.log. Includes existing RBAC, purchase consent, Credit/Debt, ledger/idempotency and pricing suites; UPS core 79 checks; account publication 18 checks; new quote suite.
- Standalone tsc --noEmit PASS. Isolated build also runs TypeScript successfully.
- Full repository ESLint PASS: lint.log (empty output, exit 0).
- Isolated Next build PASS: build.log, includes /api/service-v1/quotes.
- git diff --check PASS.

Execution: PATH set to the Node directory plus system paths. Tests ran NODE_ENV=test NODE_OPTIONS=--require=./scripts/verify-typescript-loader.cjs node scripts/verify-all.cjs. Build ran node scripts/build-isolated.cjs, which forces its own new temporary DB. The suite runner removes inherited DB paths; service V1 fixtures set fresh OS temporary test.db paths. Synthetic fixture filenames explicitly identify TEST ONLY. No reset/migration of the operator DB and no production access.
Initial runtime attempts were unsuccessful: default PATH had no Node; Node22 x86_64 could not load the ARM64 SQLite addon. These are not test passes; final checks used the matching Node20 runtime without reinstalling dependencies.

## Boundaries / next work
Owner explicitly deferred actual rate-card-dependent work. No real Net Excel or VND ePacket surcharge/FX supplied. No guesses from images/PDF. Dimensional divisor and detailed source intervals/coverage remain explicit input; UPS ties remain OPEN.
Quote endpoint is a selected-row preview, purchase_eligible=false/operational_cutover=false. Automatic Draft weight/zone mapping, full surcharges, operational consent, VND Reserve/Charge/ledger/Statement and whole-flow snapshot/history integration remain incomplete; existing USD operational money is unchanged. No UI/browser/UAT, carrier/pilot acceptance, production cutover or Jenkins.
Pre-existing AGENTS.md changes and untracked Codex/ are excluded from the continuation commit.
