# tests

## Purpose

pgTAP RLS cross-vendor isolation tests, run against a real local Supabase
instance via `supabase test db` (`../README.md`'s `config.toml` backs the
local project this runs against).

## Contents

- `rls.test.sql` — scoped to the highest-risk vendor-facing write paths
  (loopkit has 40+ migrations; exhaustive per-table coverage is out of
  scope — see `docs/superpowers/specs/2026-07-22-cicd-hook-harness-parity-
design.md` §3): `loopkit.vendors` (shared profile, for-all self policy),
  `loopkit.upgrade_requests` (vendor-insert/select-own + admin-select-all),
  `loopkit.feedback` (self-insert-only), `loopkit.vendor_notify_settings`
  (for-all own-row, same shape as `vendors` — a vendor inserts/reads/
  updates only its own row, cross-vendor insert/update/select all blocked),
  and `loopkit.referral_hosts` (own-row create/read, no update/delete grant
  this round — migration `0040`). 67 assertions, one rolled-back
  transaction, fixed-UUID inline fixtures — asserts RLS is actually enabled
  on every covered table, cross-vendor read/write isolation, that a grant
  gap (no `UPDATE` grant on `upgrade_requests`/`referral_hosts`) fails on
  the table-level privilege check before RLS ever runs, and (for
  `provision_default_program`) that the service-role-only function grant
  and its advisory-lock idempotency guard are both actually present.
  (`loopkit.vendor_telegram`/`loopkit.telegram_link_tokens` — loopkit's
  own retired Telegram bot tables — were covered here through migration
  `0036`; dropped by `0037`, so their assertions were removed alongside.)
  A dedicated "Vendor C"/"Vendor F" fixture pair (not A/B) backs a
  functional suite for `vendor_join_referred`/`apply_referral_credit`
  (self-referral no-op, first-vs-repeat-guest crediting exactly once for
  both a stamp-type program credited inline and a non-stamp program's
  deferred `apply_referral_credit` finish step, and cross-vendor referral-
  code isolation) — kept separate from A/B so its own program fixtures
  never disturb the `provision_default_program` section's "vendor A/B
  start with N programs" pre-conditions.

## Parent

[supabase](../README.md)
