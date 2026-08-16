# tests

## Purpose

pgTAP RLS cross-vendor isolation tests, run against a real local Supabase
instance via `supabase test db` (`../README.md`'s `config.toml` backs the
local project this runs against).

## Contents

- `rls.test.sql` — scoped to the highest-risk vendor-facing write paths
  (loopkit has 37+ migrations; exhaustive per-table coverage is out of
  scope — see `docs/superpowers/specs/2026-07-22-cicd-hook-harness-parity-
design.md` §3): `loopkit.vendors` (shared profile, for-all self policy),
  `loopkit.upgrade_requests` (vendor-insert/select-own + admin-select-all),
  `loopkit.feedback` (self-insert-only). 27 assertions, one rolled-back
  transaction, fixed-UUID inline fixtures — asserts RLS is actually
  enabled on every covered table, cross-vendor read/write isolation, that
  a grant gap (no `UPDATE` grant on `upgrade_requests`) fails on the
  table-level privilege check before RLS ever runs, and (for
  `provision_default_program`) that the service-role-only function grant
  and its advisory-lock idempotency guard are both actually present.
  (`loopkit.vendor_telegram`/`loopkit.telegram_link_tokens` — loopkit's
  own retired Telegram bot tables — were covered here through migration
  `0036`; dropped by `0037`, so their assertions were removed alongside.)

## Parent

[supabase](../README.md)
