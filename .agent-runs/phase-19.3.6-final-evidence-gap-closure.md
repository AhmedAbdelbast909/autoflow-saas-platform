# Phase 19.3.6 — Final Evidence-Gap Closure Report

Date (UTC): 2026-09-06
Scope: close or precisely bound the three remaining gaps (WhatsApp provider
volume, MySQL runtime, 1M scale). No commits. No prod contact beyond read-only
inventory. No staging WhatsApp disturbed. No unrelated refactors. Two
scratch-only test harnesses added under gitignored `test/` (consistent with
prior phases); zero application-source changes this phase (git diff still the
same 10 tracked files / 121 paths).

---

## 1. Baseline state

19.3.2/19.3.2.1/19.3.2.2 P1 CLOSED · 19.3.3 CERTIFIED (scoped) · 19.3.3.1
CERTIFIED · 19.3.4 CERTIFIED (implementation; provider-limited) · 19.3.5
CERTIFIED (100K control-plane). Prod: single live instance `123` (open,
Baileys), HTTP 200, 6 h continuous uptime at phase end.

## 2. WhatsApp staging availability

Exactly one instance exists (`123`, production, open). No staging number, no
test instance, no designated non-production account. A1 outcome:
**IMPLEMENTATION = PASS, PROVIDER_VOLUME = UNVERIFIED.** No reconnect forced,
no session touched (verified still `open` at end). A2 produced no live sync by
rule, not by omission.

## 3. Real history evidence (code/protocol, no fabrication)

- Pinned Baileys surface (node_modules, `baileys@7.0.0-rc12`): sync types
  INITIAL_BOOTSTRAP / RECENT / FULL / ON_DEMAND (+ PUSH_NAME), `isLatest`
  batch flag, `fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)`
  on 3 socket interfaces. Our handler branches on all of them (prior H tests).
- Completion semantics (`history.sync.state.ts:115-120`): COMPLETED recorded
  ONLY on provider `isLatest` with zero failures, else PARTIAL; terminal states
  immutable. The implementation therefore **provably distinguishes** complete
  from partial provider windows (H8 re-passing).
- On-demand: real protocol call wrapped with ≤200 bound, single-flight,
  explicit `{supported:false}` capability result (H on-demand tests re-passing).
- Overlap: H4/H5/H6 re-passing; UNIQUE backstop re-verified present AND
  enforced in prod (`pg_constraint` check today).
- Media separation: persistence commits first; all `downloadMediaMessage`
  call sites sit in post-persist try/catch blocks (logged, never thrown) —
  metadata persists independently of media success.

## 4. Provider limitations

Provider-side volume/retention is unobservable without a staging phone:
batch sizes, retention window, per-sync caps remain UNVERIFIED (unchanged
since 19.3.3, honestly carried, not re-labeled).

## 5. History completeness classification: **UNKNOWN (provider-limited)**

No observed provider window exists to judge. Mechanism to classify any future
window COMPLETE vs PARTIAL is implemented, tested (H8), and deployed.

## 6. History/live race evidence

Carried + re-verified: H-matrix 12/12 today (scratch, zeros after), UNIQUE in
prod, 25-worker race evidence from 19.3.2.2 stands. No new race risk
introduced (no ingest-path code changed).

## 7. MySQL environment

Real MySQL 8.0.46 (`mysql19_3`, scratch DB `mysql1936`, dropped afterwards).
Pre-existing `audit19_3` untouched. Container returned to Exited.

## 8. MySQL migration results: chain BLOCKED at pre-existing file (no rewrite)

- Fresh `migrate deploy`: **18 migrations applied, then hard stop** at
  `20250902130000_enhance_journal` (1064, `ADD COLUMN IF NOT EXISTS` —
  MariaDB-only syntax, invalid on MySQL 8.0).
- Exact census: 75 `IF NOT EXISTS` occurrences = 22 valid `CREATE TABLE IF NOT
  EXISTS` + **53 invalid `ADD COLUMN IF NOT EXISTS` across 11 files**
  (journal/reliability/identity/HA/webhook/enterprise/phase17 eras — all
  pre-19.3.x). No `CREATE INDEX IF NOT EXISTS` / `ADD CONSTRAINT IF NOT EXISTS`
  anywhere.
- Minimal-fix proposal (NOT applied — dedicated hardening scope): fresh
  deploys need plain `ADD COLUMN`; idempotent re-runs need
  INFORMATION_SCHEMA-guarded procedures. Rewriting 11 cross-domain files here
  would violate change control.
- Both 19.3.x mirror files use **only valid syntax** and apply cleanly:
  19.3.3 creates HistorySyncState/WebhookDestination/WebhookDelivery with
  zero errors; 19.3.2.2 creates the UNIQUE after a documented one-column
  scratch scaffold (the column belongs to the blocked reliability migration).

## 9. MySQL functional results (real server, PARTIAL scope)

- 1062 `Duplicate entry 'mi1-pmid-1'` on same-instance redelivery; same pmid
  on another instance accepted; double NULL pmid accepted (PG-identical
  semantics).
- Destination `UNIQUE(instanceId,name)` enforced (1062); per-instance scoping
  visible; delivery `UNIQUE(eventId,destinationId)` enforced (1062).
- Full delivery lifecycle persisted: PENDING→RETRY_WAIT→DEAD_LETTER→replay
  reset→DELIVERED with latency/httpStatus columns.
- Prisma-client app path (MySQL-generated client): destination CRUD 3-state +
  cross-instance null read; delivery + history-state lifecycle; duplicate via
  driver surfaces 1062. **M-matrix 3/3** (one honest boundary: full-model
  client Message insert impossible on the intentionally partial chain —
  P2022 on later-migration columns — so P2002-equivalence shown via driver
  1062 instead; SQL-level 1062 + PG H11 jointly cover it).

## 10. MySQL restart results

Container restart: 44 tables, 4 messages, 2 destinations all persist;
M-matrix re-run 3/3 post-restart (reconnect clean). No destructive repair
used at any point.

## 11. 1M definition (C1)

"1M" is disambiguated: 1M Instance rows (seed/storage) ≠ 1M concurrent leases
(contention) ≠ 1M Redis keys (cardinality) ≠ 1M messages/webhooks (message
path, never in scope of control-plane scale). Prior 100K covered the first
three partially (400-racer leases only).

## 12. 1M readiness analysis (C2, ESTIMATES from measured 100K/250K)

- Seed ~13–14K rows/s → 1M instances ≈ 70–80 s single-harness batched.
- Discovery page-size sensitive (28 s @500pg/100K; 5.8 s @1000pg/250K);
  keyset paging flat (first 13 / mid 9 / last 3 ms at 250K) — no deep-offset
  degradation.
- Lease throughput ≈ 1100 ops/s FLAT across 400→2000 racers (pool-bound);
  1M leases ≈ ~15 min single-coordinator-set; latency grows with concurrency
  (p50 320 ms @400 → 1528 ms @2000).
- Scan memory +27 MB per 100K IDs held → ~270 MB per 1M in a scanning worker
  (sizing note, not a blocker).
- Redis: 300K keys = 28 MB → ~95 MB per 1M; limiter p99 2 ms unaffected.
- Shard balance at scale: 23.4–26.7% across 4 workers; leave → full
  re-ownership, zero overlap.

## 13. Targeted high-cardinality results (C4, all real, all cleaned to zero)

- T1: 300K Redis keys in 1225 ms; 1000 limiter checks p50=1/p95=1/p99=2 ms;
  300K scratch keys removed.
- T2: 250K seed in 17.7 s; discovery 250000/250000; 2000 distinct-instance
  lease storm won=2000/2000, errs=0, dupes=0; 250K cleanup in 26 s, zeros
  verified. **T-matrix 2/2.**
- Bottleneck search (C3): primary lever = DB connection pool (Prisma
  defaults, no tuning in repo — flat throughput + linear latency is the
  signature); single-host harness only; renew storms unmeasured beyond 400;
  paging/shards/Redis show no wall.

## 14. 1M decision: **INCONCLUSIVE (narrowed, do not claim)**

250K behaves linearly and no structural wall appeared, but 1M
SUPPORTED_BY_EVIDENCE requires actual 1M-scale lease/renew contention,
multi-host behavior, and 1M Redis cardinality runs — none performed.
NOT_JUSTIFIED would overstate (nothing disqualifies); BLOCKED is wrong (no
blocker). Next step if 1M is wanted: 500K–1M with multi-process workers,
scaled lease/renew storms, pool sizing experiments.

## 15. Complete regression (final state)

tsc 0 · eslint 0 (full src) · PG+MySQL validate PASS · PG generate PASS ·
prod `migrate status` up-to-date · H 12/12 · W-fanout 13/13 · M 3/3 (MySQL) ·
message.reliability 13/13 · webhook.delivery 13/13 · tenant.authz 11/11 ·
backpressure 8/8 · fencing 10/10 · ownership 31/31 · shard 40/40 ·
observability 11/11 · 100K scale run + S 5/5 + T 2/2 carried. Scratch zeros
verified everywhere (`secretmig19_3`, `scale100k`, redis keys). No src file
changed this phase (diff still the same 10 tracked files).

## 16. Production health

HTTP 200 · 6 h continuous uptime (no restarts) · instance `123` still open ·
UNIQUE present · migrations current · zero experimental writes (all test
traffic went to scratch DBs/redis, all removed or verified empty).

## 17. Final evidence matrix

| Domain | Implementation | Real Evidence | Status | Remaining Gap |
|---|---|---|---|---|
| History implementation | PASS (H 12/12 today) | fixture+code/protocol | VERIFIED | — |
| Provider history volume | n/a (provider-side) | none observable | UNVERIFIED | needs staging phone |
| History/live overlap | PASS (H4/H5/H6, UNIQUE in prod) | scratch races + prod constraint | VERIFIED | — |
| MySQL runtime (19.3.x objects) | PASS (M 3/3, 1062s, restart) | real 8.0.46 | PARTIALLY VERIFIED | full chain blocked pre-19.3.x |
| MySQL full chain | blocked, fix proposed | 18 applied, exact failure | UNVERIFIED | 11-file hardening phase |
| Webhook external delivery | PASS (R 12/12 real transport) | listener + server ping | VERIFIED | public-internet latency only |
| n8n | PASS (N 2/2 + exec records) | real n8n | VERIFIED | — |
| 100K scale | PASS (seed/disc/400-lease) | real PG | VERIFIED | — |
| 250K + cardinality probes | PASS (T 2/2, S 5/5) | real PG/Redis | VERIFIED | — |
| 1M scale | estimates only | none at 1M | INCONCLUSIVE | §14 next steps |
| Deployment reproducibility | PASS (clean image+container) | Phase 1 proof | VERIFIED | owner commit (R1, admin) |
| Data integrity | PASS (0 dup groups, UNIQUE) | prod constraint + races | VERIFIED | — |

## 18. Unresolved risks

1. MySQL full-chain rot (P2; fix direction documented; non-prod target).
2. Git-tracking gap R1 (administrative; commit forbidden to agent phases).
3. 1M unclaimed by design (INCONCLUSIVE).
4. Provider history volume needs a staging phone + operator action.

## 19. Exact final classification

- No P0. No P1. No safety breach. No unexplained drift. All gaps classified
  with evidence. Source unchanged (no scope drift).
- **19.3.6: CERTIFIED (final evidence-gap closure)** — with gaps honestly
  labeled: 1 × PARTIALLY VERIFIED (MySQL objects), 2 × UNVERIFIED
  (provider volume, MySQL chain), 1 × INCONCLUSIVE (1M).
- ENGINEERING STATUS: all implementable proofs PASS. ENVIRONMENT/PROVIDER
  STATUS: staging phone absent, MySQL mirror predates this roadmap, 1M
  unmeasured — none of which indicts the implementation.

`docker cp dependencies: 0` · `production-critical ephemeral: 0` ·
`unexpected drift: 0` · `prod experimental writes: 0`
