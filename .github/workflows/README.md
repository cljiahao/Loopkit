# workflows

## Purpose

GitHub Actions pipelines: CI (build/test/coverage/hygiene gates) and
security scanning.

## Contents

- `ci.yml` — main CI pipeline, four jobs plus two PR-only gates: harness integrity (`.claude/verify-harness.sh`), `pnpm check`/`pnpm test`/coverage with an 80% changed-line gate (`diff-cover`); a separate `next build` job with dummy Supabase env vars; a Playwright e2e smoke job; a CHANGELOG-required-for-`src/`-changes gate (`skip-changelog` label bypasses); a README-freshness gate requiring every changed folder's `README.md` also be in the diff (`skip-readme-check` label bypasses) — the CI-time counterpart to `.lefthook/readme-coupling.sh`'s commit-time nudge
- `security.yml` — secret scan (gitleaks, full history) + `pnpm audit` (hard gate on production deps at high/critical severity; full audit incl. devDeps is informational-only); no CodeQL job, since code scanning requires GitHub Advanced Security which isn't available on this private repo's plan

## Connectivity

Both files are independent top-level workflows triggered on the same
events (`push` to `main`, every `pull_request`); neither calls the other.
`ci.yml`'s harness-integrity step and README-freshness gate both duplicate
checks also runnable locally (`.claude/verify-harness.sh`,
`.lefthook/readme-coupling.sh`) so a bypassed or missing local hook still
gets caught before merge.

## Parent

[.github](../README.md)
