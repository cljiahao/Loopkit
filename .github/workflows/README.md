# workflows

## Purpose

GitHub Actions pipelines: CI (build/test/coverage/hygiene gates, mutation
testing) and security scanning.

## Contents

- `ci.yml` — main CI pipeline. Jobs: `test` ("check + unit" — harness integrity via `.claude/verify-harness.sh`, `pnpm check`, `pnpm test`, then `vitest --run --coverage` with an 80% changed-line gate via `diff-cover`); `build` ("build (next build)" — `pnpm build` with dummy Supabase env vars, since dynamic routes render at request time); `e2e` ("e2e (public smoke)" — Playwright against dummy Supabase env vars, uploads the report on failure); `db` ("db (migrations + pgTAP RLS)" — `supabase start` applies every migration in `supabase/migrations` then `supabase test db` runs the pgTAP suite); plus three PR-only gates: `changelog` (requires `CHANGELOG.md` in the diff whenever `src/` changed, `skip-changelog` label bypasses), `readme-freshness` (requires every changed folder's `README.md` also be in the diff, `skip-readme-check` label bypasses — the CI-time counterpart to `.lefthook/readme-coupling.sh`'s commit-time nudge), and `mutation` ("mutation (changed lib)" — diffs `src/lib/**/*.ts` changes against the PR base ref and runs `stryker run --mutate` scoped to just those changed files, skipping entirely if none changed; advisory-only since `stryker.conf.json`'s `break: null` never fails CI)
- `security.yml` — secret scan (gitleaks, full history) + `pnpm audit` (hard gate on production deps at high/critical severity; full audit incl. devDeps is informational-only); no CodeQL job, since code scanning requires GitHub Advanced Security which isn't available on this private repo's plan

## Connectivity

Both files are independent top-level workflows triggered on the same
events (`push` to `main`, every `pull_request`); neither calls the other.
`ci.yml`'s harness-integrity step and README-freshness gate both duplicate
checks also runnable locally (`.claude/verify-harness.sh`,
`.lefthook/readme-coupling.sh`) so a bypassed or missing local hook still
gets caught before merge. The `mutation` job reads `../../stryker.conf.json`
at the repo root (not in this folder) for its mutant scope and thresholds.

## Parent

[.github](../README.md)
