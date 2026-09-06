# Instance-Creation tenantId Fix — Engineering Report

Date (UTC): 2026-09-06 · Verified against the live Docker deployment AND an isolated
scratch stack. Scratch fully torn down; production state clean (exactly one
canonical `default` tenant, zero test artifacts, legacy instance `123`
untouched and `open`).

---

## Root Cause

`resolveCreationTenantId()` (`src/api/services/instance.tenant.ts`) failed
closed whenever the resolved tenantId was empty. The controller resolves the
requested tenantId through `authorizeCreationTenant()`, which returns `''`
for a privileged/global caller (global `AUTHENTICATION_API_KEY` sets no
`req.auth`) that omits `tenantId` — so every no-tenantId creation (dashboard,
scripts) died with `400 "tenantId is required…"`. The production DB had an
EMPTY `Tenant` table, so there was nothing to fall back to either. A second,
latent deployment defect surfaced during verification: the running prod
container generated its Prisma client from the upstream image's schema, which
has **no Tenant/ApiKey models at all** — `prisma.tenant` was `undefined` and
provisioning would have silently no-oped even with fallback code.

## Files Changed

| File | Change |
|---|---|
| `src/api/services/instance.tenant.ts` | `DEFAULT_TENANT_NAME`, race-safe idempotent `resolveDefaultTenantId()`, opt-in `fallbackToDefault` on `resolveCreationTenantId()`, loud failure if the Prisma client lacks the Tenant model, updated docs |
| `src/api/controllers/instance.controller.ts` | passes `{ fallbackToDefault: true }` (controller-layer only) |
| `src/api/guards/auth.guard.ts` | 2-line comment corrected (stale contract description) |
| `docker-compose.yaml` | `./prisma:/evolution/prisma` bind mount — prod container now generates its client from the repo schema (source-of-truth, no docker cp) |

Dashboard (`app.js`/`index.html`): **unchanged** — it sends no `tenantId`; per
§7 preferred behavior the backend fallback fully restores compatibility.

## Implementation

Centralized in `resolveCreationTenantId(prisma, raw, { fallbackToDefault })`:

- **Tenant-bound caller** (`req.auth.tenantId` set, unchanged): omitted
  tenantId → caller's own tenant; explicit tenantId must match, else 403
  (`authorizeCreationTenant` + defense-in-depth `assertCallerTenantMatch` on
  the write path).
- **Privileged/global caller**: explicit tenantId → validated to exist
  (unknown → 400, nothing created); omitted → canonical default tenant.
- **Default resolution**: existing `Tenant` with `name='default'` → use its
  real cuid; absent → provision `{ name: 'default', clientName: 'default' }`
  once, race-safe (`name` UNIQUE; P2002 loser re-fetches the winner). No
  hard-coded id; no per-request duplicates; write path (`monitor.saveInstance`)
  keeps failing closed (no fallback there).

## Security

Cross-tenant creation remains impossible: tenant-bound callers still get 403
on any foreign tenantId (verified live: 403, **0 rows**), `assertCallerTenantMatch`
still guards the persistence path, invalid/nonexistent tenants still 400, and
the default fallback is reachable ONLY through the controller flag — never
through the write path or any tenant-bound caller.

## Database

`Tenant` table was **empty** (verified before any change); the canonical
default tenant was **provisioned** (id `cmtpq4hks0001o079j8xdmawu`,
name/clientName `default`) exactly once. Legacy instance `123` (tenantId NULL)
was not touched and stays operational (`state: open`).

## Tests (scratch stack + live deployment, disposable rows cleaned after)

| Test | Result |
|---|---|
| Global + no tenantId | **PASS** — 2xx; `instance.tenantId` = real cuid of tenant `default` (prod + scratch) |
| Global + explicit tenantId | **PASS** — 2xx; `instance.tenantId` === supplied id |
| Tenant-bound + no tenantId | **PASS** — 2xx; auto-scoped to `tenant-A-prod` / `tenant-A` |
| Tenant-bound + wrong tenantId | **PASS** — 403 `Caller is not authorized to provision instances for tenant "…"`, **0 instances created** (prod + scratch) |
| Invalid tenantId | **PASS** — 400 `Unknown tenantId "does-not-exist"`, 0 rows |
| Legacy instance | **PASS** — `123` (null tenant) listed, `connectionState: open`, unmodified |
| TypeScript | **PASS** — `npx tsc --noEmit` exit 0 |
| Tenant authorization tests | **PASS** — `tenant.authz.19_3` 11/11 |

Additional clean-room evidence: repeat creation reuses the SAME single default
tenant (`total_tenants = 1` after 3+ creations); **5-way concurrent no-tenantId
creation with no default present → exactly 1 default tenant, 5/5 instances
bound to it** (race-safety proof); ESLint on all touched files exit 0; prod
redeploy via compose-mounted repo prisma: `73 migrations found … Migration
succeeded` (no-op), `HTTP - ON`, session `123` auto-reconnected.

## Regression Assessment

No unrelated behavior changed. `authorizeCreationTenant`,
`assertCallerTenantMatch`, `buildInstanceCreateData`, and the write path's
fail-closed contract are untouched; tenant authz suite green; legacy flows
unchanged; the only deployment delta is the repo-schema bind mount, which also
repairs the prod Prisma-client/schema gap (the container previously generated
its client without the Tenant/ApiKey models). Prod now: 1 instance (`123`,
open), 1 tenant (`default`), 0 test keys — clean.
