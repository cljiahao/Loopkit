# docs

## Purpose

Non-code documentation: the project's non-negotiable architecture
invariants, the Supabase/Vercel/merqo deploy runbook, and the full
spec/plan development history.

## Contents

- `CONSTITUTION.md` — non-negotiable architecture invariants for loopkit (Supabase/RLS divergence from stock templateCentral, schema ownership, etc.); overrides `AGENTS.md`/skills on conflict, changes require an explicit Human Approval Override in the PR
- `DEPLOY.md` — deploy & attach runbook: apply migrations to the shared Supabase project (A), deploy to Vercel (B), attach to merqo (C); its apply-in-order migration list is kept in sync with `supabase/migrations/` (currently through `0032`, adding `vendor_avatar_url` to `vendor_join`'s return columns and the service-role-only `provision_default_program` function backing `POST /api/merqo/vendor-provision`)
- `superpowers/`

## Parent

[loopkit](../README.md)
