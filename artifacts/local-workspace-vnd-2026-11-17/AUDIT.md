# Canonical workspace audit — 17/11/2026

Canonical workspace: `/Users/quan/Developer/report`; connector roots verified to point here.

- Initial local main and fetched origin/main: `16fecf75b07de5f9fc192e0af13c30f427b7f5a8`, ahead/behind 0/0.
- git rev-parse resolves the new root. git fsck --full exit 0: dangling objects only, no missing/corrupt objects. No pruning performed.
- AGENTS.md, packed-refs, package.json, package-lock.json, feature docs, prior verification and final workbook read successfully. All 771 initially tracked files read to EOF. No tracked path missing.
- New workspace walk (excluding node_modules and generated build/smoke caches): no dataless flags or symlinks. packed-refs flags 32768 are not the dataless flag; its content reads normally.
- Canonical workbook: 60,966 bytes, SHA256 a41d4e540f8e0023b859b32c6b415d744a6c9e095dd3f3b3a4590327b9fb68d2, matching prior verification.
- Old copy became fully readable during audit. Read-only comparison excluding .git/node_modules/build/smoke caches: 1,716 files, none missing from new copy; only root/config/Codex .DS_Store differ. All 147 reachable old commits are present in new copy. Both initial HEAD and status match. Nothing copied from old location.
- Preserved owner-modified AGENTS.md and untracked Codex/. Only active AGENTS documentation root changed to Developer per explicit owner request; this existing owner change remains unstaged and excluded from task commits. README updated in task commit. Historical evidence and archived Codex scripts retain original paths; they were not executed or modified.
- No active tracked source/script/config Desktop path found. No symlink back to Desktop. No reset, deletion, synchronization, Jenkins or production operation.
- Runtime discovery: connector shell PATH had no Node. Installed Node 22 is x86_64 and incompatible with copied arm64 SQLite binary. Existing Node 20.20.2 is arm64 and successfully runs SQLite/regressions; selected explicitly without package reinstall or machine preference change.

Dependency/build caches were not byte-compared; their practical validation is the regression/build/browser execution. This audit does not certify production deployment or recover unreachable historical work beyond the readable copies/Git objects inspected.
