# supabase-migrate

## Purpose

Project skill: apply Supabase schema migrations and regenerate
`src/lib/types.ts`, with an explicit safety gate before touching the linked
(hosted) project.

## Contents

- `SKILL.md` — skill definition (`disable-model-invocation: true`, explicit-only): local workflow (`supabase migration up` / `supabase db reset` + `supabase gen types typescript --local`), linked-project workflow (`supabase db push` + `--linked` type regen), a no-CLI fallback (paste SQL into the Supabase SQL editor, hand-edit types), and a safety checklist for hosted changes (confirm the linked project ref, keep RLS enabled on core tables, keep `orders` in the `supabase_realtime` publication)

## Connectivity

Single-file skill folder, referenced by AGENTS.md's `/supabase-migrate`
entry as the required path for any schema change — it's the skill-level
enforcement that pairs with the rule "regenerate `src/lib/types.ts` after
every new migration" and the RLS-authorization rule in AGENTS.md. Operates
on `supabase/migrations/` and writes `src/lib/types.ts`, both outside this
folder.

## Parent

[skills](../README.md)
