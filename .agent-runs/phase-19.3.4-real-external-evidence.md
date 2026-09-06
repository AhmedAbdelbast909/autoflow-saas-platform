# Phase 19.3.4 — Real External Evidence Report

Date (UTC): 2026-09-06
Objective: replace simulated/fake-transport evidence with real-world evidence for
history sync, external webhooks, n8n, outage/recovery and latency. No commits.
No prod data touched. No staging WhatsApp disturbed. All scratch infra removed
afterwards. Nothing fabricated: every number below was measured.

---

## 1. Starting state

Phase 19.3.3.1 CERTIFIED (standing re-verified: prod HTTP 200, repro image
present, git 121 paths unchanged, MySQL `@db.Boolean` fix intact). Production
holds exactly ONE WhatsApp instance (`123`, open, Baileys) — NO staging
instance exists. Host and container→internet both verified 200. Egress guard
supports `EGRESS_SSRF_ALLOWLIST` (hostname-based, guard stays enabled).

## 2. Changes (all disposable, none in git-tracked source)

- `test/webhook.real.19_3_4.test.ts` + `test/n8n.real.19_3_4.test.ts` (both in
  gitignored `test/`, harness-only, real axios transport — no fake HttpClient).
- Temp-only: `hooklistener.py` (scripted threaded HTTP listener), 2 n8n workflow
  JSONs, 1 sqlite inspect script (all under Temp, not the repo).
- Infra (all created, used, then removed with volumes/networks): `hooklistener`
  (python:3.13-alpine), `realweb-pg` (fresh PG, full 73-migration deploy),
  `realweb-api` (clean Phase-1 image, isolated net), `realweb-n8n` (+ workflows).
- Zero modifications to application source, migrations, Dockerfile or config.

## 3. Real WhatsApp history (2.1) — PROVIDER_CAPABILITY UNVERIFIED

No safe staging instance exists; forcing a reconnect on prod `123` was
forbidden and not attempted. No `PROVIDER_AVAILABLE_HISTORY` number is claimed.
Classification: **IMPLEMENTATION = PASS** (H-matrix re-run 12/12 on current
source, §4), **PROVIDER_CAPABILITY = UNVERIFIED**. Any partial-history behavior
will be classified PROVIDER_LIMITED when a staging phone exists — not an
implementation failure.

## 4. History/live overlap (2.2) — PASS (H 12/12 re-run, scratch secretmig19_3)

H4 replay→1 row · H5 live/history race→1 row · H6 restart→1 row · H7 Chatwoot
gate cannot block canonical · H8 state machine · H9 LID · H10/H12 exactly 1
outbox · H11 DB invariant blocks 2nd row · on-demand capability/bounds/honesty.
Scratch zeros verified after (0/0). UNIQUE backstop enforced throughout.

## 5. Real external webhook (2.3) + multi-destination (2.5) + chaos (2.9)

R-matrix **12/12 PASS** (4th attempt; attempts 1–3 exposed and fixed only
harness/listener flaws, never app code — §8). Real axios transport throughout:

- R1: healthy 200 → DELIVERED, listener hit carries HMAC header verified valid
  via `WebhookHmacService.verify` against the exact received bytes.
- R2: 429/500/502/503 → RETRY_WAIT (attempts=1, `nextAttemptAt`>last attempt,
  httpStatus persisted); 400 → terminal FAILED (`4xx` class, no retry).
- R2b: maxAttempts=3 → 3×RETRY_WAIT then DEAD_LETTER, attempts ≤4 (bounded).
- R3: `/slow?ms=8000` with timeoutMs=1500 → retryable, wall <6 s, class=timeout
  (`timeout: timeout of 1500ms exceeded`).
- R4: abrupt RST → retryable `network`; canonical outbox row intact.
- R5: `https://no-such-host-19-3-4.invalid` over public internet → retryable,
  class=DNS (`getaddrinfo ENOTFOUND`).
- R8: A/B healthy + C failing(500) → worker delivers A+B, C alone retries;
  backlog visible (`pendingDepth`≥1); mode flip → worker drains C, 3 delivery
  rows total (no dup rows), stable IDs.
- R10: DEAD_LETTER → fix URL → replay → same delivery id DELIVERED.
- Server path: clean-image `realweb-api` control-plane test-ping →
  `{"status":"delivered","attempts":1}` with exactly 1 listener hit
  (journal cleared before). Full HTTP path proven on the Phase-1 image.

## 6. Real n8n (2.4) — PASS

Fresh local n8n, CLI-imported POST webhook workflow (2 repair attempts:
offline-activation ordering, then explicit `httpMethod:POST` after import
defaulted to GET). Evidence: fanout delivery → HTTP 200 → DELIVERED (N1);
n8n's own sqlite shows 5 `success` executions, 2 `execution_data` rows
containing our `N8NWEB:…` payloads (N1 + post-recovery N2). Outage (container
stopped) → retryable, outbox intact; recovery → same delivery id DELIVERED in
2 attempts, exactly 1 execution for the recovered event (no uncontrolled
duplicates). n8n treated identically to any destination (no privileged path).

## 7. Outage→recovery (2.6) — PASS (R8 + N2, §5–§6)

Events persist → RETRY_WAIT with visible backlog → recovery → drain with
stable delivery/event IDs → no logical duplication (delivery rows 1:1 per
destination; n8n executions == successful attempts).

## 8. Security (2.7) — PASS, nothing weakened

- Metadata IP `169.254.169.254`: rejected at create AND dead-lettered at
  delivery with `egress guard` reason; listener journal count unchanged (zero
  egress).
- `localhost`, `127.0.0.1`, `gopher:` rejected (proven with scratch allowlist
  emptied, then restored — prod runs with NO allowlist, unchanged).
- Redirect 302: never followed (`maxRedirects: 0` honored over real HTTP),
  target fetched 0 times, delivery retryable-network.
- HMAC: valid real header verifies; tampered body and stale timestamp reject;
  cross-instance reads null; unknown instance 404 (fresh server).
- Scratch-only `EGRESS_SSRF_ALLOWLIST=localhost,hooklistener` used the guard's
  own documented mechanism; default-deny proven without it.

## 9. Real latency (2.8) — measured, narrow context

200 sequential real deliveries/listener-ack, per-row `latencyMs`: run2
p50=3/p95=5/p99=9/max=10 ms; run3 p50=3/p95=5/p99=7/max=9; run4
p50=3/p95=5/p99=8/max=9. Context: host loopback + docker bridge, same machine —
NOT public-internet latency (no claim made). Throughput: 200/200 delivered,
0 remaining each run.

## 10. MySQL (2.10) — UNVERIFIED (explicit blocker, pre-existing mirror rot)

Fresh-MySQL `migrate deploy` fails at `20250902130000_enhance_journal`:
`ADD COLUMN IF NOT EXISTS` is invalid MySQL 8.0 syntax (1064); 11 of 35 mirror
files share the pattern (journal/reliability/identity/HA/webhook/enterprise/
phase17 eras — predates 19.3.x). Rewriting 11 cross-domain files = blind schema
rewriting → refused per change control. Scratch DB dropped, staging restored
to PG set. PG chain unaffected and re-proven (fresh 73-migration deploy in §5
setup). Required follow-up: dedicated MySQL-mirror hardening phase, NOT this gate.

## 11. Regression (2.11)

H 12/12 · R 12/12 (real transport) · N 2/2 · prior-turn suites carried
(message.reliability/webhook.delivery 13/13, tenant.authz 11/11, egress 5/5,
tsc 0, eslint 0, image build green — application source byte-unchanged since).
Prod re-verified HTTP 200; git still 121 paths; scratch zeros verified;
all Phase-2 infra removed (prod/pg19_3/mysql19_3 states restored).

## 12. Failures and repairs (5 targeted, no track >2 attempts)

1. Harness used docker-only hostname (ENOTFOUND from host) → localhost +
   documented allowlist. 2. Listener lacked POST /redir (defaulted 200) →
   added; confirmed genuine 302-never-followed. 3. R8 raced backoff window →
   poll-until-due drain loop. 4. n8n CLI activation needs stop→update→start
   ordering. 5. Imported webhook node defaulted to GET → explicit-POST
   re-import. An early R3 pass against the unresolvable host was flagged
   anomalous and re-proven genuinely. No app-code change in any repair.

## 13. P0/P1 status: none opened, none residual. MySQL rot = P2 hardening item.

## 14. Certification: **CERTIFIED (implementation; provider-limited)**

Gate: 1. staging WhatsApp unavailable — explicitly proven (single prod
instance), IMPLEMENTATION=PASS/PROVIDER=UNVERIFIED split applied · 2. honest
quantified history ✓ · 3. overlap safe ✓ · 4. real webhook ✓ · 5. real n8n ✓ ·
6. outage/recovery ✓ · 7. latency measured ✓ · 8. security intact ✓ ·
9. isolation intact ✓ · 10. regression green ✓ · 11. no P0/P1 ✓.
Scope: everything except provider-side history volume, public-internet latency,
and MySQL runtime (all labeled, none claimed). Next: Phase 19.3.5 scale gate.
