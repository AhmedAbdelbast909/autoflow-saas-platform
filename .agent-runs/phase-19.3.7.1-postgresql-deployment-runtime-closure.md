# Phase 19.3.7.1 — PostgreSQL Deployment Runtime Closure Report

Date (UTC): 2026-09-07. NO COMMIT. NO PUSH. Production PostgreSQL never touched. No prod credentials used, changed, or exposed.

## 1. Executive Summary

Closed the exact evidence gap left by commit 622e4aeb: `prisma migrate deploy` had never run against a reachable PostgreSQL. Built a disposable `postgres:15` container and executed the REAL repository deployment path twice (73/73 migrations, 0 failures, clean-room reproduced), verified schema parity for the deployed chain, booted the app (HTTP 200, no P1012), and passed 14/14 runtime smoke tests. Matrix A–G verified the guard contract. The independent reviewer first returned FAIL (legitimate P1: `generate_database.sh` wrongly failed fast), the defect was fixed in source and re-verified at shell level, and the reviewer then returned PASS with 0 findings. One code change beyond 622e4aeb was required (conflict fail-fast + generate warn-and-continue); it exists in the working tree, uncommitted per phase policy.

## 2. Starting State

- `evolution-api` main @ `622e4aeb`, working tree CLEAN at phase start.
- Prior validation (validate PASS, guard simulation PASS, bash -n PASS, pushed) — but REAL migrate deploy = NOT TESTED (PG unreachable).
- Docker daemon initially DOWN; started via Docker Desktop (v29.1.2). Pre-existing local stack (`evolution_api`, `evolution_redis`, stopped `evolution_postgres`, stopped `pg19_3`) observed and NEVER touched.

## 3. Commit Under Test

`622e4aeb` — `Docker/scripts/deploy_database.sh`, `Docker/scripts/generate_database.sh` (URL↔URI mapping, redacted echo, fail-fast), `runWithProvider.js` (fail-fast guard for live commands, warn for generate). Prisma 6.19.0 local. `postgresql-migrations/` holds ~73 migration dirs; `prisma/migrations/` is untracked deploy staging.

## 4. Environment Contract

| Variable | Defined by | Consumed by |
|---|---|---|
| `DATABASE_CONNECTION_URI` | `.env` / compose `env_file` / operator env | Prisma datasource (`postgresql-schema.prisma:13`), `runWithProvider.js` guard |
| `DATABASE_URL` | some operator envs only | NOTHING in Prisma; historically echoed (empty) by deploy scripts |
| `DATABASE_PROVIDER` | `.env` (default `postgresql`) | `runWithProvider.js`, both `.sh` scripts |
| `DATABASE_BOUNCER_CONNECTION_URI` | bouncer setups only | `psql_bouncer-schema.prisma` only (out of scope) |

Invariant enforced: every live-DB prisma invocation receives a valid URI matching the active datasource contract. `env_functions.sh` naive parser (`tr -d '[:space:]'`) noted as fragility, not changed (out of scope).

## 5. Variable Mapping Analysis

- 622e4aeb mapped URL→URI in `.sh` scripts only. Gap found: `runWithProvider.js` had NO mapping, so URL-only environments still hit its guard (matrix case B initially GUARD-BLOCK). Fixed in source (this phase).
- New policy (user-approved): conflicting values fail fast (deploy + runWithProvider); generate warns and continues.

## 6. Previous Failure Reproduction

Case D (both vars absent) through real `runWithProvider.js`: exit 1, message `DATABASE_CONNECTION_URI is not set, refusing to run ...`, Prisma process NEVER spawned (no P1012 reachable — the wrapper blocks first). Step 4 VERIFIED.

## 7. New Guard Verification

Matrix via `runWithProvider.js` from bare temp cwds with crafted `.env` (local prisma 6.19.0 binary, dummy creds, closed ports): A URI-only → reached Prisma (P1001, not P1012) PASS; B URL-only → mapped, reached Prisma PASS; C identical → proceeds PASS; D absent → GUARD-BLOCK, prisma not invoked PASS; E conflict → new fail-fast conflict error, no prisma PASS; F malformed → Prisma P1012 (documented: guard cannot cheaply pre-validate; fail-fast covers absence, Prisma covers malformation); G generate without URI → warns, exit 0 PASS.

## 8. Disposable PostgreSQL Environment

Fresh `postgres:15` container `pg19371`, PG 15.19, host 127.0.0.1:5433, DBs `deploy19371` (run #1) + `deploy19371b` (run #2), test-only creds, isolated volume `pg19371data`. Fully removed afterwards (container + volume verified gone). All outputs redacted.

## 9. Real migrate deploy Run #1

Staging mirrored via robocopy from `postgresql-migrations` (73 dirs + lock file, exact). `prisma migrate deploy` with disposable URI: exit 0, ~3.7s, **all 73 migrations applied**. `migrate status`: "73 migrations found… up to date". `_prisma_migrations`: 73 finished, 0 failed/rolled back. 84 base tables.

## 10. Clean-room Run #2

Fresh empty DB `deploy19371b`, same untouched staging mirror: exit 0, ~3.2s, all applied, 0 failed. Identical outcome, no manual patching, no `docker cp`. REPRODUCIBILITY VERIFIED.

## 11. Schema Parity

88 schema models, 0 `@@map`, 84 tables: all 88−18 present; 7/7 enums; 84 PKs, 58 FKs, 9 UNIQUE incl. `Message(instanceId,providerMessageId)`, `WebhookDestination(instanceId,name)` family, history/delivery tables (`HistorySyncState, WebhookDelivery, WebhookDeliveryAttempt, WebhookDestination`) present. **Known pre-existing drift (not this phase, not the deploy path): 18 schema models (Billing*, Automation*, GovApiKey, ConversationAiState, AiCostRecord…) have no CREATE TABLE migration** — the phase-17 migration itself documents their absence from pre-phase-16 lineages. Chain parity PASS; drift itemized as P2 follow-up (new migrations = out of scope here).

## 12. Application Startup

`db:generate` exit 0. Booted real app (`tsx src/main.ts`) against disposable PG on an isolated port: **HTTP 200 on `/`, no P1012**, exit 0. Two honest observations: `redis disconnected` (no redis in disposable env; app degrades, still serves — environmental) and `GovAuditEvent table does not exist` during security-service init (same §11 drift class; caught, boot continued, HTTP 200 — reported, not hidden).

## 13. Runtime Smoke Tests

14/14 PASS against run-#2 DB via generated PrismaClient (timestamp-prefixed rows, zeros verified after cleanup): tenant create/read; instance create/read; cross-tenant isolation (B cannot see A's instance); webhook destination CRUD + duplicate P2002; delivery CRUD; message CRUD + duplicate P2002 + double-NULL-pmid allowed (PG semantics); disconnect/reconnect persistence; history-state lifecycle + duplicate P2002; session-lease persist; full cleanup zeros.

## 14. Negative Environment Matrix

| Case | Setup | Result |
|---|---|---|
| A URI only | valid-format, closed port | PASS (reaches Prisma) |
| B URL only | valid-format, closed port | PASS (mapped) |
| C both identical | — | PASS |
| D both absent | live cmd | PASS (guard blocks, exit 1, no prisma) |
| E both conflicting | — | PASS (fail-fast conflict error, no prisma) |
| F malformed | `not-a-url` | documented P1012 from Prisma (guard covers absence, not syntax) |
| G generate, no URI | — | PASS (warn + exit 0) |

## 15. Docker Reproducibility

Full image rebuild explicitly out of scope (user decision). Certified path = real scripts: shell mapping/conflict/redaction proven in Git Bash (URL-only maps; conflict errors; identical proceeds; redaction shape `postgresql://***@h:5432/…`); `generate_database.sh` warn-and-continue proven end-to-end with stubbed npm (exit 0, proceeds to `db:generate`); `bash -n` clean on both scripts. Full `.sh` E2E on Windows blocked by pre-existing platform limitation (`db:deploy` uses unix `rm` under `cmd.exe` execSync) — recorded, Linux/CI path unaffected.

## 16. Security / Secret-Redaction Results

No real credentials in any log (disposable password lived only in process env of this session; container + volume destroyed). Redaction regex verified on URIs with and without userinfo. Conflict/missing errors never echo values.

## 17. MySQL/SQLite Boundary Verification

Final diff touches exactly 3 files; `getMigrationsFolder`, provider switch, both schemas, and all provider-specific code untouched. `psql_bouncer` (needs `DATABASE_BOUNCER_CONNECTION_URI`) explicitly out of scope and unmodified. Claim "MySQL/SQLite untouched" VERIFIED.

## 18. Web Research Findings

Official Prisma docs endpoint for migrate-deploy 404'd (URL moved between v6/v7 doc trees); secondary sources confirm P1012 semantics (empty/malformed datasource URL; both `postgresql://` and `postgres://` accepted) and the v7 `prisma.config.ts` migration (not applicable: repo pins Prisma 6.19.0, schema-based datasource). Local empirical behavior (6.19.0) treated as primary evidence; web used only as corroboration.

## 19. Actual Code Changes

1. `runWithProvider.js`: bidirectional URL↔URI mapping + conflict fail-fast (exit 1) before the existing missing-URI guard.
2. `Docker/scripts/deploy_database.sh`: conflict fail-fast block added.
3. `Docker/scripts/generate_database.sh`: conflict → warning (non-blocking); missing URI → warn-and-continue (fixes reviewer P1 GEN-001; deploy-time enforcement stays in `deploy_database.sh`).
4. Reviewer P3 (stdio inherit) considered: commands never embed credentials — no change, documented.

## 20. Git Diff Summary

`runWithProvider.js` +20; `deploy_database.sh` +4; `generate_database.sh` +10/−3. Untracked `evolution-api/.agent-runs/independent-forensic-audit-2026-09-07.md` appeared mid-session from an outside process — NOT mine, left untouched. `prisma/migrations/` staging left as a fresh untracked mirror (same content a container deploy produces).

## 21. Reviewer Result

Round 1: FAIL (P1 GEN-001 legitimate + P2 consistency + P3 note) → fixed in source → shell-level re-verification → Round 2: **PASS, 0 findings** (raw JSON verified on disk; reviewer read the changed files; tree confirmed unmodified by the reviewer). `reviewers`/`doctor` AVAILABLE throughout.

## 22. Evidence Classification

A guard VERIFIED · B schema-validate VERIFIED (prior + re-confirmed) · C migrate-deploy VERIFIED (73/73 × 2, real disposable PG) · D clean-room VERIFIED · E app-startup VERIFIED (HTTP 200, no P1012; redis-absent + GovAuditEvent-drift observations recorded) · F production NOT TESTED (deliberately; never authorized).

## 23. Remaining Limitations

Full image rebuild not run (scoped out); full `.sh` E2E on Windows blocked by pre-existing `rm`-under-`cmd.exe` limitation; 18-model migration drift (P2); `migrate deploy` against production NOT TESTED by design; `psql_bouncer` path not exercised.

## 24. Certification Decision

**CERTIFIED** for PostgreSQL deployment runtime closure: real disposable deploy passes twice identically, parity holds for the deployed chain, app boots without P1012, smoke 14/14, guard matrix green, no leakage, scripts path reproducible, reviewer PASS. Production deployment remains NOT TESTED (not a deduction — a boundary).

## 25. Recommended Next Engineering Gate

Return to roadmap: REAL WHATSAPP HISTORY EVIDENCE with a dedicated staging account (provider-visible history, Baileys delivery, canonical persistence, history/live convergence, restart behavior, honest completion semantics). Until then: `PROVIDER_HISTORY_VOLUME = UNVERIFIED`.
