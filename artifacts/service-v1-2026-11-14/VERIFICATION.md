# Verification — Service Architecture V1 increments

Date: 14/11/2026. Frozen application/test source: **365e40e0364571bceb2fa57a2557a96fcf9a94aa**.
Repository: lionet-technology/dmd-order-platform, main, including Supplier Cost merge bcb24cb/32423f0.
Runtime: Node **20.20.2 ARM64**, native ABI **115**. SQLite was exercised by the full domain suites on disposable DBs.

## Results
| Check | Result | Evidence |
|---|---|---|
| Complete domain regression | PASS, **49 suites** | domain-release.log |
| V1 Configuration | PASS, 27 checks | final domain log |
| V1 Pricing | PASS, 27 checks, including two independent SQLite publish writers | final domain log |
| UPS formula/rounding/globals | PASS, 37 checks | final domain log |
| UPS account publication | PASS, 18 checks | final domain log |
| Supplier Cost incoming changes | PASS | final domain log |
| TypeScript | PASS, exit 0 | direct tsc --noEmit at final source |
| Full ESLint | PASS, exit 0 | direct eslint . at final source |
| Isolated production build | PASS; compiled/generated routes include V1 APIs | build-release.log |
| Documentation links / whitespace | PASS | link existence check + git diff --check |

## Reproduce
Use a Node/native SQLite installation with matching architecture/ABI. From repository root:
```sh
NODE_ENV=test NODE_OPTIONS='--require=./scripts/verify-typescript-loader.cjs' node scripts/verify-all.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node scripts/build-isolated.cjs
```
The test runner strips inherited DMD_DB_PATH/DMD_VERIFY_DB; each suite owns its disposable DB. The build wrapper forces a new temporary DB even if operator environment selects another one. No Jenkins.

## Limits
PASS covers the staged backend and existing domain regression. It does not certify actual rate correctness, operational VNĐ Purchase/ledger, full browser UAT, separate Fulfillment, Client Add-on or production deployment. Excel provenance metadata is not a workbook acceptance check. Tests use explicitly synthetic rates/policies; none were activated operationally.

Earlier domain-baseline/domain-integrated/domain-final logs are preliminary runs, not the final frozen-source claim. Only domain-release.log corresponds to the final source above. The later documentation/evidence commit does not change application/test code.

[Remaining engineering and required sources](HANDOFF.md).
