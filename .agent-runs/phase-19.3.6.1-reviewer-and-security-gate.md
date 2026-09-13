# Phase 19.3.6.1 — Reviewer + Security Gate Report

Date (UTC): 2026-09-07. No commit. No push. No 1M. No WhatsApp staging. No prod data touched.

## 1. Initial state

- 19.3.2→19.3.6 completed; orchestrator hardening commits present.
- `evolution-api` HEAD `e2af3fd5` "sanitize untrusted input to protect instance identity fields".
- Reviewer `deepseek-harness` NOT FOUND on PATH (default config) → certification blocked.
- Root `.ai/orchestrator/config/orchestrator.config.json` already pointed at `opencode`.
- Pre-existing working-tree modifications (not mine): 4 `.project-ai/` runtime-state files.

## 2. Reviewer discovery

- `where.exe opencode` → `C:\Users\ahmed\AppData\Roaming\npm\opencode[.cmd]` (v1.18.29).
- `where.exe deepseek-harness` → NOT FOUND. No harness binary, wrapper, npm package, or env pointer anywhere in tree.
- `opencode run --help` confirms `run`, `--model`, `--session`, `--continue`, `--format` support.

## 3. Reviewer configuration

- Invocation chain: `config.review.executable/args/model/timeoutMs` (+ `ORCH_REVIEW_EXEC/ARGS/MODEL/TIMEOUT_MS/FAIL_ON_UNAVAILABLE` overrides) → `DeepSeekHarnessReviewer.review()` → `reviewerExecutableExists()` (`where`/`which`) → prompt via stdin → stdout parsed by `parseReviewJson()` (strict `PASS|FAIL|UNAVAILABLE`).
- Missing executable + `failOnUnavailable=false` → `UNAVAILABLE` (blocks cert); `=true` → throw → `REVIEW_ERROR` path → BLOCKED.

## 4. Installation/configuration result

- No package installed (nothing trustworthy to install; no creds invented).
- Decision (user-approved): standardize on verified-existing `opencode` as reviewer.
- ACTUAL FILE CHANGE: `orchestrator/src/config.ts` `DEFAULT_CONFIG.review` → `{ provider: opencode, model: opencode/nemotron-3-ultra-free, executable: opencode, args: [run --model opencode/nemotron-3-ultra-free] }`; accuracy edits in `src/reviewer.ts` (2 messages) and `src/cli.ts` (1 note); `package.json` description → "OpenCode reviewer". Rebuilt `dist/` reflects it.

## 5. Actual reviewer invocation

- `node dist/src/cli.js reviewers --repo auto` → `Available: YES` (exit 0). `doctor` → valid, `opencode v1.18.29 run=true model=true session=true continue=true json=true` (exit 0).
- Live probe `echo prompt | opencode run --model opencode/nemotron-3-ultra-free --format json` → exit 0, JSON events, session id.
- Real gate (Step 10): `DeepSeekHarnessReviewer` (failOnUnavailable=true, 300s timeout) over the actual working-tree diff, prompt file `review-prompt-6files.md`, raw `review-raw-*.txt` (848 B). Model demonstrably READ both changed files, then returned strict JSON → parsed `PASS`, 0 findings. Post-gate `git status` identical: reviewer wrote nothing.

## 6. PASS/FAIL/UNAVAILABLE verification

- `review-certify.test.ts` (parse PASS/FAIL/UNAVAILABLE, fence-strip, reject non-JSON/invalid status) + `orchestrator-flow.test.ts` (UNAVAILABLE→BLOCKED with `REVIEW_UNAVAILABLE` and no `FIX_STARTED`; resume `reviewerStatus` PASS/FAIL/legacy) all pass in the 55/55 suite. `certificationDecision` blocks unless `reviewerStatus===PASS`. No test weakened.

## 7. Security audit (abstract.router.ts)

- Committed fix `e2af3fd5` stripped `instanceName+instanceId` from query always AND from body on `/instance/create`. Two defects found against it:
  1. **P1 — breaks legitimate creation**: `/create` has no `:instanceName` param, so `instance` starts `{}`; stripping body `instanceName` leaves `instanceName=undefined` while `execute: (instance) => createInstance(instance, …)` ignores `ref`. Schema validates `ref` (raw body) so validation passes but the controller receives a nameless instance → `saveInstance`/`setInstance`/`waInstances[]` break. Evidence: `instance.router.ts:17-29`, `instance.controller.ts:51-111`, `channel.controller.ts:54-94`.
  2. **Incomplete — compat + second paths**: blanket query strip kills param-less `fetchInstances` name/id filters (`instance.router.ts:60-71`, params `{}`); `inviteCodeValidate`/`getParticipantsValidate` merged raw `request.query` into body/ref with no sanitization (group DTOs verified free of identity fields, so stripping is zero-risk).
- Ruled out as separate boundaries (auth-guarded, not `dataValidate`-fed): `admin.router.ts` direct `req.*` use, `residency.guard.ts` server-resolved `InstanceRef` callers, `websocket.controller.ts` stanza payload, `instance.tenant.ts:180-217` server-resolved create data. No `dataValidate`-fed controller reads identity from `data/ref` (grep-verified).

## 8. Security regression

- CREATED (physically exists): `evolution-api/test/abstract-router-identity-override.19_3_6_1.test.ts` — standalone `tsx` script importing the REAL `RouterBroker`, mock `Request`s at the request boundary.
- Result: **12/12 PASS** (1 legit create, 2 params identity, 3 server instanceId, 4 query instanceId blocked, 5 query instanceName blocked, 6 body instanceId stripped on create, 7a body name accepted on create, 7b body name ignored on param routes, 8 mixed, 9 warn-logged, 10 fetchInstances compat, 11 inviteCode path stripped). First run caught a real over-permissive case (8/12-era design allowed query `instanceId` supply on param routes) → tightened source → 12/12.
- Note: `test/` is gitignored (`evolution-api/.gitignore:37`), per prior-phase scratch-harness convention — the file exists and runs but is intentionally untracked.

## 9. Actual source modifications

### FILE: `orchestrator/src/config.ts`
- CHANGE: `DEFAULT_CONFIG.review` deepseek/deepseek-harness → opencode/opencode/nemotron-3-ultra-free.
- WHY: default pointed at a nonexistent binary; verified-existing `opencode` is the working reviewer.
- TEST: `npm run build` + `npm test` 55/55 + `reviewers`/`doctor` → RESULT PASS.

### FILE: `orchestrator/src/reviewer.ts`
- CHANGE: 2 guidance strings now reference generic reviewer executable (default opencode).
- WHY: accuracy after default change. TEST: 55/55 → PASS.

### FILE: `orchestrator/src/cli.ts`
- CHANGE: `reviewers` note references generic executable. WHY/TEST: same → PASS.

### FILE: `orchestrator/package.json`
- CHANGE: description DeepSeek reviewer → OpenCode reviewer. WHY: accuracy. TEST: build/tests → PASS.

### FILE: `evolution-api/src/api/abstract/abstract.router.ts`
- CHANGE: `sanitizeUntrustedInput(source, blocked[])` + `SERVER_GENERATED_FIELDS=['instanceId']`; query = no-override (params win; supply allowed only for param-absent fields; `instanceId` supply only on param-less `fetchInstances`); create-body strips `instanceId` only (body `instanceName` preserved); `inviteCode`/`getParticipants` query merges sanitized.
- WHY: fixes P1 creation break, closes override on all param routes, preserves fetchInstances/create compat, hardens group helpers.
- TEST: 12/12 regression + tsc 0 + eslint 0 + build success + security 19/19 + tenant.authz 11/11 + instance.tenant 6/6 → PASS.

### FILE (created): `evolution-api/test/abstract-router-identity-override.19_3_6_1.test.ts`
- WHY: boundary regression for all 10 phase cases + group path. TEST/RESULT: 12/12 PASS (gitignored scratch, see §8).

## 10. Exact file paths modified

1. `C:\Users\ahmed\Desktop\auto\orchestrator\src\config.ts`
2. `C:\Users\ahmed\Desktop\auto\orchestrator\src\reviewer.ts`
3. `C:\Users\ahmed\Desktop\auto\orchestrator\src\cli.ts`
4. `C:\Users\ahmed\Desktop\auto\orchestrator\package.json`
5. `C:\Users\ahmed\Desktop\auto\orchestrator\dist\src\{config,reviewer,cli}.js{,.map}` (regenerated, tracked)
6. `C:\Users\ahmed\Desktop\auto\evolution-api\src\api\abstract\abstract.router.ts`
7. `C:\Users\ahmed\Desktop\auto\evolution-api\test\abstract-router-identity-override.19_3_6_1.test.ts` (created, gitignored)
8. This report (created).

## 11. Exact tests executed

- `orchestrator`: `npm run build` OK; `npm test` 55/55/0fail; `npm run typecheck` exit 0. (`reviewers`/`doctor` exit 0.)
- `evolution-api`: new regression 12/12; `npx tsc --noEmit` exit 0; `npm run lint:check` exit 0; `npm run build` success (tsup 9s); `test/security.test.ts` 19/19; `test/tenant.authz.19_3.test.ts` 11/11; `test/instance.tenant.19_2.test.ts` 6/6.
- Gate: real opencode review → `PASS`, 0 findings (raw JSON verified on disk).

## 12. Build/typecheck/lint results

TypeScript 0 errors (both repos) · ESLint 0 (evolution-api full `lint:check`; orchestrator has no eslint setup — N/A) · builds succeed · no P0/P1 introduced.

## 13. Git status (uncommitted, left as-is per policy)

- Root: `M .project-ai/{events/events.jsonl,supervisor.json,workflows/*.events.jsonl}` (RUNTIME STATE, pre-existing), `m evolution-api` (submodule dirty from §9 fix), `M orchestrator/{src/config.ts,src/reviewer.ts,src/cli.ts,package.json,dist/…}` (INTENDED SOURCE/CONFIG + GENERATED).
- evolution-api: `M src/api/abstract/abstract.router.ts` (INTENDED SOURCE). New test file present on disk, gitignored (INTENDED TEST, untracked-by-policy).

## 14. Git diff summary

- `orchestrator/src/config.ts` 8 lines (review defaults); `src/reviewer.ts` 4 lines (messages); `src/cli.ts` 2 lines (note); `package.json` 2 lines (description); `dist/*` regenerated mirrors.
- `evolution-api/src/api/abstract/abstract.router.ts`: +43/−6 (sanitizer blocklist, no-override query, create-body fix, group-helper hardening).

## 15. Remaining uncommitted files

Listed in §13. Nothing staged. Nothing stashed.

## 16. Commit readiness

- Ready to commit as-is (message e.g. `fix(gate): opencode reviewer default + identity no-override boundary (19.3.6.1)`), but COMMIT FORBIDDEN this phase — left in working tree. `dist/` mirror included since repo tracks it.

## 17. Final certification: CERTIFIED (scoped to this gate)

1. Reviewer genuinely AVAILABLE (binary + doctor + live stdin/JSON probe) ✔
2. PASS/FAIL/UNAVAILABLE parsing works (55/55) ✔ 3. UNAVAILABLE remains hard blocker (code + test) ✔
4. `abstract.router.ts` fix independently verified (audit + 12/12 at boundary) ✔
5. Security regression passes 12/12 ✔ 6. Orchestrator 55/55 green ✔
7. TypeScript passes (both) ✔ 8. ESLint passes (evolution-api; orchestrator N/A) ✔
9. Builds pass (both) ✔ 10. No P0/P1 introduced (reviewer PASS, 0 findings) ✔
11. All fixes physically in working-tree files (re-read from disk) ✔
12. Diffs contain the implementation/config changes; test file on disk but gitignored per repo convention (documented) ✔
13. No report-only fixes (every claim backed by file + execution) ✔

STOP. No further phase started; nothing committed or pushed.
