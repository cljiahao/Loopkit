# next-verify

## Purpose

Project skill: run the full lint/format/test quality gate in one pass.

## Contents

- `SKILL.md` — skill definition: runs `pnpm check && pnpm test` and reports the results; documents why it doesn't overlap with the harness's own `PostToolUse` incremental-`tsc` and `Stop`-hook test run — this skill's unique value is the lint + format gate (no hook covers that) plus one full-suite pass on demand

## Connectivity

Single-file skill folder. `SKILL.md`'s frontmatter scopes `allowed-tools` to
`Bash(pnpm *)` only, so invoking this skill can't run arbitrary shell
commands. It's the on-demand counterpart to two always-on hooks in
`.claude/hooks/`: `post-edit-typecheck.sh` (incremental `tsc` after every
edit) and `stop-checks.sh` (`pnpm test` at turn end).

## Parent

[skills](../README.md)
