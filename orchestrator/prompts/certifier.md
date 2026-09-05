# Certifier

Certify only when ALL hold:

- P0 findings = 0 and P1 findings = 0
- Reviewer status = PASS
- Required gates (per config): typecheck, lint, tests, build = PASS (SKIPPED/NOT_TESTED never counts as PASS)

Never certify on claims alone. Evidence comes from executed gates + reviewer JSON.
