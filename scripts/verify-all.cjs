const {spawnSync}=require("node:child_process");
const path=require("node:path");
const suites=["verify-rbac","verify-operations","verify-purchase-engine","verify-order-flow","verify-credit","verify-owner-credit","verify-balance-idempotency","verify-debt-reconciliation","verify-domain-finance","verify-epacket","verify-manifest-cartons","verify-route-segmentation","verify-supplier-payables","verify-order-cancellation","verify-legacy-migration","verify-template-download","verify-release-gates","verify-sla-demo","verify-tracking-sheet-scope","verify-finance-filters"];
suites.push("verify-financial-core","verify-refunds");
suites.push("verify-payment-reconciliation","verify-payment-adjustments","verify-bod-finance-report","verify-statements-v2");
suites.push("verify-bulk-recovery","verify-client-carton-groups","verify-client-carton-api");
suites.push("verify-financial-projection","verify-debt-age","verify-debt-aging-opening");
suites.push("verify-balance-debt-aging-split","verify-emergency-hold","verify-supplier-account");
suites.push("verify-sales-monthly-close");
suites.push("verify-internal-expenses");
suites.push("verify-supplier-privacy","verify-egress-content");
const env={...process.env,NODE_ENV:"test"};
// Every suite must select its own disposable DB; never inherit a DB selected by an operator.
delete env.DMD_DB_PATH;delete env.DMD_VERIFY_DB;
for(const suite of suites){
 console.log("\nSUITE "+suite);
 const result=spawnSync(process.execPath,[path.join(__dirname,suite+".cjs")],{cwd:path.resolve(__dirname,".."),env,stdio:"inherit"});
 if(result.error||result.status!==0){console.error("FAILED: "+suite);process.exit(1);}
}
console.log("\nALL DOMAIN SUITES PASS ("+suites.length+" suites)");
