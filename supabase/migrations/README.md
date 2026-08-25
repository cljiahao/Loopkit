# migrations

## Purpose

SQL schema + RLS migration chain for the `loopkit` schema in the shared
Merqo Supabase project, applied in order. Convention: each file opens with a
comment describing its purpose; changes are additive/idempotent (`create or
replace`, `add column`) unless a file's own header explains a deliberate
exception.

## Contents

- `0001_loopkit_core.sql` — creates the `loopkit` schema and the base `programs`/`cards`/`stamp_events` tables, RLS, and the `owns_program`/`add_stamp`/`redeem`/`card_status` functions + grants
- `0002_loopkit_stamp_cap.sql` — caps stamping at the program's `stamps_required` (a full card stays full) and exposes the shop name
- `0003_loopkit_admin.sql` — platform-operator admin: an internal allow-list of admins (`is_admin`) and an audit trail of their actions
- `0004_loopkit_engine.sql` — v2 engine phase 1: generalizes the schema so a program has a `type` + `config` blob, a card carries a `state` blob, and events carry a `payload`
- `0005_loopkit_record_visit.sql` — generic engine write path (`record_visit`): persists a TypeScript-computed card state + logs one event, for non-stamp types
- `0006_loopkit_card_token.sql` — gives every card an opaque `card_token` (the QR payload) and three SECURITY DEFINER read/enroll functions for the public `/c` page
- `0007_loopkit_multiprogram.sql` — lets a vendor own many programs (free = 1 active, Pro = unlimited); drops the one-program-per-vendor unique constraint, adds `vendor_pro`
- `0008_loopkit_hardening.sql` — v2 hardening: fixes a stamp-progress read gap, enforces the free/Pro program limit in the database, only enrolls into active programs, drops the redundant public `card_status` surface
- `0009_loopkit_enroll_phone_guard.sql` — rejects malformed phone strings inside `enroll_card` itself, hardening the anonymous enroll surface against direct calls
- `0010_loopkit_chance_types.sql` — widens `programs.type` to admit the wheel/scratch chance-based templates
- `0011_loopkit_streak_type.sql` — widens `programs.type` to admit the streak template
- `0012_loopkit_card_lifecycle.sql` — card lifecycle: vendor-configurable expiry (days from cycle start) and card regeneration (reissue token + reset progress)
- `0013_loopkit_upgrade_requests.sql` — self-serve Pro upgrade requests table, reviewed by an admin on `/admin/vendors`
- `0014_loopkit_head_start.sql` — vendor opt-in "head start": pre-fills a new card with ~20% progress toward its first reward (Endowed Progress Effect)
- `0015_loopkit_vendor_join.sql` — public `vendor_active_programs` function listing a vendor's active programs for the `/c` landing preview, before a phone number is entered
- `0016_loopkit_program_replacement.sql` — adds `replaced_by` for program-type migration, and fixes the free-tier cap to count only active programs
- `0017_loopkit_vendor_profile.sql` — `loopkit.vendors`: a lazily-created row per vendor (name/phone), first written on a `/profile` save
- `0018_loopkit_carry_over.sql` — adds `carry_over_stamps` and threads it through `create_program`
- `0019_qkit_earn.sql` — `qkit_earn_config`: vendor-owned setting for which program (if any) earns a stamp from a completed qkit order, Pro-gated
- `0020_qkit_earn_functions.sql` — two SECURITY DEFINER functions (`qkit_earn_lookup`/commit) backing the anonymous `/earn` claim flow
- `0021_loopkit_customers.sql` — `loopkit.customers` table, keyed by `(vendor_id, phone)`
- `0022_loopkit_stamp_carryover.sql` — removes the stamp ceiling; `add_stamp` now increments unconditionally and carries over excess stamps on redeem
- `0023_loopkit_program_switching.sql` — tiered program switching: free-tier prep-and-activate, Pro scheduled cutover via `scheduled_deactivate_at`
- `0024_loopkit_head_start_percent.sql` — replaces the fixed ~20% head-start seed with a vendor-configurable `head_start_percent` (5–50, default 20)
- `0025_loopkit_remove_streak_type.sql` — removes the Streak Club program type entirely, replaced by Flame Club (a Stamp visual variant); no live rows existed, so this is a full removal rather than the usual additive-only convention
- `0026_loopkit_points_per_visit.sql` — Points Club: `points_per_visit` config field (default 1) instead of Stamp's implicit +1; widens the `stamps_required` range to 100,000
- `0027_loopkit_reward_vouchers.sql` — `reward_vouchers` table (per-reward `active`/`redeemed`/`expired` ledger row, RLS via `owns_program`) and `programs.reward_expiry_days`; `grant_reward_voucher`/`redeem_oldest_voucher`/`expire_stale_vouchers` SECURITY DEFINER functions, and `create_program`/`update_program` gain a trailing `p_reward_expiry_days` parameter
- `0029_feedback.sql` — `loopkit.feedback` table: vendor NPS + optional message, RLS self-insert only; superseded as the write path by 0030/`merqo.vendor_feedback` (`src/app/actions/feedback.ts` no longer inserts here), kept as the historical source the 0030 backfill reads from
- `0030_vendor_feedback_backfill.sql` — one-time, guarded copy of existing `loopkit.feedback` rows into the shared cross-kit `merqo.vendor_feedback` table (merqo migration 0011); no-ops if `merqo.vendor_feedback` doesn't exist yet (e.g. loopkit-only local `supabase start`), same guard pattern as qkit's `0054_vendor_profile_backfill.sql`
- `0031_loopkit_vendor_join_avatar.sql` — appends `vendor_avatar_url` (read from `auth.users.raw_user_meta_data`) to `vendor_join`'s return columns, so the public `/c` page can render a vendor's chosen stamp-mark photo
- `0032_loopkit_provision_default_program.sql` — `provision_default_program(p_vendor_id)`: service-role-only SECURITY DEFINER function (never granted to `authenticated`) that seeds a default "Starter" stamp program for a push-provisioned vendor, since `create_program` is keyed on the calling session's `auth.uid()` and can't run on a vendor's behalf; advisory-lock-guarded against a double-provision race, idempotent on `loopkit.programs` (a null return means the vendor already had a program). Backs `POST /api/merqo/vendor-provision`.
- `0033_loopkit_vendor_tour_seen.sql` — adds `loopkit.vendors.tour_seen_at` (nullable `TIMESTAMPTZ`), tracking whether a vendor has completed the dashboard onboarding tour; no RLS change, the existing `vendors_own` policy already covers it
- `0034_loopkit_pricing.sql` — `loopkit.pricing`: single-row (`id` pinned to `1`), admin-tunable `monthly_cents`/`currency` config seeded at 499 ($4.99/mo), loopkit's first-ever live price; public-select RLS only, no insert/update/delete policy — writes go through the service-role `setPricing` admin action
- `0035_loopkit_customers_merqo_sync.sql` — extends `sync_customer_on_card`/`sync_customer_on_activity` (0021) with a second write to the shared cross-kit `merqo.customers` table (merqo migration 0018), alongside the existing local `loopkit.customers` write, not a replacement; guarded the same way as 0030 so a loopkit-only local `supabase start` (no merqo schema) doesn't break every card/stamp-event insert
- `0036_vendor_telegram.sql` — `loopkit.vendor_telegram` (own-row SELECT for `authenticated`, no client write grant) and `loopkit.telegram_link_tokens` (RLS enabled, zero policies — service-role only) backing the Telegram reward-redemption alerts feature; writes go through the service-role webhook route and the link-token-issuing dashboard settings action only, same writer-restriction shape as `0034`'s `pricing` table. Superseded by `0037` — see below.
- `0037_drop_vendor_telegram.sql` — drops `loopkit.telegram_link_tokens`/`loopkit.vendor_telegram` (0036): Vendor Telegram Connect (Phase A2) retires loopkit's own Telegram bot in favor of merqo's shared one; `redeemAction`'s vendor alert now calls merqo's `notify-vendor` endpoint instead. No data carries over — a vendor who'd linked loopkit's own bot must reconnect once via merqo's profile page.
- `0038_vendor_notify_settings.sql` — `loopkit.vendor_notify_settings`: a vendor-level on/off toggle (`customer_telegram_notify_enabled`, default `true`) for the customer redemption-confirmation Telegram message `redeemAction` sends via `notifyCustomerByPhone`; a missing row still means "on" (resolved in application code, not just the column default). RLS `for all` own-row policy plus `select, insert, update` granted directly to `authenticated` — a vendor upserts their own row under RLS from a server action, same shape as `qkit_earn_config` (0019), not service-role-only like the retired `0036` Telegram tables.
- `0039_admin_audit_immutable.sql` — revokes `update`/`delete` on `loopkit.admin_audit` from `service_role` specifically (RLS from `0003` already blocked `authenticated`/`anon`; the app only ever `insert`s into it via `recordAudit`, `src/lib/admin-audit.ts`) — closes the gap where holding the service-role key alone was enough to tamper with or erase the audit trail; `select`/`insert` grants are untouched.
- `0040_loopkit_referral_hosts.sql` — host/couple-facing referral mechanic for event-cart vendors: `loopkit.referral_hosts` (vendor-owned, one row per host phone + chosen program + unique `referral_code`) and `loopkit.referral_credits` (the per-guest dedup ledger, service-role-only); extracts `vendor_join`'s enrollment/read logic into `vendor_join_enroll`/`vendor_join_cards` so the new `vendor_join_referred` RPC can reuse it without touching `vendor_join`'s own signature/behavior; `vendor_join_referred` credits stamp-type programs inline and reserves non-stamp credits for `apply_referral_credit` (the TypeScript-engine-computed finish step) to complete — see `docs/superpowers/specs/2026-08-20-host-referral-mechanic-design.md`.
- `0041_loopkit_birthday_bonus.sql` — birthday bonus for Stamp programs: `loopkit.customers` gains `birth_month`/`birth_day`/`last_birthday_reward_year`; `loopkit.programs` gains a `birthday_bonus_enabled` toggle (default off); `loopkit.set_customer_birthday(p_vendor, p_phone, p_birth_month, p_birth_day)` is a plain, anon-granted UPDATE scoped to the exact `(vendor, phone)` pair it's called with — same trust model as `vendor_join`, and it never creates a row (one only exists once the 0021/0035 sync triggers already made one from a real card/stamp event). `add_stamp`'s real body (sweep expired vouchers, increment, threshold-crossing, `grant_reward_voucher`) is factored into a new internal `loopkit._add_stamp_unchecked`, with `add_stamp` itself reduced to a thin `owns_program`-gated wrapper — reused rather than reimplemented by the new `apply_birthday_bonus` trigger (fires on every `loopkit.stamp_events` insert, any writer) so a birthday bonus can never drift from the real voucher/carryover accounting. The trigger updates `last_birthday_reward_year` _before_ granting the bonus stamp, so the bonus's own `stamp_events` insert re-fires the trigger but sees "already granted this year" and no-ops instead of recursing.

## Parent

[supabase](../README.md)
