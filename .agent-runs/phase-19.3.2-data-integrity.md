# Phase 19.3.2 — Duplicate-Pair Data-Integrity Report

Date (UTC): 2026-09-05
Subject: the duplicate `(instanceId, providerMessageId)` pair that caused the
`message_reliability` UNIQUE constraint to be intentionally skipped in Phase 19.3.1.
Policy: NO deletes/updates/merges performed. No migration history touched. No constraint
marked applied. No 100K. No commits. All repro on disposable scratch rows only
(`secretmig19_3`), fully cleaned (verified 0 leftovers).

---

## 1. Duplicate identity / invariant

Skipped invariant: `UNIQUE ("instanceId", "providerMessageId")` on
`evolution_api."Message"` (constraint name
`Message_instanceId_providerMessageId_key`, declared as
`@@unique([instanceId, providerMessageId])` in `prisma/postgresql-schema.prisma`
but absent from the database).

Duplicate pair (metadata only — no bodies printed):

- Row 1: `id=cmtlyswps00f5mz7ggfn06x1d` · Row 2: `id=cmtlytttj03u6mz7gw7vwrfm1`
- `instanceId=7df47cb1-07e1-4a2d-8f49-559be44a6954` (instance `123`,
  `WHATSAPP-BAILEYS`, `connectionStatus=open`, `tenantId=NULL` — legacy-unscoped)
- `providerMessageId=key.id=3AF3938767564324C6C6`, `conversationId=120363407913914196@g.us`
  (group), `messageType=conversation`, `source=ios`, `status=DELIVERY_ACK`,
  `fromMe=false`, `pushName=33195869368524`, `messageTimestamp=providerTimestamp=1788025415`
- `lifecycleState=RECEIVED`, `version=1`, `correlationId/sessionId/eventTimestamp/
  participant/originalIdentifiers` all NULL/empty on both rows
- Payloads **byte-identical**: md5(key)=2383117c… on both, md5(message)=fe5a8b51… on
  both, md5(contextInfo) equal, 149-byte message on both
- Creation times decoded from cuid timestamps: row 1 `2026-09-03T20:15:43.264Z`, row 2
  `2026-09-03T20:16:26.167Z` — **42.9 s apart**

## 2. Root cause — **B. historical double-ingestion** (with a live-path caveat, §5)

- **Not A (legitimate data):** byte-identical provider payloads under one provider id
  cannot be two distinct business messages.
- **Not D (backfill artifact):** rows were created 2026-09-03; the backfill ran 2026-09-05
  and only filled NULL columns (verified: column did not exist before the migration).
- **Not a single-request double insert:** 42.9 s separation rules out one transaction
  inserting twice.
- **Verdict B:** provider redelivery ~43 s later (WhatsApp retry/resync behavior) was
  persisted a second time. First divergence point: **message persistence** — on 2026-09-03
  the Baileys `messages.upsert` legacy path executed a bare
  `prisma.message.create({data: messageData})`
  (`whatsapp.baileys.service.ts:1442`) with **no existence check of any kind**.
  Journal/outbox cannot arbitrate: `EventJournal` holds **0 rows total** in `evolution_db`
  (journal pipeline never ran here; `INBOUND_PIPELINE_MODE` unset → `legacy`, bridge no-op),
  and `MessageUpdate` holds 0 rows for these messages.
- Excluded alternative: the Sept-3 code predates `MessageReliabilityService` (landed with
  the Sept-4 enterprise squash), so the old path had no protection at all.

## 3. Ingestion trace (both records)

provider event (same Baileys `messages.upsert` payload, same `key.id`, 43 s apart)
→ journal: **no record** (journal empty DB-wide)
→ normalization: same bytes (md5-verified)
→ identity: same conversation/group (no identity writes involved; `originalIdentifiers` empty)
→ persistence: **two independent `message.create` calls, different cuids** ← divergence
→ outbox/webhook: presumed fanned out twice (legacy `sendDataWebhook` path has no dedup;
  historical, not re-verifiable from retained rows).

## 4. Reproduction result (real code + real PG, scratch `secretmig19_3`, cleaned)

`MessageReliabilityService.processInbound` (current code):

- **Sequential redelivery:** 1st `duplicate=false`, 2nd `duplicate=true`, **1 row** —
  the canonical path catches exact redeliveries even without the DB constraint
  (`findUnique` returns the first row; verified live: returned `cmtlyswps…`, no throw).
- **Concurrent redelivery, two service instances (two workers):** `dup=[false,true]**,
  **1 row** — second worker's check saw the winner's commit.
- **Race loop, 25 iterations:** **0/25 produced duplicates.** The check-then-insert window
  is narrow on one host but remains **theoretically open** (no DB-level enforcement; the
  `P2002→duplicate` safety net cannot fire without the constraint).
- **Legacy direct-create path** (the actually-live path): no check exists — a redelivery
  today recurs deterministically. Not executed against prod (would write prod rows);
  established by code inspection of the running path (`:1442` + `legacy` bridge no-op).

## 5. Current protection status

| Layer | Status |
| ----- | ------ |
| Canonical pipeline redelivery check (`findUnique` → `duplicate:true`) | WORKING (proven §4), but only when `INBOUND_PIPELINE_MODE != legacy` |
| `P2002` race net | DEAD without the DB constraint |
| Journal Tx1 dedup | INACTIVE here (journal empty; legacy mode) |
| Live Baileys path (`legacy` = container default) | **UNPROTECTED — direct create, no check** |
| Tx2 identity-race fix (19.2.6) | Intact, orthogonal (identity placement, not message dedup) |
| In-memory `messagesRepository` / redis timestamp cache | Process-local / counter-only — not persistence dedup |

## 6. Classification — **P1**

A redelivery on the live (legacy) path reproduces the duplicate deterministically today:
message idempotency is violable on the active code path, with fan-out consequences
(duplicate history rows, duplicate webhooks/chatwoot sync). Impact currently contained
(1 pair in 2745 rows, single legacy group instance), recurrence needs a provider
redelivery — but per the standard, a currently reproducible idempotency violation stays
P1 until fixed and tested. The canonical path is protected; the DB-constraint backstop
and legacy-path handling are both missing.

## 7. Constraint decision — **2. DBA_CLEANUP_REQUIRED**

- Not `SAFE_TO_ADD` (would fail 23505 on the live pair).
- Not `CONSTRAINT_REQUIRES_DIFFERENT_INVARIANT` (the invariant is correct and already in
  the Prisma schema).
- Not `BUG_FIX_REQUIRED_BEFORE_CONSTRAINT` as a blocker: the canonical path is proven;
  the required package is cleanup → constraint → legacy P2002-skip handling, tested.
- Required DBA review before any destructive step: confirm both rows describe the same
  provider event (evidence §1–§2 attached), pick the surviving row (recommend row 1 =
  first ingested), confirm no downstream references depend on the doomed row id
  (`MessageUpdate.messageId`, `MessageLifecycle.messageId`, outbox payloads, chatwoot
  mirror ids), then delete exactly one row and add the constraint. **Not executed here.**

## 8. DBA-required action

Adjudicate the pair (`cmtlyswps00f5mz7ggfn06x1d` vs `cmtlytttj03u6mz7gw7vwrfm1`),
delete the loser, then apply:
`ALTER TABLE "evolution_api"."Message" ADD CONSTRAINT
"Message_instanceId_providerMessageId_key" UNIQUE ("instanceId", "providerMessageId");`
in a follow-up migration, together with a `P2002 → duplicate-skip` guard around the
legacy `message.create` at `whatsapp.baileys.service.ts:1442` (else the constraint turns
the next redelivery from silent-duplicate into loud-error). Re-run this report's repro
afterward.

## 9. Tests (all PASS, real)

- Repro: sequential redelivery → `duplicate=true`, 1 row; concurrent two-worker → 1 row;
  25-iteration race loop → 0/25 duplicates; scratch cleanup verified 0/0/0.
- `findUnique` on the live duplicate pair → returns first row, no throw (read-only).
- Suites: `message.reliability` 13/13, `journal.durable` 14/14,
  `inbound.isolation.19_2` 2/2, `identity.resolution` 13/13,
  `live.inbound.cutover.13_7` 10/10, `backpressure.19_2` 8/8, `unified.inbox` 10/10,
  `session.fencing.19_2` 10/10. Carried (src unchanged): governance 20/20, tenant
  isolation 9/9. (One `evolution-redis` DNS error line in a host-run test log is env
  noise; the suite passed.)

## 10. Whether the issue blocks 100K

**Yes — conditionally.** The 50K evidence is NOT invalidated (§11), but 100K at higher
ingest concurrency widens the unprotected race window (§4) on top of the already-open
legacy path. Required before 100K: execute §8 (cleanup + constraint + legacy skip
handling + re-run of this repro). The stop condition (no 100K this phase) is respected.

## 11. Remaining certification blockers (unchanged + one refined)

1. P1 (this report): duplicate adjudication + constraint + legacy skip handling.
2. P1 (19.3.1): `Tenant`/`UserSession`/billing lineage tables absent — schema ≠ models
   for those paths; follow-up migrations needed.
3. P2: skipped phase-17 FK/indexes to add when base tables land; image/repo SQL drift
   (rebuild image with corrected files); lease-acquire p50 under storm.
4. NOT TESTED carries over: network chaos, provider-timeout/webhook/n8n real outages,
   kill-during-50K. NOT CERTIFIED standing unchanged; max evidence-backed scale stays 50K.

### 50K recheck (STEP 8, no rerun)

The 50K run exercised the **control plane** (`Instance`/`SessionLease`/
`WorkerRegistration` on scratch `scale19_3`): seed/assign/discover/lease/renew. Message
persistence, dedup, and the `Message` table were never in its path, and its dataset is
disjoint from `evolution_db`. The duplicate finding therefore **does not intersect the
50K evidence** — seed 50000/4243 ms, discovery 50000/50000, 400/400 leases
double-owned=0 all remain valid as control-plane measurements.
