# plans

## Purpose

Dated implementation plans for loopkit, one per feature/phase — the `plan`
half of this repo's spec-then-plan workflow (design docs live in the sibling
`specs/` folder, generally as `<same-slug>-design.md`). Filenames are
self-describing dated slugs; no separate description column below.

## Contents

- `2026-07-07-loopkit-core.md`
- `2026-07-07-loopkit-v2-phase1-engine.md`
- `2026-07-07-loopkit-v2-phase2-lucky.md`
- `2026-07-07-loopkit-v2-phase3a-customer-qr.md`
- `2026-07-07-loopkit-v2-phase3b-scan.md`
- `2026-07-07-loopkit-v2-phase4-sprout.md`
- `2026-07-08-loopkit-phaseW1-counter-ia.md`
- `2026-07-08-loopkit-phaseW2-chance-engine.md`
- `2026-07-08-loopkit-phaseW3-streaks.md`
- `2026-07-08-loopkit-workspace-phaseA-multiprogram.md`
- `2026-07-08-loopkit-workspace-phaseBC-revamp.md`
- `2026-07-09-loopkit-vendor-status-endpoint.md`
- `2026-07-10-dashboard-nav-plan-gating.md`
- `2026-07-10-loyalty-engine-mechanics.md`
- `2026-07-10-loyalty-stats-plan-tracking.md`
- `2026-07-10-vendor-level-join.md`
- `2026-07-11-card-change-management.md`
- `2026-07-11-loyalty-templates-and-migration.md`
- `2026-07-11-plan-tier-expansion.md`
- `2026-07-11-qr-model-customer-identity.md`
- `2026-07-11-stats-expansion.md`
- `2026-07-11-vendor-identity-profile-ui.md`
- `2026-07-11-vendor-phone-onboarding.md`
- `2026-07-14-activity-table.md`
- `2026-07-14-counter-page-universal-scan.md`
- `2026-07-14-dashboard-card-revamp.md`
- `2026-07-14-dashboard-cards-and-profile.md`
- `2026-07-14-dashboard-nav-polish.md`
- `2026-07-14-header-nav-vendor-views.md`
- `2026-07-14-nav-dropdown-reorder.md`
- `2026-07-14-nav-reachability-and-responsive-setup.md`
- `2026-07-14-qkit-parity-nav-polish.md`
- `2026-07-14-setup-live-preview.md`
- `2026-07-14-shadcn-select-avatar.md`
- `2026-07-14-shadcn-sweep-2.md`
- `2026-07-14-stamp-plant-redeem-carryover.md`
- `2026-07-14-tiered-program-switching.md`
- `2026-07-14-vendor-customer-database.md`
- `2026-07-15-configurable-head-start.md`
- `2026-07-15-fill-the-cup.md`
- `2026-07-15-flame-club-redesign.md`
- `2026-07-15-points-club.md`
- `2026-07-15-preview-animation-polish.md`
- `2026-07-15-setup-page-redesign.md`
- `2026-07-15-setup-page-width-and-cards.md`
- `2026-07-15-setup-preview-animation.md`
- `2026-07-16-reward-voucher-ledger.md`
- `2026-07-17-templatecentral-harness-parity.md`
- `2026-07-18-feature-auth-migration.md`
- `2026-07-18-card-check-migration.md`
- `2026-07-18-plant-cup-growth-animation.md`
- `2026-07-19-dashboard-tappable-card.md`
- `2026-07-19-setup-create-manage-split.md`
- `2026-07-20-app-wide-uiux-consistency.md`
- `2026-07-22-card-type-regroup-and-chance-revamp.md`
- `2026-07-27-flame-club-5-stage.md`
- `2026-07-27-fill-the-cup-redesign.md`
- `2026-07-27-sprout-restage.md`
- `2026-07-27-stamp-mark-logo-preset.md`
- `2026-08-15-loopkit-admin-pricing.md` — "loopkit Admin-Tunable Pricing Implementation Plan": adds the `loopkit.pricing` table (seeded at $4.99/mo), the `setPricing` admin action, `@merqo/ui`'s new `PricingForm` wired into `/admin`, and a live price display on `/dashboard/plan` — the manual upgrade-request grant flow is untouched.
- `2026-08-16-telegram-reward-alerts.md` — "Telegram Reward Redemption Alerts Implementation Plan": adds `vendor_telegram`/`telegram_link_tokens` tables, a signature-verified webhook route, a dashboard "Connect Telegram" section, and wires a fire-and-forget alert into `redeemAction` — a failed/missing link never affects redemption itself.
- `2026-08-16-customer-telegram-connect.md` — "Customer Telegram Connect Implementation Plan": adds a `notifyCustomerByPhone` helper and wires it into `redeemAction` as a sibling to the existing vendor Telegram alert — no new table, no new UI. Depends on merqo's own plan shipping first.
- `2026-08-16-customer-notify-vendor-toggle.md` — "Customer Notify Vendor Toggle Implementation Plan": adds a `vendor_notify_settings` table (default true) and gates `redeemAction`'s `notifyCustomerByPhone` call on it, plus a settings-page switch.
- `2026-08-16-vendor-telegram-connect.md` — "Vendor Telegram Connect (Phase A2) Implementation Plan": deletes loopkit's own Telegram bot/tables/webhook/settings section and rewires `notifyRedemptionOnTelegram` to call merqo's `notify-vendor` endpoint. Depends on merqo's own Phase A2 plan shipping first.

## Parent

[superpowers](../README.md)
