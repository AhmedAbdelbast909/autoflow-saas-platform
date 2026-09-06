# Phase 19.3.2.2 — Duplicate Adjudication Report (P1 closure gate)

Date (UTC): 2026-09-05
DB: `evolution_db` / `evolution_postgres` (schema `evolution_api`)
Policy: no commits; no 100K/1M; no 19.3.3 work; no bulk/un guarded operations; no
migration-history edits beyond one new additive migration; live session untouched.

---

## 1. Starting state

- 97 duplicate `(instanceId, providerMessageId)` groups / 194 rows (all ×2, zero ×3+),
  all on instance `7df47cb1…` (`123`, Baileys, legacy null-tenant).
- 1 row deleted in 19.3.2.1 (authorized pair `cmtlyswps…` retained /
  `cmtlytttj…` removed): **96 groups / 192 rows remaining** at phase start.
- UNIQUE constraint absent (migration skipped it); P2002 net dormant; live path already
  canonical-forced in code (19.3.2.1, container running it).

## 2. Duplicate discovery methodology

Detection query (read-only, rerun verbatim at start, after cleanup, and at end):
`SELECT "instanceId","providerMessageId",count(*) FROM "Message"
WHERE "providerMessageId" IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1`.
Per-group inventory query added: row ids, payload-hash variants
(md5 of key+message+contextInfo), conversation/type/fromMe/status variants, msg length
min/max, and correlated `MessageUpdate` / `MessageLifecycle` reference counts.
(Caveat recorded: first analysis pass misread UTF-16 output as non-uniform; re-ran with
correct decoding before any decision.)

## 3. Full duplicate inventory

- 96/96 groups: exactly 2 rows, 1 payload variant, 1 conversation/type/fromMe variant,
  equal lengths, same instance. Zero groups > 2. Zero ambiguous-invariant groups
  (all pairs share one instance; provider scope uniform).
- 88/96 pristine (no downstream refs, both rows same status).
- 8/96 with status progression + exactly one `MessageUpdate(READ)` child each — detail
  pull proved the child always references the OLDER row (which already reads READ)
  while the newer duplicate sits at DELIVERY_ACK with no children.
- Cross-checks: `OutboxEvent` refs to all 96 doomed ids = 0; `Media` filename refs = 0;
  `GovAuditEvent` / `AutomationExecution` tables absent in this DB (no refs possible);
  quoted-message references point at provider `key.id`, which survives on retained rows.
- Cuid-timestamp decode verified older-first ordering for all 96 (0 order issues).

## 4. Confirmed uniqueness invariant

**`UNIQUE ("instanceId", "providerMessageId")`** on `evolution_api."Message"`.
Why: provider ids are instance-scoped (Baileys `key.id`, Meta wamid, Evolution v4
fabrications occupy different namespaces — a global `providerMessageId` rule would be
false; the provider-migration policy documents `provider:instance:providerMessageId`
as the dedupKey, and instance rows are provider-bound). Matches the Prisma schema
`@@unique`, the reliability-service `findUnique` key, and the 19.3.2.1 P2002 target.

## 5. Per-pair classification

- **SAFE_TO_DELETE: 96/96** (88 pristine + 8 update-anchored-on-retained, each proven:
  byte-identical, same invariant identity, same logical message, redundant newer row,
  no unsafe downstream dependencies).
- **DBA_REVIEW_REQUIRED: 0. DIFFERENT_INVARIANT: 0. BUG (new): none.**

## 6. Safe deletions performed

96 guarded `DO` blocks (each: assert pair count = 2, retained row present, payload
hashes equal, no MessageUpdate/Lifecycle refs on doomed row, PK+scope-qualified
DELETE, `IF NOT FOUND` abort; `EXCEPTION WHEN OTHERS → NOTICE`, per-pair isolation).
First execution attempt's output grouping was ambiguous, so the run was re-verified
row-by-row instead of assumed: **96/96 verified** (pair count = 1, retained present,
doomed absent). Second run correctly skipped everything (idempotent guards).
Retain rule: older (first-ingested) row in every pair.

## 7. DBA-review items

None remaining from this inventory (0 DBA_REVIEW_REQUIRED). Standing DBA notes (not
blocking): chatwoot-mirror duplicates (external, unverifiable here); future image
rebuilds must include corrected SQL (image ships 59 stale migrations).

## 8. Exact row-count accounting

- Before this phase: 96 groups / 192 dup rows (`Message` total 2744).
- Deleted in 19.3.2.1: exactly 1. Deleted in this phase: exactly 96.
- Remaining duplicates: **0 groups**. Remaining DBA-review groups: **0**.
- Current `Message` total: 2666 = 2744 − 96 + 18 live-arrival rows (live ingest on the
  production instance during the session; dup_groups = 0 proves none are duplicates).
- Unexpected modifications: **0** (only the 96 guarded single-row deletes plus the
  additive constraint migration; no updates/merges/backfill changes).

## 9. Downstream consistency results

Post-cleanup dangling check over all 96 doomed ids: `MessageUpdate` 0,
`MessageLifecycle` 0, `MessageVersion` 0. No dependent records were deleted or altered
to enable cleanup.

## 10. Exact UNIQUE DDL/index

New migration `20250906090000_phase19_3_2_2_message_dedup_unique` (PG + MySQL mirror):
PG: guarded `DO` block —
`ALTER TABLE "evolution_api"."Message" ADD CONSTRAINT
"Message_instanceId_providerMessageId_key" UNIQUE ("instanceId", "providerMessageId")`
(`IF NOT EXISTS` on `pg_constraint`; NULL pmids unaffected per PG semantics, matching
the migration guard logic). Applied via `migrate deploy`: "All migrations have been
successfully applied"; `migrate status`: up to date (72); constraint verified in
`pg_constraint` with correct definition. MySQL mirror: plain `ADD CONSTRAINT … UNIQUE`
(applied-once semantics; live-apply on MySQL NOT TESTED — MySQL is not the production
target; generation-compat proven via `prisma generate`).

## 11. P2002 implementation verification

19.3.2.1 guard re-reviewed against the now-live constraint: catches exclusively
`code === 'P2002'` with `meta.target` referencing `providerMessageId` (array or string
form), reuses the winner via scoped `findFirst`, rethrows on missing winner or any
other error (including other P2002 targets). Transaction correctness preserved
(no swallowed conflicts; reliability-service P2002→duplicate path unchanged and now
armed).

## 12. Active-path verification

Baileys `messages.upsert` → `interceptBaileysMessage(mode:'canonical')` (per-caller
override; global default and Meta path untouched, single caller verified) → journal Tx1
→ normalize → identity-outside-tx → Tx2 message+outbox → `duplicate=true` skips legacy
persist AND media re-upload; legacy `create` remains solely as pipeline-failure
fallback (identity-carrying + P2002-guarded). Container running this code: `running`,
0 restarts, HTTP 200, startup deploy clean.

## 13. Real concurrency results (REAL PostgreSQL, scratch, enforcement active*)

(*scratch `secretmig19_3` enforces the same invariant via equivalent unique index —
verified in `pg_class`; enforcement parity with production.)
- Sequential redelivery (19.3.2.1, current code): `dup=[false,true]`, 1 row.
- 10-worker concurrent (19.3.2.1): 9 dups, **1 msg, 1 outbox**, 0 errors.
- 25-worker concurrent (this phase): **24/25 dups, 1 msg, 1 outbox**, 0 errors.
- Restart + redeliver: `dup=true`, still 1/1. Journals: exactly 1 per distinct message.
- Scratch cleanup verified 0/0/0. No prod rows written by any test.

## 14. Legitimate-message results (this phase, same harness)

Distinct pmids same instance → 3/3 rows; **same pmid in a different instance → accepted
(`duplicate=false`)** — cross-instance isolation proven, no over-blocking; group +
direct messages accepted; status updates (×2) preserved and redelivery still deduped.
Provider-specific exceptions: none found.

## 15. Regression results (all PASS, post-change code)

`tsc --noEmit` 0 · `eslint` 0 · `message.reliability` 13/13 ·
`live.inbound.cutover.13_7` 10/10 · `journal.durable` 14/14 · `webhook.delivery` 13/13 ·
`tenant.authz.19_3` 11/11 · `governance` 20/20 (plus 19.3.2: isolation 2/2, identity
13/13, backpressure 8/8, inbox 10/10, fencing 10/10, phase-15 isolation 9/9; no src
changes since those runs except the already-covered 19.3.2.1 edits). Backend `tsup`
build green in 19.3.2.1 (no src changes since). Prisma `validate` (both schemas) +
`generate` PASS. Full `test/all.test.ts` marathon: not run (targeted suites + race
harness instead — stated, not hidden).

## 16. 50K evidence status

**50K CONTROL-PLANE EVIDENCE = STILL VALID.** Unchanged reasoning (disjoint dataset and
code path), now strengthened: the message-path concern that motivated the recheck is
closed at the data layer (0 duplicate groups) with the invariant enforced.

## 17. Remaining risks

1. Historical chatwoot mirrors of the 97 deleted duplicates (external system; verify on
   next sync audit).
2. Journal/outbox tables will grow with canonical mode live — retention purges exist;
   monitor.
3. The 18 live-arrival rows during this session confirm active ingestion; any future
   redelivery now resolves to `duplicate=true` (proven) with the DB backstop armed.
4. NOT TESTED carries over: network chaos, provider-timeout real outages, kill-during-50K.

## 18. Final P1 classification: **CLOSED**

Certification checklist (§15): 1. all 96 groups + prior 1 classified with evidence —
YES; 2. every deleted row authorized (guards + verification) — YES; 3. no bulk
deletion (96 individually-guarded singles + 1) — YES; 4. zero unexplained duplicates
(dup_groups = 0) — YES; 5. UNIQUE invariant exists (constraint verified) — YES;
6. P2002 scoped — YES; 7. active path canonical (container running it) — YES;
8–10. real PG concurrency green, 1 row / 1 outbox — YES; 11. legitimate messages pass —
YES; 12. regression green — YES; 13. no new P0/P1 (one host-run Redis DNS log line is
env noise; suites green) — YES.

**P1 CLOSED.** Standing: NOT CERTIFIED overall (unchanged — 100K, chaos, and
residual P2s remain for later phases). Stop: no 19.3.3, no 100K, no commit.
