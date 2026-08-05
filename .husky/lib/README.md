# .husky/lib

## Purpose

Script bodies for husky's git hooks. Each top-level hook in `.husky/`
(`pre-commit`, `commit-msg`, `pre-push`) is a thin `exec bash
.husky/lib/<name>.sh "$@"` wrapper — husky v9's dispatcher runs hook files
via `sh -e`, ignoring their `#!/usr/bin/env bash` shebang, so the actual
bash logic (`set -euo pipefail`, etc.) has to live here where it's
explicitly invoked with `bash`.

## Contents

- `pre-commit.sh` — format/lint (`prettier`+`eslint --fix` on staged
  `.ts/.tsx/.js/.mjs/.cjs`, piped through `tr '\n' '\0' | xargs -0` so
  filenames with spaces/quotes aren't word-split — portable across GNU and
  BSD xargs, unlike `xargs -d '\n'`), `tsc --noEmit`, a frozen-lockfile
  install check when `package.json` is staged, a gitleaks secret-scan on
  staged files (if gitleaks is installed), then `readme-coupling.sh` and
  `comment-hygiene.sh`.
- `pre-push.sh` — runs `.claude/verify-harness.sh` (integrity check) plus
  `pnpm run check && pnpm test`.
- `readme-coupling.sh` — pre-commit nudge (non-blocking): warns to stderr
  when staged files touch a folder whose `README.md` wasn't also staged;
  the commit still proceeds.
- `comment-hygiene.sh` — pre-commit nudge (non-blocking): flags
  change-narration comments and oversized comment blocks in staged
  `.ts/.tsx/.js/.jsx/.mjs/.cjs` files, using
  `.claude/comment-hygiene-patterns.txt`; the commit still proceeds.
- `commit-msg-check.sh` — Conventional Commits gate: validates the commit
  message's first line against
  `^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\(scope\))?: description`,
  exempting merge commits and `chore(release):`; non-zero exit rejects the
  commit. Takes the commit-message file path as `$1`.

## Connectivity

Invoked only by the same-named wrapper one level up in `.husky/`
(`pre-commit.sh`/`pre-push.sh` from `pre-commit`/`pre-push`;
`commit-msg-check.sh` from `commit-msg`), except `readme-coupling.sh` and
`comment-hygiene.sh`, which `pre-commit.sh` calls directly as its last two
steps. `.claude/verify-harness.sh` treats every file in this folder as
part of the integrity-checked enforcement layer recorded in
`.claude/harness.json`.

## Parent

[.husky](../README.md)
