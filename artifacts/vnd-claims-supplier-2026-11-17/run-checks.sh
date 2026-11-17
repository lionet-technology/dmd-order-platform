#!/bin/bash
export PATH=/Users/quan/.nvm/versions/node/v20.20.2/bin:$PATH
cd /Users/quan/Developer/report || exit 1
out=artifacts/vnd-claims-supplier-2026-11-17
for gate in test build typecheck lint; do
 if [ "$gate" = test ]; then npm test > "$out/$gate.log" 2>&1; else npm run "$gate" > "$out/$gate.log" 2>&1; fi
 rc=$?
 echo "$gate=$rc" >> "$out/check-status.txt"
 if [ "$rc" != 0 ]; then exit "$rc"; fi
done
DMD_UAT_OUTPUT="$out" node scripts/e2e-vnd-v1.cjs > "$out/browser.log" 2>&1
rc=$?
echo "browser=$rc" >> "$out/check-status.txt"
exit "$rc"
