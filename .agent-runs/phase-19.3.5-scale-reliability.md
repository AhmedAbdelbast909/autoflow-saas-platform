# Phase 19.3.5 — Scale & Reliability Report (100K gate)

Date (UTC): 2026-09-06
Objective: evidence-backed operating scale at 100,000 control-plane objects,
then a justified 1M decision. No commits. No prod contact (all scratch
`scale100k`/scratch redis). No 1M run. Nothing fabricated.

---

## 1. Baseline (3.1)

50K control-plane evidence (prior phases, `scale19_3` DB): seed 50000/4243 ms,
discovery 50000/50000, 400/400 leases, double-owned=0. Verified untouched
(`scale19_3` today: 0 instances / 0 leases — dataset was cleaned, measurements
stand in reports). 50K is control-plane-only (Instance/SessionLease/
WorkerRegistration), disjoint from the message path — kept separate here too.

## 2. 100K dataset (3.2) — REAL PG (`scale100k`, fresh 73-migration deploy)

`scale.19_2.pg.test.ts` with `SCALE_INSTANCES=100000` (only change: env count):

- seed: 100000 instances in 8083 ms (~12.4K rows/s, createMany ×1000)
- assignment: 4 workers in 27 ms, shards/worker = [273, 265, 240, 246] / 1024
  (23.4–26.7%, no worker starved)
- discovery: 100000/100000 rows via shard slices in 28170 ms, per-worker
  [26596, 25960, 23513, 23931] summing EXACTLY to 100000 (zero overlap —
  perfect partition on this dataset)
- control-plane API surface exercised: keyset paging (500/page), shard-chunk
  scan, tenant-scoped instance reads

## 3. Lease test (3.3) — 400/400, double-owned=0

400 concurrent acquires across 4 owners in 367 ms (1090 ops/s),
p50=320 / p95=333 / p99=365 ms, double-owned=0, 0 lost. Renew storm: 400
durable validations in 35 ms, p95=34 ms. Contended acquire returns null (not an
error); tenant mismatch throws (fencing intact).

## 4. Shard test (3.4) — PASS

- Deterministic assignment (`shardForInstance` stable) + measured balance §2.
- Worker LEAVE (real PG, `scale.real.19_3_5` S1): killed 4th coordinator's
  registration → 3 survivors re-sync → union=256/256 shards, overlap=0;
  rediscovery through survivors still covers all 2000/2000 test rows.
- Join covered by 4-worker sync in §2 (27 ms steady state).
- Suite `shard.19_1` 40/40 (layering invariants, offline fake).

## 5. Rate limit, real Redis (3.5) — PASS (S4, live `redis19_3`)

`DistributedRateLimiter` over node-redis client: tenant isolation (A capped,
B unaffected) · exact bound (5 allowed, 6th denied with retryAfterMs) ·
window expiry → re-admitted · outage (container stopped) → no throw, bounded
local-fallback verdicts · recovery → exact counting resumes · latency n=200
p50=1 / p95=2 / p99=2 ms. Suite `rate.limit.distributed` logic unchanged.

## 6. Backpressure (3.6) — PASS

Suite 8/8 (ordering/rate-limit/dispatch-query logic) + real-DB gauge evidence
carried from Phase 2 R8 (`pendingDepth`/`retryBacklog` observed live during
backlog+drain). Ingest/persist/journal never await fanout (code-verified,
unchanged). Memory: harness heap +27.4 MB over the 100K run (IDs held in Set —
see §9 sizing note).

## 7. Failure injection (3.7) — PASS, all scratch, all bounded

- Worker crash (S1): registration deleted, heartbeats stop → shards fully
  re-owned, no overlap, no unassigned shard.
- Lease holder loss (S2): TTL lapse without renew → new owner acquires,
  stale holder fenced on assert, exactly 1 lease row, correct owner.
- Release/handover (S3): release → other owner acquires; race → null.
- Redis restart (S4): outage contained, recovery exact.
- DB bounce (S5): new acquire with DB down throws fail-closed (<30 s wall);
  lapsed window throws; restart → re-acquire + durable assert pass, exactly
  1 lease row, same owner. Prod DB never touched (scratch `pg19_3` only).
- Suites: fencing 10/10, ownership 31/31.

## 8. Observability (3.8) — SUFFICIENT

Suite 11/11 (health/metrics/prometheus-shape) + live counters exercised in
Phase-2/3 runs (fanout totals, per-destination, DLQ, replay, rate-limit
fallback, ownership conflicts) + DB-state proof queries (leases/workers/
backlog/state rows). No required metric depends on missing telemetry.

## 9. 1M decision (3.9): **INCONCLUSIVE (do not claim 1M)**

For 1M: seed extrapolates fine (~80 s at 12.4K/s); discovery extrapolates to
~5 min/full-scan at measured 3.5K rows/s single-harness (prod uses 25-way
concurrent loading — NOT measured here). Against 1M: lease contention tested
only at 400 racers (not 100K); renew storm only 400-wide; single-host harness
(4 in-process coordinators, no multi-host split-brain test); no 1M Redis
cardinality test; in-worker scan memory (+27 MB/100K IDs → ~270 MB/1M) needs
sizing validation. No structural blocker found at 100K. Recommended next step:
250–500K with multi-process workers + scaled lease storm before any 1M claim.
**1M: INCONCLUSIVE — NOT SUPPORTED BY EVIDENCE.**

## 10. Performance accounting (3.10) — measured only

Seed 100K/8.1 s · discovery 100K/28.2 s · lease 400/400 in 367 ms
(p50=320/p95=333/p99=365, 1090 ops/s, 0 dup-owned, 0 lost) · renew 400/35 ms
(p95=34) · redis check p50=1/p95=2/p99=2 ms · error rate 0 across scale runs ·
backlog/drain demonstrated (S1/R8/N2) · heap +27.4 MB/100K run.

## 11. Regression (3.11)

100K scale run complete · S-matrix 5/5 · shard 40/40 · fencing 10/10 ·
ownership 31/31 · backpressure 8/8 · observability 11/11 · Phases 1–2 suites
carried (source byte-unchanged; git still 121 paths, same 10 tracked files).
Scratch zeros verified (`scale100k`: 0/0/0; empty DB left in place, documented).
`scale19_3` untouched. Prod re-verified HTTP 200.

## 12. Repairs (3, honest log)

1. Tenant `clientName` uniqueness in seed (schema constraint, harness-side).
2. Redis client `error`-listener + `docker wait` ordering (uncaught emitter
   crash + stop/start race that left scratch containers Exited).
3. S5 rewritten to the real contract (local ride-out is correct behavior;
   fail-closed proven at acquire + lapsed-window). One syntax slip fixed
   immediately. No app-code change in any repair.

## 13. P0/P1: none opened, none residual.

## 14. Certification: **CERTIFIED (100K control-plane scale)**

Gate: 1. 100K real evidence ✓ · 2. zero double-owned ✓ · 3. sharding correct
(balance measured, leave/rediscovery proven) ✓ · 4. isolation intact ✓ ·
5. real-Redis rate limiting ✓ · 6. backpressure ✓ · 7. failures recover ✓ ·
8. observability sufficient ✓ · 9. regression ✓ · 10. no P0/P1 ✓.
Scope: control-plane (Instance/lease/shard/rate-limit) at 100K on single-host
scratch infra. NOT certified: message-path volume at scale, multi-host
behavior, 1M (INCONCLUSIVE, §9).
