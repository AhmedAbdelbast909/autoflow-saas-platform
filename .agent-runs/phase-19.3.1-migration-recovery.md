# Phase 19.3.1 — Migration Recovery Report (`20250904130000_phase17_enterprise_governance` + chain)

Date (UTC): 2026-09-05
Database: `evolution_db` on `evolution_postgres` (schema `evolution_api`)
Policy: NO commits. No `migrate reset` / DROP / TRUNCATE / volume deletion / destructive git.
No user rows deleted or modified (one backfill UPDATE set NULL columns only; verified below).
No unrelated migrations modified. Failure history preserved (rolled-back rows kept, not hidden).

---

## 1. Root cause of migration failure

The reported blocker (`phase17`, failed 2026-09-05 17:43:17 UTC) failed with:

- SQLSTATE **42P01**, `ERROR: relation "UserSession" does not exist`
- Exact failed statement: line 338 of the migration file,
  `CREATE INDEX "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");`

Root cause class: **defective migration SQL for this DB lineage (strategy D)**. The file was
generated against a full schema (via `prisma migrate diff`, no shadow-DB verification) and
assumes base tables that were never created in `evolution_db`'s lineage: `UserSession`,
`AutomationWorkflow`, `GovRole`, `BillingPlan` are absent from **all** schemas (verified via
`pg_tables`). Phase 16 (which applied cleanly) only ever created `PlanVersion`,
`CreditTransaction`, `UsageReconciliationRecord` — it never created those 4 tables.
Three further statements in the same file would have failed next (two more CREATE INDEX,
one FK to the missing `BillingPlan`).

Two more latent blockers of the same family were found behind it (proven by running deploy):
- `20250902140000_message_reliability`: UNIQUE constraint on backfilled
  `(instanceId, providerMessageId)` collided with a **genuine application-level duplicate**
  (same instance `7df47cb1…`, same provider id `3AF3938767564324C6C6`, stored twice —
  double-ingest, two row ids `cmtlyswps…` / `cmtlytttj…`). Error 23505.
- `20250904160000_phase18_2_secret_value_text`: unguarded
  `ALTER TABLE "SecretRecord"` while the table is absent (42P01).
- `20250905090000_phase19_1_sharding`: `CREATE INDEX CONCURRENTLY` inside Prisma's
  deploy transaction (SQLSTATE 25001 — certain by PostgreSQL semantics, then observed).

A secondary operational finding: one deploy failure mid-session (17:57 UTC) was a **race with
the crash-looping container**, which was running the same deploy with the image's older,
unfixed SQL copy. Fix: `docker stop evolution_api` before all subsequent resolve/deploy
operations (container serves nothing while crash-looping; stop is non-destructive).

A tertiary finding: host→DB TCP connected but the PG session dropped (`P1001` from Prisma,
`Connection terminated unexpectedly` from node-pg) after the earlier network
disconnect/reconnect — Docker Desktop's port proxy had wedged. Fixed by
`docker restart evolution_postgres` (data-safe; WAL recovery; row counts identical after).

## 2. Exact failed statements (in encounter order)

1. `20250904130000_phase17_enterprise_governance` L338:
   `CREATE INDEX "UserSession_revokedAt_idx" ON "UserSession"("revokedAt");` → 42P01.
2. `20250902140000_message_reliability`:
   `ALTER TABLE "Message" ADD CONSTRAINT "Message_instanceId_providerMessageId_key"
   UNIQUE ("instanceId", "providerMessageId")` → 23505 (duplicate key named above).
3. `20250904160000_phase18_2_secret_value_text`:
   `ALTER TABLE "SecretRecord" ALTER COLUMN "valueHash" TYPE TEXT;` → 42P01.
4. `20250905090000_phase19_1_sharding`:
   `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Instance_shardKey_idx" …` → 25001.

## 3. Pre-recovery schema state (read-only evidence)

- `evolution_api` schema: 45 tables (old production set: `Instance`, `Message`, …).
- Present: `PlanVersion` (with `planId` VARCHAR — FK column side OK), `Instance` (1 row),
  `Message` (2744 rows), `CreditTransaction`, `UsageReconciliationRecord`.
- Absent (all schemas): `UserSession`, `Tenant`, `AutomationWorkflow`, `AutomationExecution`,
  `BillingWebhookJournal`, `GovRole`, `GovApiKey`, `DataExportJob`, `DataDeletionJob`,
  `BillingPlan`, `SecretRecord`, all 10 phase-17 tables, `MessageLifecycle`,
  `MessageVersion`, `WebAuthnChallenge`, `TenantResidencyPolicy`, `SessionLease`,
  `WorkerRegistration`.
- Zero index-name collisions for all 25 phase-17 index names; FK name absent.
- `_prisma_migrations`: phase17 row `started 17:43:17, finished NULL, rolled_back NULL`
  with the 42P01 log quoted in §1 (failure preserved, not edited).
- Conclusion: the failed migration's transaction rolled back completely — **nothing was
  ever applied**, so `resolve --rolled-back` is the truthful operation (`--applied` would
  have been a lie; it was never used).

## 4. Prisma migration state → post-recovery

- `npx prisma migrate status` (final): **"Database schema is up to date!"**, 0 failed rows
  (`finished_at IS NULL AND rolled_back_at IS NULL` count = 0).
- History shows old rolled-back rows (f) alongside new finished rows (t) for
  `message_reliability`, `phase17`, `phase18_2`, `phase19_1` — the failure record is intact.
- Chain applied in order (observed): `message_reliability` → `webhook_platform` →
  `enterprise_security` → `phase15_inbox_crm` → `phase17` → `18_1_webauthn` →
  `18_3_residency` → `18_2` → `19_1_sharding`. Final: "All migrations have been
  successfully applied."

## 5. Recovery strategy and why

**Chosen: D repaired as A — fix the never-applied SQL files minimally and explicitly, then
`resolve --rolled-back` + retry.** Evidence for the choice:

- A (plain retry): impossible — the SQL deterministically fails (proven 3× on phase17).
- B (rollback of partial artifacts): nothing to roll back — §3 proves zero partial state
  (transactional DDL fully rolled back each attempt).
- C (completed but mis-recorded): false — all objects verified absent.
- D (SQL defect): proven — 4 statements reference tables absent from this lineage.
  The correction edits only the failed/never-applied files, is commented in-file with date
  and reason (not silent), and changes no applied history. No corrective *new* migration
  was needed because there is no diverged-applied state to preserve — but two follow-ups
  ARE recorded (§13).

`--applied` was considered and explicitly rejected until objects exist; it was never used.

## 6. Exact recovery commands (host, `evolution-api/` dir, PowerShell)

Pre-steps: `docker stop evolution_api` (freeze crash loop);
`$env:DATABASE_CONNECTION_URI='postgresql://evolution_user:evolution_pass@127.0.0.1:5432/evolution_db?schema=evolution_api'`
(`localhost` fails on this host — IPv6; `127.0.0.1` verified OPEN; secret is the standard
local test credential, also used by the container itself).

File fixes (repo `prisma/postgresql-migrations/…`, each copied over the gitignored working
copy `prisma/migrations/…` with `Copy-Item … -Force` — no `rm`, no git impact):

1. `20250904130000_phase17_enterprise_governance/migration.sql` — the 3 CREATE INDEX on
   missing tables and the FK to missing `BillingPlan` wrapped in schema-qualified
   (`table_schema='evolution_api'`) existence guards + `IF NOT EXISTS`; header comment
   records the correction.
2. `20250902140000_message_reliability/migration.sql` — UNIQUE-constraint DO block extended:
   added only when zero duplicate non-null `(instanceId, providerMessageId)` pairs exist,
   else `RAISE NOTICE` and continue (no user rows touched).
3. `20250904160000_phase18_2_secret_value_text/migration.sql` — ALTER wrapped in
   `IF EXISTS (SecretRecord)`; no follow-up needed (Prisma schema declares
   `valueHash @db.Text`, so future creations already use TEXT).
4. `20250905090000_phase19_1_sharding/migration.sql` — dropped `CONCURRENTLY` (plain
   `IF NOT EXISTS` builds; 1-row table, instantaneous); comment records the manual
   CONCURRENTLY path for a future million-row online build.

Per migration: `npx prisma migrate resolve --rolled-back "<name>" --schema
./prisma/postgresql-schema.prisma` (4×, each confirmed "marked as rolled back"),
then `npx prisma migrate deploy --schema ./prisma/postgresql-schema.prisma`,
iterating to the next observed failure. No statement outside these files was executed
against the database; no DML except the migration's own backfill (NULL-fill only).

## 7. Exact SQL executed, if any (outside migration files)

None. All schema change went through the corrected migration files via `migrate deploy`.
All other statements were read-only probes (`SELECT`, `\dt`, `pg_isready`), recorded in
`C:\Users\ahmed\AppData\Local\Temp\opencode\*.sql` (outside the repo).

## 8. Post-recovery migration state

- `migrate status`: up to date; 0 failed rows. Full log tail: "All migrations have been
  successfully applied."
- Container's own startup deploy (image copy, 59 migrations): "No pending migrations to
  apply. Migration succeeded" + Prisma Client generated (v6.19.0, 552ms) — the image's
  older SQL set is fully satisfied by the recovered schema, so its stale phase-17 copy
  never executes.

## 9. Schema verification (post-recovery, real queries)

- Phase-17 tables: 10/10 present (`AiAgent`, `AiTool`, `AiToolExecution`,
  `AutomationExecutionPolicy`, `BreakGlassSession`, `CommunicationPolicy`, `MfaMethod`,
  `ResourceAcl`, `SecurityIncident`, `SecuritySignal`).
- Reliability: `MessageLifecycle` + `MessageVersion` present; all 7 `Message` columns
  present; backfill committed: 2744/2744 rows carry `conversationId`/`providerMessageId`,
  2745/2745 carry `lifecycleState`.
- Sharding: `Instance.shardKey` + both indexes + `WorkerRegistration` present.
- Data preserved: `Instance`=1, `Message`=2744→2745 (growth is **live traffic** on the
  production instance, newest row ts 1788526572 matches an imageMessage the app logged
  processing — no rows created/deleted by this recovery), `PlanVersion`=0. Unchanged
  from baseline except live ingest.
- Skipped-by-guard (documented, not hidden): 3 phase-17 indexes, 1 FK, 18_2 widening
  (moot per schema), reliability UNIQUE constraint (duplicate pair named in §2).

## 10. Evolution API health

- `docker start evolution_api` → `running`, **Restarts=0**, stable **15+ minutes**
  (started 18:04:14Z, verified 18:09Z and 18:19Z), no migration errors in logs.
- Startup deploy clean; TCP :8080 OPEN; `GET /` → **HTTP 200**.
- DNS/network repair from Phase 19.3 holds (alias `evolution-postgres` survives restart).

## 11. Smoke test results

| Check | Status | Evidence |
| ----- | ------ | -------- |
| Startup / stability | PASS | 15+ min running, 0 restarts |
| HTTP serving | PASS | `GET /` 200 |
| Auth negative | PASS | no-key → 401, wrong-key → 401 (structured `Unauthorized`, request/correlation ids) |
| Auth positive + DB read | PASS | valid key → 200 `fetchInstances` listing the live instance (`7df47cb1…`, `connectionStatus: open`) |
| DB write path | PARTIAL | `POST /instance/create` without tenant → 400 "tenantId is required … no longer provisioned" (tenant enforcement working, and proves no unscoped writes). No tenant-scoped write attempted — would create prod rows; covered instead by backfill-proof + Prisma client |
| Migration-write proof | PASS | backfill committed (§9); Prisma client from host: `instances=1 messages=2745 aiAgents=0` |
| Prisma client vs new tables | PASS | `aiAgents=0` read through generated client (no `aiTool` errors; app logs show live `aiTool` queries) |
| Redis (app) | PARTIAL | `evolution_redis` PONG; historical `RedisCache initialized`; no redis errors in recent logs — no app-level redis round-trip asserted |
| WhatsApp sessions / customer traffic | NOT TESTED | Explicitly out of scope; live instance left connected, untouched |

## 12. Regression results

| Suite | Status |
| ----- | ------ |
| `prisma validate` postgresql-schema | PASS (valid) |
| `prisma validate` mysql-schema (with mysql URL) | PASS (valid; the default-env failure is only the URL-protocol check) |
| `prisma generate` (postgresql) | PASS |
| `test/governance.test.ts` | PASS 20/20 |
| `test/tenant.isolation.phase15.test.ts` | PASS 9/9 |
| tsc / eslint / builds | carried from Phase 19.3 (PASS); no TS sources changed in this phase (only `migration.sql` files + gitignored working copies) |

## 13. Remaining risks

1. **P1 — Message duplicate pair** (`7df47cb1…` / `3AF3938767564324C6C6`, two row ids):
   the UNIQUE constraint is intentionally skipped. Follow-up: DBA-approved dedup
   (keep one row — business decision which) then add the constraint. Until then,
   dedup-sensitive code paths lack DB-level protection.
2. **P2 — Skipped phase-17 FK/indexes** (`PlanVersion→BillingPlan` FK, 3 indexes): when
   `BillingPlan`/`UserSession`/`AutomationWorkflow`/`GovRole` are created by their own
   migrations, a follow-up migration must add these. The guards emit no NOTICE on the
   skip path for indexes (only 18_2/message_reliability raise NOTICE) — acceptable but noted.
3. **P2 — Image/repo drift**: container runs image SQL (59 migrations) + bind-mounted repo
   `dist`. Any future image rebuild must include the corrected SQL files, or fresh
   databases built from the image will hit the original defects. The repo files are the
   fixed source of truth.
4. **P2 — `Tenant`/`UserSession`/billing tables still absent**: the Prisma schema expects
   models whose tables were never created in this lineage. Code paths touching them will
   fail at runtime (pre-existing condition, unchanged by this phase — but now visible via
   `migrate status` cleanliness, so do not mistake "up to date" for "schema == models").
5. **P3 — Lease-acquire p50** (~350ms under storm, Phase 19.3) still wants a look before 100K.

## 14. Whether production traffic can now safely start

**The blocking failure is cleared: the API boots, migrates cleanly, serves authenticated
reads, enforces tenant scoping, and is ingesting live traffic on the pre-existing session.
No NEW production traffic was started by this phase.** Existing live session was left
untouched. A cautious rollout (observe, then onboard) is reasonable; 100K remains a
separate decision per the stop condition.

**Do NOT claim Production Certified** — Phase 19.3's NOT CERTIFIED standing is unchanged
by this recovery (subsystem gates + deployment health are necessary but not sufficient;
100K, chaos, and residual P1/P2 items remain).
