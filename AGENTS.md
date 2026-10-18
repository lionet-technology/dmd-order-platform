<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## DMD Feature Documentation Contract

Before changing behavior, read `docs/Feature/README.md`, `docs/Feature/DECISIONS-2026-10-13.md`, `docs/Feature/ROADMAP.md`, `docs/Feature/CONTRIBUTING.md` and relevant feature docs. `docs/legacy-logic/` is historical only, not a source of approved current requirements. Every behavior-changing code change MUST update feature Markdown in the same change (or explicitly document why there is no documentation impact). Reconcile code, tests and current docs; mark proposed/unverified logic as such. Never silently overwrite business decisions. Include relevant regression verification and update dependent feature docs for cross-module money/status flows.
