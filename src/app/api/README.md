# api

## Purpose

Route-handler root: the `merqo/` namespace (bearer-token-authenticated
endpoints the Merqo platform calls) and `tour-seen/`, a same-origin,
vendor-session-authenticated endpoint the dashboard's own browser client
calls. loopkit no longer runs its own Telegram bot/webhook (retired in
favor of merqo's shared one, Phase A2) — see
`docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`.

## Contents

- `merqo/`
- `tour-seen/` — `POST` endpoint the dashboard onboarding tour calls (via
  `fetch(..., { keepalive: true })`, not a Server Action) to stamp
  `vendors.tour_seen_at` the instant the tour auto-starts, so the write
  survives a hard-navigation page unload triggered mid-flight.

## Connectivity

`merqo/`'s routes let the Merqo platform pull loopkit data (metrics, vendor
status, qkit earn-config) over authenticated HTTP. `tour-seen/` is the odd
one out — it's called from loopkit's own dashboard in the browser
(`src/components/dashboard-tour.tsx`), authenticated by the vendor's own
Supabase session cookie rather than a bearer secret; it's a plain Route
Handler instead of a Server Action specifically so the calling `fetch` can
set `keepalive: true`, which a Server Action's own internal fetch cannot.
`redeemAction` (`src/app/dashboard/actions.ts`) now calls merqo's own
`POST /api/merqo/notify-vendor` endpoint (via `notifyVendor` in
`src/lib/merqo-customer-notify.ts`) for reward-redemption vendor alerts,
rather than loopkit running its own Telegram webhook.

## Parent

[app](../README.md)
