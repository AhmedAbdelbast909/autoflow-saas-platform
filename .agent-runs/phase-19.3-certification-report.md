# Phase 19.3 — Real Infrastructure Certification Report

Date (UTC): 2026-09-05
Scope: Evolution API production-certification roadmap, Phase 19.3 (REAL INFRASTRUCTURE CERTIFICATION GATE)
Policy: no commits made; all pre-existing uncommitted work preserved; no destructive operations performed
(no volumes deleted, no databases deleted/reset, no repo reset, no destructive git commands).

Prior verified baseline (not redone): orchestrator build PASS, 52/52 tests PASS,
DeepSeek reviewer PASS/FAIL/UNAVAILABLE, UNAVAILABLE blocks certification, `reviewers` CLI works,
DeepSeek Harness unavailable on PATH.

---

## 1. Infrastructure inspection & safe recovery (STEP 1)

Real observations (commands in §10):

- Docker daemon UP: `29.1.2`, context `desktop-linux`.
- Test containers UP: `pg19_3` (postgres:15, host :5433), `redis19_3` (redis 8.10.1,
  host :6380, PONG), `mysql19_3` (mysql:8.0, host :3307, `audit19_3` present),
  `evolution_postgres` (accepting connections, `evolution_api` schema populated),
  `evolution_redis` (PONG). Host TCP OPEN on 5432/5433/3307/6380.
- Scratch datasets present from prior phases: `scale19_3`, `secretmig19_3` (schema pushed),
  `reassign19_3` (all on `pg19_3`), `audit19_3` (on `mysql19_3`, GovAuditEvent + GovAuditChainLock present).
- `evolution_api` (image `evoapicloud/evolution-api:latest`) was crash-looping
  (RestartCount 197, P1001 `Can't reach database server at evolution-postgres:5432`).
  Root causes found: (a) container had lost its `evolution-net` endpoint (empty EndpointID/IP);
  (b) the URI hostname uses a hyphen (`evolution-postgres`) while the DB container only
  carried the underscore name as DNS alias.
- Safe, non-destructive recovery attempted (no data touched):
  `docker stop` + `docker network connect` reattached the API container (got 172.19.0.3);
  `docker network disconnect/connect --alias evolution-postgres` on the DB container
  fixed DNS — P1001 is gone (progress verified in container logs).
- Container still crash-loops on a PRE-EXISTING condition, deliberately left untouched:
  `prisma migrate deploy` refuses because migration
  `20250904130000_phase17_enterprise_governance` (started 2026-09-05 17:43:17 UTC) is marked
  FAILED in `evolution_db`. Resolving it requires a data decision in `evolution_db`
  (out of scope for this gate; forbidden to improvise on a real database).
- `evolution_postgres` verified healthy afterwards (`pg_isready`: accepting connections).

---

## 2. Certification matrix

| Gate | Status | Evidence | Environment | Blocking? | Remaining Risk |
| ---- | ------ | -------- | ----------- | --------- | -------------- |
| Redis distributed rate limiting (3 workers, shared global limit, isolation, burst exactness, TTL, outage, recovery, latency) | PASS | `test/rate.limit.real.redis.19_3.test.ts`: 5/5. 3 procs x 40 = 120 attempts, limit 50 → allowed=50 rejected=70 exact; tenants A=50 B=50; TTL-bounded namespaced keys; 5s window expiry re-admits; outage: 10 local-fallback decisions, redisFailures=2, recovery `recoveredDistributed=true`; latency p50=11 p95=12 p99=12ms (n=120). `redis19_3` PONG + running after stop/start cycle | Real `redis19_3` :6380 + Docker | No | p99 bound (500ms) is generous; multi-AZ/failover Redis not tested |
| Secret migration on staging data (preflight, migrate, idempotency, SIGKILL resume x2, auth, isolation, redaction, reconciliation) | PASS | `test/secret.migration.real.19_3.test.ts`: 9/9 on scratch `secretmig19_3`. Final: tokens hashed=45 legacy-remaining=0 null=3; creds encrypted=22 plaintext-remaining=0 null=3; killed child left hashed=16/35, enc=13/16 then resume completed exactly; 2nd pass no-op; wrong-key fails closed; duplicate→identical hash (x3), distinct creds→distinct ciphertexts (per-row IV) | Real `pg19_3` scratch DB, disposable rows only | No | Production `evolution_db` still holds legacy values; cutover run not done |
| Data residency / egress bypass audit | PARTIAL | `egress.guard.19_3` 5/5; `residency.guard.19_2` 15/15; static wiring test "all P1 egress sites are guarded" passes. ENFORCED: webhook outbox (SSRF dead-letter, zero HTTP attempt), meta/n8n/evolutionBot/chatwoot endpoints, S3 media writes (baileys/meta/evolution/SQS), AI routing (openai), exports (server-side tenant). AUDITED: customer-hosted AI endpoints. LEGACY_UNSCOPED: metered+logged, must trend to zero | Code + unit/fake wiring (no real egress performed, by design) | No (no P0/P1 bypass found) | D-bypass list below remains (P2/P3) |
| Distributed audit MySQL | PASS | `test/audit.chain.19_3.mysql.test.ts`: 3/3 real. 60 appends/3 workers/10-in-flight verified in 601ms, single head; restart recovery extends same chain (61 rows); 30-burst linearizable (91 rows). Client regenerated to mysql flavor for the run, then restored to postgresql (`client-loads-ok`) | Real `mysql19_3` `audit19_3` | No | Long-soak MySQL chain not run |
| Distributed audit PostgreSQL | PASS (prior phase, not redone) | Phase 19.2.2 premise: 3 workers x 60 appends, single chain, restart recovery, advisory locking | Real PG (prior evidence) | No | — |
| Failure injection: worker SIGKILL | PASS | Real: SIGKILL mid-migration + resume twice (secret-mig gate); reassign gate: janitor detects crashed heartbeat 6076ms after SIGKILL, reassignment 39ms/3 instances, fencing tokens rotate, old creds dead, exactly-one-owner, 8/8 | Real PG multi-process | No | Kill-during-50K not done |
| Failure injection: worker SIGTERM | PASS | Real: graceful SIGTERM deregisters, no stale row (reassign gate 8/8) | Real PG multi-process | No | — |
| Failure injection: Redis restart / kill | PASS | Real: `docker stop/start redis19_3` mid-run; local fallback protective, recovery restores distributed mode | Real `redis19_3` | No | Kill -9 of redis-server process (vs container stop) not separately done — same code path |
| Failure injection: temporary PG outage | PASS | `test/pg.outage.19_3.test.ts`: 2/2 real. `docker stop pg19_3` → acquire fails CLOSED; `docker start` → recovery, pre-outage lease intact, double-owned=0; container confirmed running after | Real `pg19_3` | No | — |
| Failure injection: provider timeout (real) | NOT TESTED | Only unit/fake coverage exists | n/a | No (not a 19.2.2 blocker) | Real provider-timeout resilience unproven |
| Failure injection: webhook-destination real outage | NOT TESTED (real) | Unit: SSRF dead-letter + public-delivery pass (egress gate) | n/a | No | Real HTTP 5xx/timeout/drain behavior unmeasured |
| Failure injection: automation/n8n real outage | NOT TESTED | Health-check path exists (`n8n.connector` healthz) but no real outage run | n/a | No | Real n8n-down behavior unmeasured |
| Failure injection: network latency/timeout injection | NOT TESTED | No toxiproxy-style harness in repo | n/a | No | Tail-latency under degraded network unknown |
| Pre-50K health check | PASS | Read-only probes: `pg_stat_activity`=1 conn on scale19_3; lease indexes present (`SessionLease_*`, `WorkerRegistration_*`, `Instance_shardKey_idx`, …); redis used_memory 1.50M, 0 ops/s idle, 0 rejected conns; containers ~idle CPU; scratch DB empty pre-run | Real infra | No | No slow-query log analysis (no traffic yet) |
| 50K real control-plane | PASS (with caveat) | `test/scale.19_2.pg.test.ts` @ SCALE_INSTANCES=50000 vs scratch `scale19_3`, exit 0: seed 50000 in 4243ms; 4-worker assignment 28ms, shards/worker=[273,265,240,246]/1024; discovery 50000/50000 in 5388ms; lease race 400/400 in 371ms (1078 ops/s) p50=352 p95=355 p99=358ms double-owned=0; renew 400 in 29ms p95=28ms; heap +61.3MB. Caveat: kill-worker-during-50K not executed (reassign kill evidence is small-scale) | Real `pg19_3` scratch DB (cleaned by test finally-block) | No | Lease-acquire p50 ~350ms under 400-way storm wants a follow-up look before 100K; kill-at-scale pending |
| 100K scale | NOT TESTED | Deliberately not run (see §5) | n/a | No | 100K/1M unproven |
| Security review (diff + new surface) | PASS with P2/P3 notes | tenant.authz 11/11; webhook.secrets 10/10; credentials 12/12; billing 26/26; no secret-logging patterns; no P0/P1 in reviewed surface | Code + unit suites | No | P2: TOTP setup returns `api.qrserver.com` client-side QR URL embedding the otpauth URI (no server-side fetch; still a third-party disclosure — fix = server-side QR render). P2: LEGACY_UNSCOPED bypass must trend to zero. P3: vendor telemetry default URL |
| Regression: tsc / eslint / builds / prisma / orchestrator | PASS | `tsc --noEmit` exit 0; `lint:check` exit 0; backend `tsup` build success 9265ms; frontend `vite build` 18.15s; prisma generate mysql + postgresql both ok; orchestrator 52/52 | Real toolchain | No | Full `test/all.test.ts` marathon not run (targeted suites run instead) |
| Production deployment (`evolution_api` serving traffic) | FAIL (pre-existing, ops) | Crash-loop on failed migration `20250904130000_phase17_enterprise_governance` in `evolution_db`; DNS/network layer recovered by this phase (P1001 gone). No code change made for this; DB left untouched | `evolution_postgres` / `evolution_api` | YES — blocks any production claim | Must `prisma migrate resolve` + redeploy; image (`:latest`) vs repo code drift also unverified |

---

## Production Certification

- [x] NOT CERTIFIED
- [ ] PARTIALLY CERTIFIED
- [ ] CERTIFIED

Rationale: subsystem gates pass on real scratch infrastructure, but the production
deployment itself cannot serve traffic (failed migration in `evolution_db`), several
real failure-injection variants are NOT TESTED, kill-at-scale is pending, and 100K/1M
are unmeasured. Certifying anything above NOT CERTIFIED would upgrade
"code tested on scratch" into "production certified", which the standard forbids.

## Maximum Evidence-Backed Scale

- [x] 50K (control-plane: seed/assign/discover/lease/renew on real PG; kill-at-scale pending)
- [ ] 10K only
- [ ] 100K
- [ ] other: —

## Claims We CANNOT Make

- No 1M production-ready claim (never tested at any nearby order of magnitude).
- No 100K claim (deliberately not run; 50K numbers must not be multiplied).
- No kill-during-50K reassignment claim (kill evidence is small-scale: 3 instances, 39ms).
- No network-chaos PASS (no latency/timeout injection harness).
- No real provider-timeout / webhook-destination-outage / n8n-outage resilience claims.
- No complete data-residency claim: telemetry default URL, operator-configured URLs
  (provider sessions, Vault, audio-converter), WhatsApp/Meta CDN media fetches, and the
  client-side TOTP QR disclosure remain outside enforcement (B/C/D-classified, no P0/P1).
- No production-deployment health claim: `evolution_api` is crash-looping on a failed
  migration; `evolution_db` state vs repo migrations is unresolved.
- No MySQL long-soak claim (burst-tested only).
- Lease-acquire p50 (~350ms under a 400-way storm) is measured, not a bound — no latency
  SLO claim at scale.

## Remaining Risks

- P1 (ops, blocking): failed migration `20250904130000_phase17_enterprise_governance`
  in `evolution_db` blocks `evolution_api` startup. Owner: whoever owns the production DB.
- P2: TOTP setup exposes otpauth URI to `api.qrserver.com` via client-rendered QR
  (`src/api/services/mfa.service.ts:144`). No server-side fetch; fix = server-side QR render.
- P2: `LEGACY_UNSCOPED` residency bypass (instances without tenantId) is metered, not removed;
  removal requires tenantId NOT NULL at creation. Counter must trend to zero.
- P2: lease-acquire p50 ~350ms under contention storm — investigate before 100K
  (lock granularity / index / pool sizing).
- P3: telemetry posts route+version to vendor default URL when enabled (no tenant PII,
  operator-configurable; consider documenting/off-by-default posture).
- P3: `evolution_api` image (`evoapicloud/evolution-api:latest`) vs repo code drift unverified.

## Exact Next Task

Resolve the failed migration in `evolution_db` (`prisma migrate resolve --applied
20250904130000_phase17_enterprise_governance` ONLY after DBA review of what that migration
did and of current schema state — or mark rolled back if it never applied), then restart
`evolution_api` and confirm steady `running` + successful startup logs. Nothing else
(scale, chaos, 100K) should precede a healthy production deployment.

## Reproducibility

All from `C:\Users\ahmed\Desktop\auto\evolution-api` unless noted (PowerShell):

- Infra: `docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"` ·
  `docker exec redis19_3 redis-cli ping` · `docker exec evolution_redis redis-cli ping` ·
  `docker exec pg19_3 psql -U evolution_user -d scale19_3 -c '\dt'` ·
  `docker exec mysql19_3 mysql --user=root --password=rootpass -e 'SHOW TABLES FROM audit19_3;'` ·
  host ports probe via node net-connect to 127.0.0.1:5432/5433/3307/6380 (all OPEN).
- Redis gate: `$env:REAL_REDIS_TEST='1'; npx tsx test/rate.limit.real.redis.19_3.test.ts` → 5/5.
- Secret migration: fresh 64-hex key
  `$key=(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")`;
  `$env:SECRET_MIG_TEST='1'; $env:SECRET_MIG_DSN='postgresql://evolution_user:evolution_pass@localhost:5433/secretmig19_3?schema=public'; $env:SECRET_ENCRYPTION_KEY=$key; npx tsx test/secret.migration.real.19_3.test.ts` → 9/9.
- Residency: `npx tsx test/egress.guard.19_3.test.ts` → 5/5;
  `npx tsx test/residency.guard.19_2.test.ts` → 15/15.
- MySQL audit: `npx prisma generate --schema=prisma/mysql-schema.prisma`;
  `$env:MYSQL_AUDIT_TEST='1'; $env:MYSQL_AUDIT_DSN='mysql://root:rootpass@localhost:3307/audit19_3?connection_limit=40&pool_timeout=60'; npx tsx test/audit.chain.19_3.mysql.test.ts` → 3/3;
  restore: `$env:DATABASE_PROVIDER='postgresql'; npm run db:generate` → `client-loads-ok`.
- PG outage: `$env:PG_OUTAGE_TEST='1'; npx tsx test/pg.outage.19_3.test.ts` → 2/2
  (container confirmed `running` after).
- Reassign/kill: `$env:REASSIGN_PG_TEST='1'; $env:REASSIGN_PG_DSN='postgresql://evolution_user:evolution_pass@localhost:5433/reassign19_3?schema=public'; npx tsx test/worker.reassign.19_2.pg.test.ts` → 8/8.
- 50K: `$env:SCALE_PG_TEST='1'; $env:SCALE_PG_DSN='postgresql://evolution_user:evolution_pass@localhost:5433/scale19_3?schema=public'; $env:SCALE_INSTANCES='50000'; npx tsx test/scale.19_2.pg.test.ts` → exit 0, full log `C:\Users\ahmed\AppData\Local\Temp\opencode\scale50k.log`.
- Security suites: `npx tsx test/tenant.authz.19_3.test.ts` → 11/11;
  `npx tsx test/webhook.secrets.19_2.test.ts` → 10/10;
  `npx tsx test/credentials.19_2.test.ts` → 12/12; `npx tsx test/billing.test.ts` → 26/26.
- Regression: `npx tsc --noEmit -p tsconfig.json` (0); `npm run lint:check` (0);
  `npm run build` (tsup success 9265ms); `npm run build` in `frontend/` (vite 18.15s);
  `npm test` in `C:\Users\ahmed\Desktop\auto\orchestrator` (52/52).
- API recovery: `docker stop evolution_api; docker network connect evolution-net evolution_api; docker start evolution_api`;
  `docker network disconnect evolution-net evolution_postgres; docker network connect --alias evolution-postgres --alias evolution_postgres evolution-net evolution_postgres; docker start evolution_api`;
  evidence: `docker inspect` shows 172.19.0.3 + alias; logs moved from P1001 to failed-migration block.

---

## Git policy compliance (end-of-run)

- No commits made (root repo or nested `evolution-api` repo).
- Root `C:\Users\ahmed\Desktop\auto`: pre-existing orchestrator modifications + untracked
  `.ai/orchestrator/runs/`, `test-output/` etc. untouched; nothing added or discarded.
- `evolution-api`: still exactly 107 changed paths (staged docs/migrations + unstaged src),
  zero untracked additions from this phase; `dist/` + `node_modules/` regenerations are
  git-ignored. Prisma client mysql→postgresql regeneration restored the working state
  (`@prisma/client` loads ok).
- Scratch databases (`scale19_3`, `secretmig19_3`, `reassign19_3`, `audit19_3`) hold only
  test-prefixed/disposable rows; scale/secret tests self-cleaned via finally-blocks.
  `evolution_db` was NOT modified (read-only probes + network reattach only).
