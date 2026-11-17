#!/bin/bash
export PATH=/Users/quan/.nvm/versions/node/v20.20.2/bin:$PATH
cd /Users/quan/Developer/report || exit 1
out=artifacts/local-workspace-vnd-2026-11-17
npm test > "$out/test.log" 2>&1
rc=$?
echo "test=$rc" > "$out/check-status.txt"
if [ "$rc" != 0 ]; then exit "$rc"; fi
npm run build > "$out/build.log" 2>&1
rc=$?
echo "build=$rc" >> "$out/check-status.txt"
if [ "$rc" != 0 ]; then exit "$rc"; fi
npm run typecheck > "$out/typecheck.log" 2>&1
rc=$?
echo "typecheck=$rc" >> "$out/check-status.txt"
if [ "$rc" != 0 ]; then exit "$rc"; fi
DMD_UAT_OUTPUT="$out" node scripts/e2e-vnd-v1.cjs > "$out/browser.log" 2>&1
rc=$?
echo "browser=$rc" >> "$out/check-status.txt"
exit "$rc"
