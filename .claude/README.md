# .claude

## Purpose

Claude Code harness for loopkit: hook scripts that enforce guardrails at
tool-call/session boundaries, project skills, the harness integrity manifest
and its verifier, and the merge-base snapshot the manifest is checked
against.

## Contents

- `.harness-base/`
- `harness.json` — harness manifest: templateCentral version/stack/adaptation metadata, plus `seeded_files` — the enforcement-layer file list (path + sha256 `origin_hash`) that `verify-harness.sh` diffs against
- `hooks/`
- `regen-harness.sh` — human-run-only: rewrites every `origin_hash` in `harness.json` to match current on-disk content, blessing an intentional harness edit; `protect-files.sh` requires human approval before an agent can even edit it
- `settings.json` — wires each script in `hooks/` to a Claude Code lifecycle event (PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStop, SessionStart, UserPromptSubmit) and sets tool `permissions` (allow/deny) and skill overrides
- `skills/`
- `verify-harness.sh` — harness integrity sensor: recomputes sha256 for every seeded file matched by a path guard (`hooks/`, `settings.json`, harness verifier/regen scripts, `lefthook.yml`, `.lefthook/`, `.gitleaks.toml`, `.github/workflows/`) and compares to `harness.json`'s `origin_hash` baseline; read-only, exits non-zero on drift; run by `.github/workflows/ci.yml` and lefthook's `pre-push` hook

## Connectivity

`settings.json` is the wiring diagram: it maps each Claude Code lifecycle
event to a script in `hooks/` (e.g. `PreToolUse` → `protect-files.sh` and
`block-no-verify.sh`, `Stop` → `stop-checks.sh`), so a hook script does
nothing until `settings.json` references it. `harness.json`'s `seeded_files`
list is the source of truth for which of those hook scripts (plus
`settings.json` itself, the lefthook/gitleaks/CI config) count as
"enforcement layer" — `verify-harness.sh` hashes each listed path and fails
if it drifts from the recorded `origin_hash`, catching silent edits or
accidental reverts. `.harness-base/` is a full-content mirror of the same 19
`seeded_files` paths, captured at seed time — it's the merge-base snapshot
used to 3-way merge harness updates from the upstream template without
clobbering project-specific edits, not a live-checked baseline itself (that's
`harness.json`'s job); `protect-files.sh` guards writes to it for the same
reason it guards `harness.json`. `skills/` holds project skills invoked
on-demand; `skill-usage-log.sh` (in `hooks/`, wired via the `PostToolUse`
`Skill__.*` matcher) appends a line to `.claude/skill-usage.log` on every
skill invocation, which the `skill-audit` skill (`skills/skill-audit/`)
later aggregates to surface repeated workflows worth capturing as a new
project skill.

## Parent

[loopkit](../README.md)
