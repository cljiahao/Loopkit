# skill-audit

## Purpose

Project skill: surface repeated ad-hoc workflows worth capturing as new
committed project skills, from the skill-usage log.

## Contents

- `SKILL.md` — skill definition (`disable-model-invocation: true`, explicit-only): aggregates `.claude/skill-usage.log` by skill name, filters to workflows used at least twice that are neither Claude Code built-ins (`code-review`, `verify`, `run`, `init`, `review`, `security-review`, `simplify`) nor already a project skill under `.claude/skills/`, then proposes authoring a new project skill per remaining candidate (or explicitly skipping it) with the user

## Connectivity

Single-file skill folder. Consumes `.claude/skill-usage.log`, which is
written by `.claude/hooks/skill-usage-log.sh` on every `Skill` tool
invocation (`PostToolUse` matcher `Skill__.*`) — this skill has no signal
without that hook running first. Its output — a new `SKILL.md` — would land
as a new sibling directory here, alongside `next-verify/` and
`supabase-migrate/`.

## Parent

[skills](../README.md)
