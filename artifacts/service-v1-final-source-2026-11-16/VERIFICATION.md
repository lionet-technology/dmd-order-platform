# Final (2) source + automatic VNĐ Purchase — verification

Completed 17/11/2026, Asia/Ho_Chi_Minh. V1 remains PARTIAL.
Baseline local HEAD da5e375bcb069c0a07975ed211dcaea7c518020c; initial working tree contained unrelated AGENTS.md modification and Codex/. These are excluded from task commits.
Source reconciliation commit: 7916b14.
Code / tested source commit: 3929b72. Source and implementation are followed by a documentation-only evidence commit. Push uses normal fast-forward origin/main; remote SHA is verified after push.

## Actual source opened

Original attachment recovered via read_thread for ChatGPT conversation 6ad35267-1ad8-83ec-a691-9d80c58281df. The /mnt/data path is not available on this host; the attachment preview supplied the actual same Unicode-named file, 60,966 bytes.
Canonical workbook: docs/data/service-v1/net-cost-final-2.xlsx.
SHA256 a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2.
Normalized JSON SHA256 9c1accd230b1ab8f52d724cfc872c43c4fb267ba60ef546563faecaebd314679.
3 actual sheets; 335 ePacket/Yun rate cells; 3,360 UPS rate/unavailable cells; 249 source zone rows. Source fixed VND fees 135000 / 285000 / 405000 verified directly.
See docs/Feature/SERVICE-V1-SOURCE-INDEX.md and Feature 34 for cells, precedence and implementation limits. No need to resend the MD handoff or workbook.

## Final gates

- npm test: PASS, 57 suites. Log test.log.
- Real-source resolver: PASS, 44 assertions (tier edges, 55/75 dimensions, non-cont, FX independence, EU/Yun markets, source China South, UPS unavailable rates/rounding/max/full formula).
- Automatic VNĐ: PASS, 38 assertions. Actual final source + disposable database; ePacket Standard, EU and Yun operational requests, consent, funds/FIFO, FX repricing, old reserve retention, one-time charge, frozen issued snapshots, manual offers, server scope/privacy, rollback, missing publication preserving a Payment, and rejecting fabricated Net rows bearing the right source filename.
- Existing manual VNĐ: PASS, 63 assertions, including independent-writer retries, money rollback and cancellation.
- npm run typecheck: PASS. Log typecheck.log.
- npm run lint: PASS. Log lint.log.
- npm run build: PASS, isolated disposable build DB. Log build.log.
- git diff --check: PASS.

Validation used existing arm64 Node 20.20.2 to match the installed native SQLite dependency. Build regenerated generated Next type output before final typecheck. No dependency reinstall, operator DB reset, Jenkins, deployment, supplier API or production action.

## Delivered and remaining

Delivered: authoritative source retention/provenance; server resolver; ePacket Standard/Eco/EU + Yun operational VNĐ adapter using existing config and Net/Proposal Review/Publish; exact decimal published fields; immutable internal quote history; source API and configuration UI. Eco shares the tested US adapter and its real source rows; separate end-to-end Eco browser acceptance remains open.

UPS resolver is tested only, not published-account/operational Purchase integration. No automatic US-selection-to-ePacket-EU routing, unified Shipping Edit, Cancel & Duplicate, Client Add-on, VNĐ Statements/Debt/reporting/claims/supplier cutover or full role browser UAT is certified.
No existing operator routes were automatically imported/published; configured source import remains an explicit root Admin workflow.
V1 is not production-ready. No business rule was invented to fill the remaining gaps.
