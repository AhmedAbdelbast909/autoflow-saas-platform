# Phase 19.3.3 — Maximum History + Durable Multi-Webhook Report

Date (UTC): 2026-09-05
Scope: history recovery through the canonical pipeline + durable N-destination
webhook fanout. No commits. No 100K/1M. Live session never reconnected/forced.
All test datasets disposable (scratch `secretmig19_3`), verified cleaned.

---

## 1. Current architecture audit (pre-existing)

- Provider: `baileys@7.0.0-rc12`; WA-Web version fetched live (`fetchLatestWaWebVersion`).
  (Adapter metadata string still says rc.9 — doc drift, harmless.)
- `syncFullHistory` is a per-instance setting, honored at socket creation; group-JID
  filtering already respects it. `shouldSyncHistoryMessage` gates Chatwoot import only.
- `messaging-history.set` handler did legacy-only persistence with an in-memory
  dedup set (full-table `findMany` into RAM) and a **Chatwoot age gate that returned
  early for the whole batch** — the Part-D violation this phase removes.
- Canonical pipeline (journal → normalize → identity → persist → outbox) existed and
  was proven idempotent (19.3.2.x), but history never used it; journal was empty.
- Webhook infra existed for the single-destination model: outbox + HMAC + SSRF guard
  + retry/backoff + DLQ + attempts + health + bounded worker. No destination registry,
  no fanout, no per-destination state.

## 2. Baileys history capabilities (pinned 7.0.0-rc12, verified in code)

- `syncFullHistory` flag ✓ / `shouldSyncHistoryMessage` gate ✓ /
  `HistorySyncType` INITIAL/RECENT/ON_DEMAND observed in handler ✓ /
  `fetchMessageHistory(count, key, ts)` used in-code (on-demand path exists) ✓.
- `messaging-history.set` delivers `{chats, contacts, messages, isLatest, progress,
  syncType}` batches; `messageTimestamp` may be Long (handled).
- Browser: `CONFIG_SESSION_PHONE` CLIENT/NAME or Baileys default — **unchanged**
  (fingerprint stability; no evidence a Desktop-like string increases sync on this
  version, so no claim and no change).
- Provider limits (batch sizes, retention window, per-sync caps): **UNVERIFIED** —
  forcing a reconnect on the live production session to measure them was out of scope
  and unsafe. Verdict: MAXIMUM AVAILABLE HISTORY, never guaranteed-full.

## 3. Maximum-history configuration

- `syncFullHistory` remains an explicit per-instance operator setting (default false).
  NOT auto-enabled globally: flipping it changes live session sync behavior.
- On-demand history: new `HistoryOnDemandService` (bounded count ≤200, single-flight
  per anchor, explicit `{supported:false}` capability result, provider errors reported
  honestly). Tested: unsupported client, bounds, single-flight, error honesty.

## 4. Provider limitations (explicit)

See §2. Anything about WhatsApp-side retention/volume is UNVERIFIED. Local pipeline
loss is distinguishable from provider limits by construction: every batch reports
received/persisted/duplicate/failed, journal keeps FAILED rows, state machine keeps
PARTIAL/FAILED — so a short sync shows up as measured numbers, never silent loss.

## 5. History ingestion architecture

New `HistoryIngestService`: `messaging-history.set` → per-message canonical
`pipeline.ingestInbound` with `source='history_sync'` + `syncRunId/batchId/progress/
isLatest` in the event (verified persisted in the Message row: `source=history_sync`,
`syncRun=…`). No separate historical model. Baileys handler now runs canonical
ingest FIRST, then the legacy historic path unchanged (DB unique invariant +
`skipDuplicates` make the legacy write a no-op for already-canonical rows).
Chatwoot age gate now filters only the Chatwoot import (Part D fixed).
Media: messages persist before any media fetch; media adaptation runs post-persist on
the canonical row (unchanged semantics); media failure cannot fail ingestion.

## 6. History state machine

New durable `HistorySyncState` (migration PG+MySQL, applied to production):
PENDING → RUNNING → COMPLETED | PARTIAL | FAILED. One open RUNNING run per instance
(reused across batches/reconnects — resume); overlap refused; COMPLETED only on
`isLatest` (with failures → PARTIAL); terminal states immutable; overlap + counts +
timestamps + failureReason persisted. Tested (H8).

## 7. History/live race results

- H5 history答live concurrent same pmid → 1 row. H4/H6 replay/restart → duplicates
  only, 1 row. H11 raw second insert → P2002 at the DB layer.
- 19.3.2.2 evidence carries over: 25-worker race 24 dups / 1 msg / 1 outbox.
- UNIQUE(instanceId, providerMessageId) is the database backstop (enforced in prod).

## 8. Idempotency results

Sequential/concurrent/restart/replay redeliveries all converge to 1 message + 1
outbox; duplicates classified (`duplicate=true`) with no second row, no second outbox
(H4/H5/H6/H10/H12 + race suites). P2002 race-loss path armed in legacy create.

## 9. Identity/LID findings

History ingest resolves through the standard identity path; LID/alternate JIDs pass
through (`remoteJidAlt`/`lid` preserved in input, canonical conversation non-null —
H9). No PN-assumption: resolution is the shared service, not history-specific.

## 10. Media behavior

Unchanged architecture (persist-first, async/retryable fetch, separate tracking);
history rows carry the same media fields as live rows (prepareMessage parity for the
legacy copy; canonical row holds normalized payload + legacy wire in outbox).

## 11. Multi-webhook schema (migration PG+MySQL, applied to production)

`WebhookDestination` (per-instance, `@@unique([instanceId, name])`, events/headers/
secretRef/timeouts/attempts/backoff/status/counters) and `WebhookDelivery`
(`@@unique([eventId, destinationId])`, PENDING→PROCESSING→DELIVERED|RETRY_WAIT→
FAILED(permanent)|DEAD_LETTER(exhausted), attempts/nextAttemptAt/latency/httpStatus/
errorClass + indexes). No plaintext secrets (secretRef → WebhookSecret rows).

## 12. Fanout architecture

`WebhookFanoutService.fanout(event, destinations)` → one delivery row per
(eventId, destinationId), idempotent on re-fanout → `processPending` worker with
global + per-destination concurrency bounds → `deliverOne` (claim via conditional
update, SSRF re-validation, idempotency headers, HMAC, classified retry).
Canonical outbox is the body source of truth (lookup by deterministic dedupKey,
never latest-row). Failures are per-destination isolated by construction (no shared
locks). Legacy single `Webhook` row adapts as an implicit destination (Part Z);
n8n is an ordinary destination (Part U). Batching: message-by-message preserved
(compatibility); no payload-semantics change.

## 13. Retry policy

Bounded exponential backoff + jitter (`initialBackoffMs * 2^attempt`, 5-min cap),
persisted `nextAttemptAt`; timeout/DNS/429/5xx retry; 4xx terminal FAILED (not
DEAD_LETTER); exhaustion → DEAD_LETTER with attempt accounting; per-destination
`maxAttempts`; replay reuses the same row (attempts reset, auditable).

## 14. HMAC contract

Reused `WebhookHmacService`: header `t=<ts>,v1=<hex>,nonce=<n>,v=<ver>` over
`<ts>.<nonce>.<body>` (sha256); 300 s replay window; nonce replay cache; rotation via
versioned secrets; constant-time compare. Tests: valid/invalid/modified/stale/
wrong-secret/replayed-nonce (W7).

## 15. SSRF/security analysis

Egress guard enforced at destination create/update AND per delivery (DNS/ownership
drift covered); `maxRedirects: 0`; 1 MB response cap; per-destination timeouts;
tenant-scoped CRUD (server-side instance→tenant resolution + caller-binding match, no
tenant-less path); secrets by reference only; deliveries carry no secret material.
Tests: metadata-IP + gopher URLs rejected (W8); cross-instance reads return null.
No new SSRF surface introduced (all URLs pass the pre-existing guard twice).

## 16. n8n integration

n8n receives canonical events as a named destination through the identical fanout
path (W10 proves ordinary treatment). No privileged n8n-only delivery path exists.
n8n outage retries independently without touching canonical rows (W2/W3 pattern).

## 17. Legacy compatibility

Pre-existing `Webhook` row → implicit `legacy:<instance>` destination honoring its
URL/events/enabled (W9 proves delivery). Existing `webhookUrl/webhookEvents/
webhookByEvents` clients keep working; payload shape and event names unchanged.

## 18. Backpressure

Global + per-destination concurrency bounds in `processPending`; queue-depth, oldest-
pending-age, active-delivery, retry-backlog gauges; slow destination cannot stall
others (W13: 300 ms-poisoned A with cap 1, all 8 deliveries complete < 2 s).
Ingest/persist/journal never await fanout (enqueue-only coupling).

## 19. Dead-letter/replay

Exhaustion → DEAD_LETTER (W11); `replay()` allows DEAD_LETTER/FAILED only, reuses the
same event+destination identity with attempts reset (W12); deliveries listing per
destination; test-ping endpoint creates a bounded (`maxAttempts: 1`) probe delivery.

## 20. Real staging history evidence (honest split)

- PROVIDER_AVAILABLE_HISTORY: **UNVERIFIED** — no forced reconnect on the live
  production session (unsafe, out of scope).
- LOCAL_PERSISTED_HISTORY: **PROVEN** — fixture batches through the REAL Baileys
  handler shape → REAL pipeline → REAL PostgreSQL: sequential/duplicate/restart/old-
  timestamp batches persist exactly once with state-machine accounting (H2–H9).
- WEBHOOK_DELIVERED_HISTORY: **proven with fake transport** (injectable HttpClient;
  no real external egress performed): history outbox → healthy delivered + dead
  retries alone + canonical row intact (W16/W17).
- Control-plane APIs proven against PRODUCTION (real container + real DB):
  create 201 → list → get → update → delete 200 → empty.

## 21. Real webhook evidence

W-matrix ran against REAL PostgreSQL (scratch): W1–W17 semantics proven; burst
measurement: 1000 events × 2 destinations enqueued in 3652 ms, 2000/2000 delivered,
0 remaining. Destination latencies measured with fake transport (sub-ms, not
network-representative — recorded, not claimed).

## 22. Regression results (all PASS, post-change code)

`tsc` 0 · `eslint` 0 · backend `tsup` build success · H-matrix 12/12 · W-matrix 13/13 ·
reliability 13/13 · cutover 10/10 · journal 14/14 · webhook.delivery 13/13 ·
tenant.authz 11/11 · phase-15 isolation 9/9 · inbound.isolation 2/2 · backpressure 8/8 ·
fencing 10/10 · inbox 10/10 · identity 13/13 · webhook.secrets 10/10 · credentials
12/12 · governance 20/20 · Prisma validate (both schemas) + generate PASS ·
`migrate status`: up to date · container (new code): running, 0 restarts, HTTP 200.

## 23. Performance metrics (measured, not extrapolated)

- Burst: enqueue 3.65 ms/event-delivery pair; drain of 2000 deliveries within worker
  loop bounds (40×100-batch ceiling, completed).
- History ingest: sequential per-message pipeline calls (deterministic; no batch
  parallelism by design — ordering per conversation).
- No 100K/1M claims; no network-latency claims.

## 24. Remaining limitations

1. Provider-side history volume/retention UNVERIFIED (no forced reconnect).
2. `syncFullHistory` default unchanged (false) — maximum-history posture is
   operator-opt-in per instance.
3. Image/repo drift persists (image ships 59 migrations; container enriched via
   `docker cp` of repo schema+migrations — ephemeral, lost on image rebuild;
   rebuild must include the corrected set).
4. MySQL mirror applied to files only (live-apply NOT TESTED; MySQL not prod target).
5. Test-ping delivery path exercised live only for CRUD (ping send not live-fired).
6. Baileys adapter metadata string says rc.9 vs installed rc.12 (cosmetic drift).

## 25. Certification decision: **CERTIFIED (scoped)**

Checked against the gate blockers: P0/P1 — none (new or residual); failed critical
tests — none (H 12/12, W 13/13, 14 regression suites); tenant-isolation failure —
none (W8 + authz + phase-15 green); durable-delivery failure — none (isolation,
retry, DLQ, replay proven); duplicate persistence — none (1-row outcomes + DB
backstop); SSRF — guarded twice + tested; unbounded retries/concurrency — bounded
(maxAttempts, caps, gauges). Provider-vs-local distinguishability: local loss is
impossible to hide (counters + journal FAILED + PARTIAL/FAILED states) and provider
bounds are labeled UNVERIFIED rather than claimed.

Scope of CERTIFIED: local history pipeline + state machine + fanout/delivery
subsystem on real infrastructure. Explicitly NOT certified: provider-side history
volume, external-network delivery latencies, 100K/1M scale.

**50K control-plane evidence: STILL VALID** (disjoint path/dataset, untouched).
Standing change: phases 19.3.x subsystem certifications accumulate; overall
production certification remains NOT CERTIFIED pending scale/chaos phases (unchanged
policy — this phase certifies only its own scope).
