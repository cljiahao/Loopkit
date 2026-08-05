# workflows

## Purpose

GitHub Actions pipelines: CI (build/test/coverage/hygiene gates) and
security scanning.

## Contents

- `ci.yml` — main CI pipeline, four jobs plus three PR-only gates: harness integrity (`.claude/verify-harness.sh`), `pnpm check`/`pnpm test`/coverage with an 80% changed-line gate (`diff-cover`); a separate `next build` job with dummy Supabase env vars; a Playwright e2e smoke job; a CHANGELOG-required-for-`src/`-changes gate (`skip-changelog` label bypasses); a README-freshness gate requiring every changed folder's `README.md` also be in the diff (`skip-readme-check` label bypasses) — the CI-time counterpart to `.husky/lib/readme-coupling.sh`'s commit-time nudge; a comment-hygiene gate scanning only the PR's added lines (`git diff -U0`) for change-narration comments, using the first 10 (hard-precision) lines of `.claude/comment-hygiene-patterns.txt` (`skip-comment-check` label bypasses) — the CI-time hard gate counterpart to `.husky/lib/comment-hygiene.sh`'s commit-time warn-only nudge and `.claude/hooks/post-edit-comment-check.sh`'s live edit-time nudge, both of which scan the full 13-line pattern file. Also a `db` job (migrations + pgTAP RLS) and a PR-only, advisory `mutation` job that Stryker-mutates whichever `src/lib/*.ts` files the PR touched — its changed-file diff uses `--diff-filter=d` so a PR that only _deletes_ a `src/lib` file (nothing left to mutate) doesn't crash the job trying to mutate a file that no longer exists.
- `security.yml` — secret scan (gitleaks, full history) + `pnpm audit` (hard gate on production deps at high/critical severity; full audit incl. devDeps is informational-only); no CodeQL job, since code scanning requires GitHub Advanced Security which isn't available on this private repo's plan

## Connectivity

Both files are independent top-level workflows triggered on the same
events (`push` to `main`, every `pull_request`); neither calls the other.
`ci.yml`'s harness-integrity step and README-freshness gate both duplicate
checks also runnable locally (`.claude/verify-harness.sh`,
`.husky/lib/readme-coupling.sh`) so a bypassed or missing local hook still
gets caught before merge.

## Parent

[.github](../README.md)
