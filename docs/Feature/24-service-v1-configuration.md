# Service V1 staged configuration — CURRENT increment 14/11/2026

Backend/API foundation only. V1 operational cutover remains OPEN; legacy pricing/Purchase is unchanged.

Owner/root ADMIN can GET/POST /api/service-v1/configuration. Each immutable version belongs to the existing full route identity, contains explicit VND, adapter and destination country codes. API has no activation switch and cannot write selling prices, account data or ledger. This is preparation for V1, not proof a route can be purchased in VND.

Save requires expected_revision and request_key. Immediate transaction serializes writers; stale revision rejects. Same actor/key/normalized payload replays the stored version; key reuse with different payload/actor rejects. Invalid input or insertion failure rolls back. No updates/deletes of committed config versions. Archived/deleted/warehouse-held routes reject new configuration; existing lifecycle and Client service scope remain authoritative.

Root Owner permission follows existing pricing access pending detailed V1 RBAC decisions. Sales, regular Admin, Client and anonymous cannot read/write this configuration. No general transport Cost permission was expanded.

Source: service-v1-config.ts, service-v1-schema.ts, /api/service-v1/configuration/route.ts; schema installed additively by db.ts.
Regression: scripts/verify-service-v1-config.cjs (disposable SQLite: idempotency, stale edits, validation, rollback, immutable SQL, no live-route mutation, HTTP authorization, restart).
Still missing: UI configuration, adapter integration/activation, actual Excel rates and VNĐ financial cutover. [Target](DMD_Order_Platform_Service_Architecture_V1_Specification.md).
