# docs

## Purpose

Non-code documentation: the project's non-negotiable architecture
invariants, the Supabase/Vercel/merqo deploy runbook, and the full
spec/plan development history.

## Contents

- `CONSTITUTION.md` — non-negotiable architecture invariants for loopkit (Supabase/RLS divergence from stock templateCentral, schema ownership, etc.) plus the enumerated list of protected governance files (agent instruction files, harness config/hooks, `.husky/*`/`.gitleaks.toml` git-hook enforcement, CI pipeline definitions); overrides `AGENTS.md`/skills on conflict, changes require an explicit Human Approval Override in the PR
- `DEPLOY.md` — deploy & attach runbook: apply migrations to the shared Supabase project (A), deploy to Vercel (B), attach to merqo (C); its apply-in-order migration list is kept in sync with `supabase/migrations/` (currently through `0037`, which drops `vendor_telegram`/`telegram_link_tokens` — loopkit's own retired Telegram bot infrastructure, superseded by a call to merqo's shared bot)
- `superpowers/`

## Parent

[loopkit](../README.md)
