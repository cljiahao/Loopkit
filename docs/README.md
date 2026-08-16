# docs

## Purpose

Non-code documentation: the project's non-negotiable architecture
invariants, the Supabase/Vercel/merqo deploy runbook, and the full
spec/plan development history.

## Contents

- `CONSTITUTION.md` — non-negotiable architecture invariants for loopkit (Supabase/RLS divergence from stock templateCentral, schema ownership, etc.) plus the enumerated list of protected governance files (agent instruction files, harness config/hooks, `.husky/*`/`.gitleaks.toml` git-hook enforcement, CI pipeline definitions); overrides `AGENTS.md`/skills on conflict, changes require an explicit Human Approval Override in the PR
- `DEPLOY.md` — deploy & attach runbook: apply migrations to the shared Supabase project (A), deploy to Vercel (B), attach to merqo (C); its apply-in-order migration list is kept in sync with `supabase/migrations/` (currently through `0036`, adding `vendor_telegram`/`telegram_link_tokens` backing the Telegram reward-redemption alerts feature); also documents the one-time manual Telegram bot `setWebhook` registration step (not part of any migration or app code)
- `superpowers/`

## Parent

[loopkit](../README.md)
