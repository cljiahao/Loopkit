# supabase

## Purpose

SQL schema (RLS-enforced authorization), local-dev configuration for the
Supabase CLI, and manually-run seed data for the `loopkit` schema in the
shared Merqo Supabase project.

## Contents

- `config.toml` — Supabase CLI local-dev config: exposes only the `loopkit` +
  `graphql_public` schemas to the Data API (`api.schemas`), pins
  `auto_expose_new_tables = false` (loopkit's migrations grant Data-API
  access explicitly instead, so the exposed surface doesn't depend on
  CLI-version auto-grant behavior), Postgres major version 17, and the
  standard local ports/services shared across every Merqo kit (API 54321, DB
  54322, Studio 54323, Inbucket 54324) — matches the format of
  merqo/qkit/paykit/stockkit's own `config.toml`. `[auth.external.google]`
  is enabled, reading `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET`
  from the environment for local `supabase start` (see `.env.example`).
- `migrations/` — SQL schema and RLS policies
- `seed/` — manually-run seed data
- `tests/` — pgTAP RLS test suite (vendors, upgrade_requests, feedback, vendor_notify_settings, referral_hosts, vendor_join_referred/apply_referral_credit); run via `supabase test db`

## Parent

[loopkit](../README.md)
