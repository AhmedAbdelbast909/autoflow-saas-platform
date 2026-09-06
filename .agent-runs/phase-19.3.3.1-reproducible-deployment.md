# Phase 19.3.3.1 — Reproducible Deployment Report (docker-cp elimination gate)

Date (UTC): 2026-09-06
Scope: deployment reproducibility ONLY. Prove git/working-tree source → clean Docker
build → fresh container contains all Phase 19.3.3 behavior with zero reliance on
`docker cp` or manual runtime patches. No commits. No DB resets/drops/truncates.
No production message deletes. No 100K/1M. No real WhatsApp history experiments.
No unrelated refactors. One schema-file repair performed (Step 3, in-scope).

---

## 1. Starting state

- Phase 19.3.3 = CERTIFIED (scoped); P1 gates 19.3.2/19.3.2.1/19.3.2.2 closed.
- Working tree `C:\Users\ahmed\Desktop\auto\evolution-api`, branch `main`, 121
  changed/untracked paths vs HEAD (all pre-existing 19.3.x work, uncommitted —
  commit forbidden this phase; see §17 residual R1).
- Running deployment at phase start: Docker Desktop daemon was DOWN, so
  `evolution_api` (image `evoapicloud/evolution-api:latest`) was crash-looping
  (P1001, DB unreachable) and `evolution_postgres`/`pg19_3` were Exited. No code
  defect — pure outage from daemon stop. Recovered by `docker start
  evolution_postgres` (existing volume preserved); API then passed its entrypoint
  migration deploy and reached `Up` + HTTP 200 serving live traffic (instance 123).
- Production DB `evolution_db`: `migrate status` = "Database schema is up to
  date!" (73 migrations found); `_prisma_migrations`: 80 rows, 73 finished,
  7 unfinished = historical failed-attempt records from earlier phases (message_
  reliability ×2, phase17 ×3, secret_value_text ×1, sharding ×1), each superseded
  by a finished row. Pre-existing, known, non-blocking for this gate.

## 2. Exact docker cp / ephemeral change

No shell history of the literal command survived, but the 19.3.3 report plus
direct measurement reconstruct it exactly:

- Source (repo working tree): `prisma/postgresql-schema.prisma`,
  `prisma/mysql-schema.prisma`, `prisma/postgresql-migrations/`,
  `prisma/mysql-migrations/` (the corrected 73-migration chain incl.
  `20250906090000_phase19_3_2_2_message_dedup_unique` and
  `20250907090000_phase19_3_3_history_multiwebhook`).
- Destination (running container): `/evolution/prisma/*` inside `evolution_api`.
- Why required: the running container is built from the UPSTREAM image
  `evoapicloud/evolution-api:latest`, whose baked prisma set is STALE —
  measured: `postgresql-migrations` in that image = 58 entries (57 migration
  dirs + lock.toml) vs repo = 74 entries (73 dirs + lock.toml), i.e. the image
  predates ~16 recent phase migrations. Without enrichment, entrypoint
  `db:deploy` could not apply the 19.3.2.2/19.3.3 migrations.
- Companion runtime-only coupling (not file injection, but reproducibility-
  relevant): `docker-compose.yaml` bind-mounts host `./dist:/evolution/dist`,
  so the running prod container executes HOST-built JS, not image-built JS.
- Effect on behavior: enrichment content == repo content (container
  `postgresql-migrations` count = 74 = repo 74). It changed migration/schema
  availability only; no application logic was hand-patched (all logic arrives
  via `./dist` bind mount built from repo src by `npm run build`).
- Verdict: required at the time, fully eliminable by building the image from
  repo source (proven §5/§8). Production-critical and now closed.

## 3. Root cause

Deployment architecture drift, not a code bug: production runs a pre-built
upstream image + host bind mounts + ad-hoc `docker cp`, instead of an image
built from the current repo. The Dockerfile itself was already correct
(`COPY ./src`, `COPY ./prisma`, `RUN npm run build`, entrypoint
`deploy_database.sh` → `db:deploy` → `start:prod`); it was simply never used
for this deployment. One latent defect rode along in the un-reviewed mirror:
`prisma/mysql-schema.prisma` `WebhookDestination.enabled` carried `@db.Boolean`,
invalid for the MySQL connector (the ONLY `@db.Boolean` in the file; convention
is bare `Boolean`). `prisma validate` on the MySQL schema FAILED because of it,
contradicting the 19.3.3 "both schemas PASS" line. PG was unaffected.

## 4. Repository absorption performed

Placement audit: every Phase 19.3.3 artifact already sits at its architecturally
correct repo location — no moves needed:

- TS source → `src/api/services/history.ingest.service.ts`,
  `history.sync.state.ts`, `history.ondemand.service.ts`,
  `webhook.destination.service.ts`, `webhook.fanout.service.ts`,
  `src/api/controllers/webhook.destination.controller.ts`,
  `src/api/routes/webhook.destination.router.ts` (+ edits to
  `whatsapp.baileys.service.ts`, `metrics.service.ts`, `index.router.ts`).
- Migrations → `prisma/postgresql-migrations/20250906090000_*` +
  `20250907090000_*` and `prisma/mysql-migrations/*` counterparts.
- Dockerfile/build already cover all of them (`COPY ./src`, `COPY ./prisma`,
  `RUN npm run build`); `.dockerignore` correctly excludes `node_modules`,
  `dist`, `.env`, Dockerfiles — no host leakage, no secret baking
  (image `.env` = `.env.example` copy; runtime via env/env_file).
- Single repair edit (in-scope, 19.3.3 artifact only):
  `prisma/mysql-schema.prisma:1734` `enabled Boolean @default(true) @db.Boolean`
  → `enabled Boolean @default(true)`. After: `prisma validate` PASS for PG and
  for MySQL (with a dummy `mysql://` URL; the remaining URL-protocol complaint
  with the PG `.env` URL is environmental, not a schema defect).
- No whole-filesystem copy, no unrelated code touched (`git status` count
  unchanged at 121 paths; diff confined to the one schema line plus prior work).

## 5. Dockerfile/build changes

NONE required. Official build command used verbatim:

`docker build -f Dockerfile -t evolution-repro-19_3_3_1 .`

Result: SUCCESS in 2.7 min, no `docker cp`, no bind mounts, no manual patches,
dependencies resolved from repo `package.json` + `package-lock.json` via
`npm ci`. (Layer cache was warm from a prior local build; cache keys are the
repo files themselves via COPY, so no stale-layer masking — content verified
by inspection in §6.)

## 6. Migration state

- Production (`evolution_db`): up to date; both new migrations recorded finished:
  `20250906090000_phase19_3_2_2_message_dedup_unique` ✓,
  `20250907090000_phase19_3_3_history_multiwebhook` ✓. No failed ACTIVE
  migration; no reset/repair/force used.
- Clean-image proof on EMPTY database (scratch `repro_db`, fresh `repro-pg`):
  entrypoint `deploy_database.sh` applied 0 → 73 finished migrations including
  both new ones. Full chain reproducible from image content alone.
- UNIQUE backstop `Message_instanceId_providerMessageId_key` present in PG
  schema (`@@unique([instanceId, providerMessageId])`), in the 19.3.2.2
  migration, and enforced (H11 re-passing, §10).

## 7. Repository/image/container drift table

Counts: PG migration entries (`ls` incl. `migration_lock.toml`).

| artifact | repo (worktree) | clean image `evolution-repro-19_3_3_1` | running prod container | status |
|---|---|---|---|---|
| `history.ingest/sync.state/ondemand` services (src+dist) | YES | YES (compiled .js/.mjs + maps) | YES (host dist bind) | MATCH |
| `webhook.destination/fanout` services (src+dist) | YES | YES | YES | MATCH |
| webhook destination controller + router (src+dist, mounted in `index.router`) | YES | YES | YES | MATCH |
| baileys `messaging-history.set` canonical ingest + P2002 guards | YES | YES (in bundle) | YES | MATCH |
| history/webhook metrics in `metrics.service` | YES | YES | YES | MATCH |
| PG migrations (73 dirs) | 74 entries | 74 entries | 74 entries | MATCH |
| Upstream base image `evoapicloud:latest` PG migrations | — | 58 entries (57 dirs, stale) | (base layer) | EXPLAINED, superseded |
| MySQL migrations (new 2) | YES | YES | YES | MATCH (post-§4 fix, schema validates) |
| `prisma/migrations` staging dir | YES (gitignored, generated) | YES (rebuilt at entrypoint) | YES | EXPECTED_GENERATED |
| `dist/` | NO (gitignored) | YES (built by `npm run build`) | YES (host bind on prod) | EXPECTED_GENERATED |
| `.env` secrets | host only | NOT baked (example copy) | via env_file | MATCH (no secret in image) |
| Untracked-in-git 19.3.x files (commit forbidden) | present, uncommitted | included (build uses worktree) | included | DOCUMENTED residual R1 |

EPHEMERAL-or-MISSING production-critical items: none.
`docker cp dependencies: 0` · `production-critical ephemeral dependencies: 0` ·
`unexpected image/repository drift: 0`.

## 8. Fresh build result (§5 — SUCCESS, 2.7 min)

## 9. Fresh container result

Fresh stack on isolated `repro_net` (disposable `repro-pg`/`repro-redis`,
port 8081, test API key, NO `docker cp`, NO bind mounts, NO prod DB contact):

- `repro-api`: entrypoint migration deploy clean → `HTTP - ON: 8080` → host
  `http://localhost:8081/` = HTTP 200 ✓
- Scratch DB 0 → 73 applied migrations incl. both new ones ✓ (§6)
- All 5 feature services `require()`-loadable as classes inside the fresh
  container: HistoryIngestService, HistorySyncStateService,
  HistoryOnDemandService, WebhookDestinationService, WebhookFanoutService ✓
- Webhook CRUD on safe scratch instance `reprotest`: create 201
  (`cmtpaovte0000k67ha01ehib0`) → list 1 → get (URL match) → update (URL +
  enabled flip verified) → delete → list 0 ✓
- Isolation negative: unknown instance → 404 ✓; auth via `apikey` header enforced.
- Teardown: scratch containers removed with volumes, network removed, `pg19_3`
  returned to prior Exited state. Prod stack untouched and re-verified HTTP 200.

## 10. History feature verification (clean image, no live reconnect)

- `messaging-history.set` → canonical `HistoryIngestService.ingestBatch`
  (`source='history_sync'` + syncRunId/batchId/progress/isLatest) FIRST, legacy
  historic path preserved after, Chatwoot age gate filters only legacy/Chatwoot
  import — verified in image source = repo source (byte-identical build input).
- State machine PENDING→RUNNING→COMPLETED|PARTIAL|FAILED + on-demand capability
  detection (`fetchMessageHistory` wrap, ≤200 bound, single-flight) present and
  loadable in the fresh container.
- Behavioral proof on current source (scratch `secretmig19_3`, cleaned to
  0/0/0/0/0 after): H-matrix **12/12 PASS** (incl. H4/H5/H6 idempotency,
  H7 Chatwoot-gate fix, H8 state machine, H9 LID, H11 DB invariant).
- No provider-volume claims (unchanged from 19.3.3 scope).

## 11. Multi-webhook verification (clean image, fake transport)

- Modules + routes + HMAC (`t.v1.nonce` sha256, 300 s window) + SSRF dual
  validation (`validateEgressUrl` at create/update AND per delivery) +
  `maxRedirects: 0` + 1 MB caps + per-destination timeouts + bounded exp
  backoff+jitter (5-min cap, `nextAttemptAt`) + 4xx-terminal vs retryable
  classification + DEAD_LETTER + same-row replay + global/per-destination
  concurrency bounds + gauges — all verified present in image code and
  loadable.
- Behavioral proof on current source: W-matrix **13/13 PASS** (W1 fanout,
  W2/W3 isolation, W4/W5 retry classes, W6 idempotency headers, W7 HMAC,
  W8 SSRF+isolation, W9 legacy adapter, W10 n8n-ordinary, W11/W12 DLQ+replay,
  W13 backpressure, W14 burst drain, W15 outage recovery, W16/W17
  history↔webhook decoupling).
- Control-plane CRUD proven live against the FRESH container (§9).

## 12. Legacy compatibility result

- Legacy live path (`channel.service loadWebhook/sendDataWebhook` +
  `WebhookDeliveryService`, `webhookUrl/webhookEvents/webhookByEvents`) is
  byte-untouched by 19.3.3 (file not in any modified set) — existing clients
  cannot break; prod container serves them today (HTTP 200, live traffic).
- `legacyDestinationFor()` adapter exists, loads in the clean image, and passes
  service-level W9. Honest boundary: no in-`src` caller invokes `fanout()` /
  `enabledForEvent()` yet — the engine is staged behind the control plane
  (test-ping/replay/deliveries) and the legacy delivery path remains the live
  one. No breakage, no phantom wiring claimed.

## 13. Security verification (clean deployment)

Preserved and re-proven: tenant-scoped destination CRUD (server-side
instance→tenant resolution + `assertCallerTenantMatch`, no tenant-less path;
cross-instance reads null; unknown instance 404 on fresh container); RBAC via
existing `apikey` guard; SSRF double-guard + no-redirect + response cap
(W8 + egress.guard 5/5 on current source); HMAC sign/verify intact (W7);
secret-by-reference only (`secretRef`, no plaintext); legacy auth unchanged.
Suites: tenant.authz 11/11, webhook.secrets behavior unchanged (code untouched).

## 14. Configuration audit

New env vars introduced by 19.3.3: **ZERO** — `grep process.env` over all 7 new
files returns nothing. All behavior is data-driven (DB rows) or parameter-
driven (request bodies, per-destination timeoutMs/maxAttempts). No required
production configuration lives only in a container (image carries example `.env`;
runtime injects via env_file/`-e`, verified on repro-api). Secrets policy
unchanged: nothing secret added to git (only untracked functional code, no
credential values).

## 15. Dependency audit

- `baileys` pinned `7.0.0-rc12` in `package.json` AND `package-lock.json`
  (verified) — unchanged, no upgrade.
- `@prisma/client` ^6.16.2 / `prisma` ^6.1.0; CLI 6.19.0 used for
  validate/generate — no upgrades performed.
- Clean image resolved the full tree from the repo lockfile (`npm ci`); prod
  `node_modules` untouched.

## 16. Performance / startup (measured, not extrapolated)

- Clean image build: SUCCESS, 2.7 min end-to-end (warm layer cache).
- Fresh container: migrations 0→73 + HTTP 200 within ~2 min of `docker run`.
- Idle baseline (`docker stats`): repro-api 197.7 MiB / ~0.01% CPU vs prod
  evolution_api 173.8 MiB / 0.00% CPU; repro-pg 56 MiB; evolution_postgres
  74 MiB. No 100K/1M claims (forbidden).

## 17. Regression results

`tsc --noEmit` 0 · `eslint` 0 on all 19.3.3 files · image `npm run build` green
(§5) · `prisma validate` PG+MySQL PASS (post-§4 fix) · `prisma generate` PASS ·
`migrate status` prod up-to-date · H-matrix 12/12 · W-matrix 13/13 ·
message.reliability 13/13 · webhook.delivery 13/13 · tenant.authz 11/11 ·
egress.guard 5/5 — all on CURRENT (post-fix) source; scratch datasets verified
0 leftovers; prod rows untouched (all test writes went to `secretmig19_3` or
disposable `repro_db`, both cleaned/removed).

## 18. Remaining drift / residual risks

- R1 (administrative, NOT a container-ephemeral issue): all 19.3.x work incl.
  19.3.3 files is uncommitted in the working tree (untracked: 2 migrations ×2
  providers + 7 src files; modified: baileys/metrics/router/etc.). A literal
  `git clone` + `docker build` would miss them. A commit by the repo owner is
  still required; forbidden to this phase. Build reproducibility from the
  repository WORKING TREE is proven.
- R2: running prod `evolution_api` still = upstream stale image + enrich-layer
  + host-`dist` bind mount. Functionally current (content == repo, HTTP 200,
  migrations current), but the next prod redeploy should switch to a
  repo-built image (e.g. retag `evolution-repro-19_3_3_1`) and drop the
  `./dist` bind mount so prod runs image-built JS.
- R3: 7 historical unfinished `_prisma_migrations` rows (pre-existing, §1);
  `migrate status` healthy — no action.
- R4: `fanout()`/`enabledForEvent()` have no live trigger yet (§12) — staged
  capability, not a defect.

## 19. Certification decision: **CERTIFIED (reproducibility scope)**

Gate checklist: 1. files in repo/build source — YES (§4/§7; R1 noted, commit
outside phase authority) · 2. no `docker cp` dependency — YES (0) · 3. fresh
build succeeds — YES · 4. fresh container starts — YES (HTTP 200) · 5. migrations
reproducible + current — YES (prod up-to-date; scratch 0→73) · 6. history
modules initialize — YES · 7. webhook modules initialize — YES · 8. webhook APIs
work clean — YES (full CRUD) · 9. security intact — YES · 10. regression green —
YES · 11. no unexplained drift — YES (table §7) · 12. behavior matches intended —
YES · 13. no P0/P1 introduced — YES (one MySQL-mirror defect found AND fixed;
PG/prod never affected).

Scope of CERTIFIED: source→image→container→migration reproducibility of the
Phase 19.3.3 stack. Explicitly NOT certified here: git-tracking (needs owner
commit, R1), provider history volume, external-network latencies, 100K/1M scale
(unchanged policy). 50K control-plane evidence untouched and still valid.

`docker cp dependencies: 0`
`production-critical ephemeral dependencies: 0`
`unexpected image/repository drift: 0`
