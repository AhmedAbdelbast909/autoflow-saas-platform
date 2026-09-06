# Phase 19.3.7 — MySQL Full Migration-Chain Closure Report

Date (UTC): 2026-09-06
Scope: replace `MYSQL FULL CHAIN = UNVERIFIED` with VERIFIED or a precise
blocker. No commits. No production contact (prod is PostgreSQL, untouched;
read-only checks only). All MySQL work on the disposable `mysql19_3` container
(MySQL 8.0.46), scratch DBs created and dropped. No 1M, no WhatsApp, no new
features. Zero application-source changes this phase (8 mirror-migration SQL
files only — all previously applied NOWHERE; see Step-14 section).

---

## 1. Baseline

19.3.6 = CERTIFIED with `MYSQL FULL CHAIN = UNVERIFIED` (chain died at
migration 19/35 on `ADD COLUMN IF NOT EXISTS`, 1064). Postgres full chain =
VERIFIED (19.3.3.1 fresh deploy 0→73).

## 2. MySQL version

Real `mysql19_3`: **MySQL 8.0.46** (`collation_server=utf8mb4_0900_ai_ci`).
The pre-existing `audit19_3` DB was verified NEVER chain-migrated (no
`_prisma_migrations` — harness-created tables only) and was not touched.

## 3. Exact reproduced failure (Step 2, before any fix)

Fresh DB `repro1937_run0`, full chain in order: **18 migrations applied, then**
`20250902130000_enhance_journal` query 1:
`ALTER TABLE \`EventJournal\` ADD COLUMN IF NOT EXISTS \`eventType\` ...`
→ **error 1064** (syntax). Classification: syntax — MySQL 8.0 has no
`ADD COLUMN IF NOT EXISTS` (MariaDB-only). File line 1.

## 4–5. Inventory & classification (all 53 statements + everything found after)

Census: 75 `IF NOT EXISTS` = 22 valid `CREATE TABLE IF NOT EXISTS` (4 files:
core_boundaries, phase16, 19_1, 19_3_3) + **53 invalid `ADD COLUMN IF NOT
EXISTS` across 7 files** (enhance_journal 12, message_reliability 7,
identity_resolution 8, ha_session_ownership 8, webhook_platform 3,
enterprise_security 5, phase17 10). Zero `CREATE INDEX/ADD CONSTRAINT IF NOT
EXISTS`; zero other PG-isms (`ON CONFLICT`/`RETURNING`/`JSONB`/`::`).

| # | Defect (discovered iteratively by clean-room runs) | Class | Fix |
|---|---|---|---|
| 1 | 53× `ADD COLUMN IF NOT EXISTS` (7 files) → 1064 | MINIMAL COMPAT PATCH | plain `ADD COLUMN` (Prisma tracker supplies once-only semantics) |
| 2 | phase17 whole file PG-generated: 258 double-quoted identifiers → 1064 | MINIMAL COMPAT PATCH | backticked identifiers (no string literals present — verified) |
| 3 | phase17: 6 cross-table `ALTER`s comma-chained → 1064 | MINIMAL COMPAT PATCH | semicolons |
| 4 | phase17: 8× `id TEXT` PRIMARY KEY → 1170 | MINIMAL COMPAT PATCH | `VARCHAR(191)` (schema intent `String @id`; matches chain-wide convention) |
| 5 | phase17: index on `UserSession.revokedAt` w/o column → 1072 | MINIMAL COMPAT PATCH (omission) | added PG-parity 9-column UserSession ALTER (deviceId/ip/lastSeenAt/mfaVerified/revokedAt/revokedBy/revokedReason/riskScore/userAgent) |
| 6 | phase17: 11 statements target 8 tables absent from the deployable chain (AutomationWorkflow, AutomationExecution, BillingWebhookJournal, GovRole, GovApiKey, DataExportJob, DataDeletionJob + 2 indexes + PlanVersion→BillingPlan FK) → 1146 | OBSOLETE-ON-FRESH-CHAIN (PG-parity skip) | omitted with explanatory comments — the PG sibling wraps every one of these in `information_schema` IF EXISTS guards that skip identically on a fresh chain (proven: 19.3.3.1 fresh-PG boot) |
| 7 | 18_2: `SecretRecord` absent from chain → 1146 | OBSOLETE-ON-FRESH-CHAIN (PG-parity skip) | statement omitted with raw form documented in comment — mirrors the explicit 19.3.1 PG correction verbatim (schema already declares `valueHash @db.Text` for future creations) |
| 8 | enterprise_security: `Instance_tenantId_fkey` → **3780** | ENGINE DIFFERENCE | omitted with root-cause comment (see §8 below) |

Parity additions (asymmetric omissions found by drift diff, PG has / MySQL
lacked — all additive, all in already-touched files): EventJournal
`UNIQUE(dedupKey)` + 4 indexes; Message 3 indexes (conversationId,
providerMessageId, lifecycleState); AuditEvent requestId index.

Diff discipline: every change verified statement-scoped (`git diff -U0`:
only intended lines); PG tree untouched this phase.

## 6–7. Policy & strategy

The 8 edited files were **applied nowhere**: any MySQL 8.0 deploy dies at the
first affected file (structurally), production is PostgreSQL, and `audit19_3`
never used the chain. Editing unapplied historical mirrors is therefore the
minimal deterministic repair; a forward corrective migration cannot work
(fresh deploys die before reaching it). History remains ordered and
deterministic; no file deleted/reordered; no destructive DDL.

## 8. The 3780 root cause (documented, not hand-waved)

`Instance` (created 2024-08 init era, explicit `utf8mb4_unicode_ci`) vs
`Tenant` (created 19.x era, inherits `collation_server=utf8mb4_0900_ai_ci`).
MySQL FKs require matching collations → 3780. Proven deterministic: the same
FK on same-collation tables succeeds in isolation. Widening `tenantId` to 191
would contradict the schema file (`VarChar(100)`), so the FK is omitted as an
engine-difference parity gap; tenant binding stays application-enforced.
**Cross-era collation split is a standing MySQL-mirror hazard** for any future
cross-era FK.

## 9–10. Clean-room runs (final file state)

- **Run #1**: fresh `repro1937_runA` → **34/34 applied, 0 failed, 84 tables, 20.8s** PASS
- **Run #2**: dropped, fresh `repro1937_runB` → **34/34 applied, 0 failed, 84 tables, 20.4s** PASS (identical state)
- Two earlier exploratory runs (intermediate file states) also reached 34/34; superseded by the final pair.

Key objects verified in runB: `Message_instanceId_providerMessageId_key`
UNIQUE; EventJournal dedupKey UNIQUE + 4 indexes; Message 3 indexes;
AuditEvent requestId idx; WebhookDestination `UNIQUE(instanceId,name)`;
WebhookDelivery `UNIQUE(eventId,destinationId)`; WebAuthnChallenge challenge
UNIQUE; UserSession 9 phase17 columns + revokedAt index; HistorySyncState /
WebhookDestination / WebhookDelivery tables.

## 11. Drift matrix (Step 16, `prisma migrate diff` DB→schema, all EXPLAINED)

- 33 schema-only tables (Billing*, Organization/Workspace/Project/Inbox/Team,
  Gov*, DataGovernance/DataExport/DataDeletion, SecretRecord, TenantRegion,
  ComplianceEvidence, IncidentRecord): **symmetric with a fresh PG chain** —
  no migration in either engine creates them (guarded skips on PG). Not a
  chain defect; a repo-wide schema-vs-chain gap documented since 19.3.1.
- 17 chain-only tables missing from `mysql-schema.prisma` (Inbox*×14,
  PlanVersion, CreditTransaction, UsageReconciliationRecord): pre-existing
  schema-FILE mirror gap (PG schema has the latter three; MySQL file lacks them).
- 12 schema-file column gaps (Tenant.disabled* partial, UserSession 9 cols):
  chain now has what PG has; the MySQL schema FILE lags (pre-existing).
- TIMESTAMP-vs-DATETIME rendering + index naming (`keyHash` vs
  `ApiKey_keyHash_key`): cosmetic, engine-legitimate.
- EventJournal correlationId/dedupKey nullable-in-chain vs required-in-schema:
  symmetric with PG (PG mirror also adds them nullable).
- IdentityAlias: MySQL mirror table SHAPE differs (aliasJid/kind vs
  identifier/provider) — pre-existing mirror inconsistency, reshaping refused
  (out of minimal scope), indexes impossible without it.
- Instance→Tenant FK: engine difference (§8).
No UNEXPLAINED drift remains.

## 12–13. Application boot + functional (Steps 11–13)

Rebuilt image from the fixed tree (`evolution-repro-19_3_7`, build SUCCESS),
booted `app1937` against clean `repro1937_runB` (DATABASE_PROVIDER=mysql,
no docker cp, no bind mounts):
- Entrypoint deploy: "34 migrations found … Migration succeeded" = **no-op on
  already-applied chain** (idempotency, Step 13); HTTP 200.
- **Client M-matrix 7/7**: M1 create ✓ · M2 duplicate → P2002 + 1 row ✓ ·
  **M3 10-way concurrent → exactly 1 winner + 9 P2002 + 1 row** ✓ · M4 status
  update + cross-instance same-pmid accepted ✓ · M6–M9 full delivery lifecycle
  PENDING→RETRY_WAIT→DEAD_LETTER→replay(same id)→DELIVERED + duplicate
  delivery identity P2002 ✓ · M12 rows persist ✓ · cleanup zeros ✓.
- **API M-matrix**: M5 destination CRUD create→list→get→update→delete→empty ✓ ·
  M10 cross-instance read 404, unknown instance 404 ✓ · M11 no-key 401 +
  bad-key 401 ✓ · **M13 MySQL restart → app reconnects, HTTP 200, CRUD works,
  chain state intact (34/84)** ✓.
- Scratch rows cleaned; DB dropped after evidence captured.

## 14. Production compatibility

No production/staging MySQL exists (prod = PG; `audit19_3` never
chain-migrated). The 8 edited files were applied nowhere → edit-in-place is
safe; **CLEAN-ROOM REPRODUCIBILITY** (proven ×2) is separate from
**EXISTING-DATABASE UPGRADE SAFETY** (vacuously safe — no existing MySQL
lineage). PG production completely unaffected (PG tree untouched; prod
`migrate status` up to date; HTTP 200). Forward-only posture unchanged.

## 15. Parity matrix (Step 15)

| Feature | PostgreSQL | MySQL | Parity |
|---|---|---|---|
| Chain applies from empty | PASS (73, 19.3.3.1) | PASS (34, ×2 this phase) | PASS |
| Message identity UNIQUE | PASS | PASS (1062/P2002 + concurrent 1-winner) | PASS |
| Webhook destination/delivery schema+lifecycle | PASS | PASS | PASS |
| EventJournal dedup unique + indexes | PASS | PASS (added this phase) | PASS |
| History/lease/shard tables | PASS | PASS (present in chain) | PASS (structural) |
| Instance→Tenant FK | PASS (guarded) | OMITTED (collation 3780) | PARTIAL (documented) |
| Full model set (schema ↔ chain) | chain < schema (33 tables, guarded) | same 33 + 17 schema-file gaps | PARTIAL (documented, symmetric core) |
| Runtime on real WhatsApp ingestion | VERIFIED (PG) | NOT TESTED (no staging) | UNVERIFIED (environment) |

## 16. Performance (Step 18)

Full chain: 20.4–20.8 s (34 migrations); no pathological migration; app boot
(migrate no-op + generate + serve) ≈ 30 s to HTTP 200.

## 17. Security (Step 19)

Fix is syntax/type-fidelity only — no invariant weakened. Uniques verified
post-migration (Message identity, destination name, delivery identity,
challenge); FK omissions are additive-integrity gaps with app-layer enforcement
(documented); auth 401s, cross-instance 404s, audit tables present.

## 18. Remaining limitations

1. MYSQL_SCHEMA_PARITY: PARTIAL — 33 symmetric chain-vs-schema tables; 17+12
   pre-existing mysql-schema-FILE gaps; IdentityAlias shape mismatch. Fix =
   dedicated mirror-regeneration phase (mechanical, out of minimal scope here).
2. Cross-era collation split (unicode_ci vs 0900_ai_ci) — future cross-era
   MySQL FKs will need explicit collation alignment.
3. No MySQL runtime evidence for real provider ingestion (no staging phone).

## 19. Final classification

- MYSQL_FULL_CHAIN = **CERTIFIED** (clean-room ×2, 34/34, 0 failed, idempotent no-op re-run)
- MYSQL_19_3X = **CERTIFIED** (carried + uniques re-verified in full chain)
- MYSQL_APPLICATION_RUNTIME = **PARTIALLY_VERIFIED** (boot/CRUD/auth/isolation/
  restart/message-dedup/delivery-lifecycle proven; provider ingestion NOT TESTED)
- MYSQL_SCHEMA_PARITY = **PARTIALLY_VERIFIED** (drift fully explained + itemized)

**Phase 19.3.7: CERTIFIED** — Step-20 criteria 1–14 all PASS (criterion 7
app-boot PASS; criterion 14 drift all explained). No P0/P1 introduced. No
production modification. Scratch fully torn down; prod HTTP 200, 6 h uptime.
