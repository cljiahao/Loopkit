# specs

## Purpose

Dated design docs for loopkit, one per feature/phase — the `spec` half of
this repo's spec-then-plan workflow (implementation plans live in the
sibling `plans/` folder as `<same-slug>.md`, without the `-design` suffix).
Filenames are self-describing dated slugs; no separate description column
below.

## Contents

- `2026-07-07-loopkit-core-design.md`
- `2026-07-07-loopkit-v2-core-design.md`
- `2026-07-08-loopkit-counter-first-design.md`
- `2026-07-08-loopkit-vendor-workspace-design.md`
- `2026-07-10-dashboard-nav-plan-gating-design.md`
- `2026-07-10-loyalty-engine-mechanics-design.md`
- `2026-07-10-loyalty-stats-plan-tracking-design.md`
- `2026-07-10-vendor-level-join-design.md`
- `2026-07-11-card-change-management-design.md`
- `2026-07-11-loyalty-templates-and-migration-design.md`
- `2026-07-11-plan-tier-expansion-design.md`
- `2026-07-11-qr-model-customer-identity-design.md`
- `2026-07-11-stats-expansion-design.md`
- `2026-07-11-vendor-identity-profile-ui-design.md`
- `2026-07-11-vendor-phone-onboarding-design.md` — "Vendor phone-OTP onboarding": a third `/login` sign-in path (name+phone, anonymous Supabase session) alongside Google OAuth and email/password. **Removed 2026-09-01** — no account-recovery story for a business owner's primary sign-in; kept here as history.
- `2026-07-14-activity-table-design.md`
- `2026-07-14-counter-page-universal-scan-design.md`
- `2026-07-14-cross-kit-nav-standardization-design.md`
- `2026-07-14-dashboard-card-revamp-design.md`
- `2026-07-14-dashboard-cards-and-profile-design.md`
- `2026-07-14-dashboard-nav-polish-design.md`
- `2026-07-14-header-nav-vendor-views-design.md`
- `2026-07-14-nav-reachability-and-responsive-setup-design.md`
- `2026-07-14-qkit-parity-nav-polish-design.md`
- `2026-07-14-setup-live-preview-design.md`
- `2026-07-14-shadcn-select-avatar-design.md`
- `2026-07-14-shadcn-sweep-2-design.md`
- `2026-07-14-stamp-plant-redeem-carryover-design.md`
- `2026-07-14-tiered-program-switching-design.md`
- `2026-07-14-vendor-customer-database-design.md`
- `2026-07-15-configurable-head-start-design.md`
- `2026-07-15-fill-the-cup-design.md`
- `2026-07-15-flame-club-redesign-design.md`
- `2026-07-15-points-club-design.md`
- `2026-07-15-preview-animation-polish-design.md`
- `2026-07-15-setup-page-redesign-design.md`
- `2026-07-15-setup-page-width-and-cards-design.md`
- `2026-07-15-setup-preview-animation-design.md`
- `2026-07-16-reward-voucher-ledger-design.md`
- `2026-07-16-setup-mobile-wrap-fix-design.md`
- `2026-07-17-templatecentral-harness-parity-design.md`
- `2026-07-18-feature-auth-migration-design.md`
- `2026-07-18-card-check-migration-design.md`
- `2026-07-18-plant-cup-growth-animation-design.md`
- `2026-07-19-dashboard-tappable-card-design.md`
- `2026-07-19-setup-create-manage-split-design.md`
- `2026-07-20-app-wide-uiux-consistency-design.md`
- `2026-07-22-card-type-regroup-and-chance-revamp-design.md`
- `2026-07-25-loyalty-card-animation-polish-design.md`
- `2026-07-27-card-visuals-phase2-design.md`
- `2026-08-15-loopkit-admin-pricing-design.md` — "loopkit Admin-Tunable Pricing — Design": launches loopkit's first-ever live Pro price ($4.99/mo, admin-tunable from `/admin` with no redeploy) via a single-row `loopkit.pricing` table and a `setPricing` server action, replacing `/dashboard/plan`'s current "no card needed yet" copy with a real DB-sourced price while the existing manual "ask us" grant flow stays unchanged.
- `2026-08-16-telegram-reward-alerts-design.md` — "Telegram Reward Redemption Alerts — Design": a vendor connects Telegram once (deep-link QR, own bot/webhook), then gets a message the moment a customer redeems a completed reward — loopkit's half of the cross-kit Telegram Phase A rollout, triggered from `redeemAction` (verified as the live redemption path, not the unused `redeemOldestVoucher`).
- `2026-08-16-customer-telegram-connect-design.md` — "Customer Telegram Connect — Design": loopkit's reuse-only half of Phase B+D — `redeemAction` checks whether the redeeming customer's phone matches an existing merqo-owned Telegram connection (from connecting via qkit) and sends a redemption confirmation. No new UI, no new table, no connect flow.
- `2026-08-16-customer-notify-vendor-toggle-design.md` — "Customer Notify Vendor Toggle — Design": fast-follow — a new `vendor_notify_settings` table (default on) letting a vendor turn off the customer redemption-confirmation message without touching the customer's own consent.
- `2026-08-16-vendor-telegram-connect-design.md` — "Vendor Telegram Connect (Phase A2) — Design": retires loopkit's own Telegram bot (Phase A) in favor of merqo's shared one; `notifyRedemptionOnTelegram` now calls merqo's `notify-vendor` endpoint. Deletion-heavy spec; no data carries over, already-linked vendors must reconnect.
- `2026-08-16-shared-plan-comparison-table-design.md` — "Shared Plan Comparison Table — Design": loopkit's migration onto qkit's new `@merqo/ui` `PlanComparisonTable` component — loopkit's existing 2-tier, boolean/string feature data needs zero reshaping to fit it.
- `2026-08-20-host-referral-mechanic-design.md` — "Host/Couple-Facing Referral Mechanic — Design": credit-routing on an existing program (not a sixth engine `type`) rewarding a wedding/event host — every distinct guest who joins via the host's `/c?ref=` link bumps the host one stamp/visit; `vendor_join_referred`/`apply_referral_credit` (migration `0040`) plus `/dashboard/referrals`.

## Parent

[superpowers](../README.md)
