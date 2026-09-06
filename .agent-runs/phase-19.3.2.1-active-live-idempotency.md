# Phase 19.3.2.1 — Active Live-Path Idempotency Report (P1 gate)

Date (UTC): 2026-09-05
Scope: close the 19.3.2 P1 (double-ingestion on the ACTIVE Baileys live path).
Policy: no commits; no 100K/1M; no bulk cleanup; exactly one authorized row deleted;
no migration-history edits; no Baileys upgrade; live session untouched.

---

## 1. Previous P1 summary

Byte-identical double persistence of provider message `3AF39387…` (instance `123`,
group `12036340…@g.us`), rows 42.9 s apart, via a bare `message.create` with no
existence check on the legacy Baileys path (`whatsapp.baileys.service.ts:1442`, mode
`legacy` bridge no-op). Classification P1.

## 2. Exact duplicate pair + expanded scope discovery

Re-query confirmed the reported pair (`cmtlyswps…` retained-candidate,
`cmtlytttj…` doomed-candidate; identical md5 key/message; `DELIVERY_ACK` both).
Downstream refs for BOTH rows: `MessageUpdate` 0, `MessageLifecycle` 0, `OutboxEvent` 0.

**New material finding:** the pair is not alone — **97 duplicate
`(instanceId, providerMessageId)` pairs (194 rows, all exactly ×2, zero ×3+)**
exist on the same instance. All 97 verified byte-identical payloads with a single
`fromMe` variant each (168 conversation, 14 imageMessage, rest assorted). This is
systematic double-persistence, not an isolated incident. Out-of-scope pairs were NOT
touched (bulk cleanup forbidden) — this bounds what this phase can certify (§17).

## 3. Evidence used to select retained row

- Older cuid timestamp wins: `cmtlyswps…` = 2026-09-03T20:15:43.264Z (first ingested,
  canonical) vs `cmtlytttj…` = 2026-09-03T20:16:26.167Z (redelivery).
- Byte-identical payloads (either row is content-equivalent; first-ingested is the
  principled survivor).
- Zero downstream dependencies on the doomed row (§2).

## 4. Exact database change (ONE row, transactional, guarded)

```sql
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM evolution_api."Message"
      WHERE "id" IN ('cmtlyswps00f5mz7ggfn06x1d','cmtlytttj03u6mz7gw7vwrfm1')) <> 2
    THEN RAISE EXCEPTION 'guard: expected exactly 2 rows'; END IF;
  IF (SELECT count(DISTINCT md5("key"::text || "message"::text)) FROM evolution_api."Message"
      WHERE "id" IN (...)) <> 1
    THEN RAISE EXCEPTION 'guard: payloads not identical'; END IF;
  IF (SELECT count(*) FROM evolution_api."MessageUpdate" WHERE "messageId"='cmtlytttj03u6mz7gw7vwrfm1') <> 0
    THEN RAISE EXCEPTION 'guard: downstream refs exist'; END IF;
  IF (SELECT count(*) FROM evolution_api."MessageLifecycle" WHERE "messageId"='cmtlytttj03u6mz7gw7vwrfm1') <> 0
    THEN RAISE EXCEPTION 'guard: downstream refs exist'; END IF;
END $$;
DELETE FROM evolution_api."Message" WHERE "id"='cmtlytttj03u6mz7gw7vwrfm1';
COMMIT;
```

Result: `DELETE 1`, pair count → 1, `Message` 2745 → 2744. No other rows touched
(message count delta exactly −1, verified post-commit).

## 5. Unique invariant (determined, NOT applied — blocked)

- Correct composite key from schema + code: `(instanceId, providerMessageId)` —
  provider ids are instance-scoped (Baileys `key.id`, wamid, `Evolution` v4 fabrications
  differ per provider), so no global rule was invented. Constraint name (matches the
  Prisma `@@unique`): `Message_instanceId_providerMessageId_key`.
- Pre-add verification FAILED honestly: 96 duplicate pairs remain → creating the
  constraint now would fail (23505) and poison migration state. **No migration was
  created or applied.** Required DBA follow-up DDL (after adjudicating the remaining 96
  pairs exactly as §4 adjudicated this one):
  `ALTER TABLE "evolution_api"."Message" ADD CONSTRAINT
  "Message_instanceId_providerMessageId_key" UNIQUE ("instanceId", "providerMessageId");`

## 6. P2002 handling (implemented, scoped)

`whatsapp.baileys.service.ts` legacy-create branch: `try/catch` that reuses the winner
**only** when `code === 'P2002'` AND `meta.target` references `providerMessageId`
(array or string form); every other error (including other P2002 targets) rethrows,
and a missing winner also rethrows (never synthesizes a row). Dormant until the
constraint lands; then it converts the race loss into duplicate-reuse instead of a 500.

## 7. Active-path call graph BEFORE

`messages.upsert` → filters → `interceptBaileysMessage` (mode `legacy` → immediate
`noBridge`) → chat/contact updates → `prepareMessage` (no `providerMessageId` field) →
**bare `message.create`** → counters/media. Duplicate check: none (post-create redis
timestamp cache only gates unread counters).

## 8. Active-path call graph AFTER (edits, uncommitted)

1. `interceptBaileysMessage(..., mode: 'canonical')` — new per-caller `mode?` override
   (`inbound.cutover.bridge.ts`); global default stays `legacy`, Meta path untouched.
   Canonical ingest: journal Tx1 (dedupKey) → normalize → identity-outside-tx →
   Tx2 message+outbox (reliability check + P2002 net) → `duplicate=true` short-circuits
   legacy persist AND legacy media re-upload (`continue`), else canonical row becomes the
   single owner and legacy adapts counters/media onto it by `msg.id`.
2. Legacy `messageData` now carries `providerMessageId = received.key.id` (backfill
   semantics, never fabricated) so guards/invariant apply uniformly.
3. Duplicate-result branch reuses the canonical row for adaptation; legacy `create`
   carries the scoped P2002 guard (§6). Pipeline failure still falls back to legacy
   (pre-existing no-loss behavior).

## 9. Legacy bypasses removed/disabled

- Bare-create bypass: still present ONLY as (a) pipeline-failure fallback and
  (b) `saveNewMessage=false` operator path — both now identity-carrying and P2002-guarded.
- No competing live persistence path remains for Baileys inbound: canonical owns the row
  whenever it succeeds. `createMany(skipDuplicates)` historic-import path unchanged
  (in-memory `messagesRepository` gate + operator-gated flag; out of this P1's scope).

## 10. Real active-path tests (real bridge + real pipeline + real PG, scratch, cleaned)

Fixture: Baileys-shaped `received` (`key.id`, group remoteJid, ts, conversation) through
the REAL `interceptBaileysMessage` with `mode:'canonical'` (global env forced `legacy`
to prove the override, not the flag):

- A sequential redelivery: `dup=[false,true]`, `skipMsg=[true,true]`, **1 msg, 1 outbox**.
- D update semantics: status `READ` via two updates, redeliver → `dup=true`, still 1 row;
  `key.id` lookup finds the canonical row (edits/acks path intact).
- B concurrent duplicate delivery, **10 workers / 3 pools**: `dups=9/10`, **1 msg, 1 outbox**,
  zero errors.
- C restart (fresh pipeline/in-memory state): `dup=true`, still 1/1.
- E journal: exactly 2 rows (1 per distinct provider message; redeliveries added none).
- Scratch cleanup verified 0/0/0. No prod rows written by tests.

## 11. Concurrency results

10-way same-host race → single winner, 9 duplicate detections, `database rows = 1`,
`canonical outbox events = 1`. Residual TOCTOU: without the DB constraint the window is
theoretically open cross-host/under load (19.3.2 measured 0/25 same-host); the invariant
(§5) remains the authoritative backstop and is still pending on DBA cleanup.

## 12. Journal results

Journal-first durable ingress confirmed: Tx1 row per distinct event, redeliveries resolve
to the existing journal row (`duplicate:true`), `PERSISTED` transition + `complete()`
observed via the 1-msg/1-outbox outcomes. (Production `EventJournal` is empty because
traffic predates canonical mode — expected, not a fault.)

## 13. Outbox results

Exactly one `OutboxEvent` per distinct provider message (`dedupKey =
WHATSAPP-BAILEYS:<instance>:<pmid>:publish`); redeliveries create none and skip
automation dispatch (`if (!messageDuplicate)`). Sink stays `legacy` (no drain → no
double webhook delivery today); multi-webhook fanout is explicitly Phase 19.3.3 scope
and was NOT implemented here.

## 14. Regression results (all PASS, post-edit code)

`tsc --noEmit` 0 · `eslint` on both touched files 0 · backend `tsup` build success ·
`message.reliability` 13/13 · `live.inbound.cutover.13_7` 10/10 · `journal.durable` 14/14 ·
`webhook.delivery` 13/13 · `tenant.authz.19_3` 11/11 · `tenant.isolation.phase15` 9/9 ·
`inbound.isolation.19_2` 2/2 · `backpressure.19_2` 8/8 · `governance` 20/20 ·
Prisma `validate` both schemas + `generate` PASS (19.3.1, src SQL-only since).

## 15. 50K evidence status

**50K CONTROL-PLANE EVIDENCE = STILL VALID.** The 50K run touched only
`Instance`/`SessionLease`/`WorkerRegistration` on scratch `scale19_3`; message dedup,
journal, and outbox were never in its path and its dataset is disjoint from
`evolution_db`. Nothing in this phase intersects those measurements. No rerun performed
(per instruction) and none needed.

## 16. Remaining risks

1. **96 duplicate pairs still in prod** — the constraint cannot land until DBA
   adjudicates them pair-by-pair (§4 procedure per pair). Until then: no DB-level
   backstop; P2002 guard dormant.
2. Canonical mode is now live on Baileys (container restarted, `running`, 0 restarts,
   HTTP 200, startup deploy clean): new journal/outbox row writes per message are
   expected and healthy — monitor table growth vs retention purges.
3. Image/repo drift persists (image SQL = 59 migrations; repo = corrected set). A fresh
   database built from the image would re-hit the original defects.
4. `Tenant`/billing lineage tables still absent (19.3.1 P2) — unchanged.

## 17. Final classification: **P1 OPEN**

Checklist (§13): items 1–2 PASS (pair adjudicated, exactly one row removed); item 4 PASS
(scoped P2002); items 5–12 PASS (canonical live path, bypasses removed, real
sequential+concurrent tests green with 1 row / 1 outbox, regressions + isolation green);
**item 3 FAILS — the UNIQUE invariant does not exist** (blocked by the 96 remaining
pairs, which this phase was forbidden to bulk-clean). Item 13 therefore fails.

Per the gate rule, **P1 remains OPEN** — but its scope is now precisely bounded: the
active path is protected in code (proven §10–§11) and exactly one DBA-tracked step
(pair-by-pair adjudication of 96 known pairs, then the §5 DDL) stands between OPEN and
CLOSED. No historical-sync, multi-webhook, n8n, 100K, or commit work was performed.
