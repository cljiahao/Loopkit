# .husky

## Purpose

The git-hook layer (husky v9 — no native binary, so nothing for Windows
Smart App Control to block, unlike lefthook's unsigned `lefthook.exe`).
`pnpm install`'s `prepare` script runs `husky`, which points
`core.hooksPath` at this directory.

## Contents

- `pre-commit`, `commit-msg`, `pre-push` — thin `exec bash
  .husky/lib/<name>.sh "$@"` wrappers. Husky v9's dispatcher runs hook
  files via `sh -e`, ignoring the `#!/usr/bin/env bash` shebang, so any
  bash-specific syntax (`set -o pipefail`, etc.) has to live in a script
  that's explicitly invoked with `bash`, not in the file git/husky execute
  directly — hence the wrapper indirection for all three hooks.
- `lib/pre-commit.sh` — runs format/lint (`prettier`+`eslint --fix` on
  staged `.ts/.tsx/.js/.mjs/.cjs`, xargs'd with `-d '\n'` so filenames with
  spaces/quotes survive), `tsc --noEmit`, a frozen-lockfile install check
  when `package.json` is staged, a gitleaks secret-scan on staged files (if
  gitleaks is installed), then the README-coupling nudge.
- `lib/commit-msg-check.sh` — Conventional Commits gate: validates the
  commit message's first line against
  `^(feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert)(\(scope\))?: description`,
  exempting merge commits and `chore(release):`; non-zero exit rejects the
  commit. Takes husky's message-file path as `$1`.
- `lib/pre-push.sh` — runs `.claude/verify-harness.sh` (integrity check)
  plus `pnpm run check && pnpm test`.
- `lib/readme-coupling.sh` — pre-commit nudge (non-blocking): warns to
  stderr when staged files touch a folder whose `README.md` wasn't also
  staged; the commit still proceeds.

## Connectivity

Husky invokes `pre-commit`/`commit-msg`/`pre-push` directly by name — no
central config file (unlike lefthook's `lefthook.yml`). Each is a thin
wrapper that `exec`s its same-named script under `lib/` via `bash`
explicitly (see Contents above for why). `commit-msg` passes husky's
message-file path straight through as `$1`, a plain argv element; this is
why the Windows-path-with-space argv-rejoin wrapper the old `.lefthook/`
layer needed is gone, not ported. `lib/pre-push.sh` separately runs
`.claude/verify-harness.sh` and the full `pnpm run check && pnpm test`
gate. `.claude/verify-harness.sh` treats every file in this folder as part
of the integrity-checked enforcement layer recorded in
`.claude/harness.json`.

## Parent

[loopkit](../README.md)
