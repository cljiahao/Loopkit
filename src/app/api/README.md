# api

## Purpose

Route-handler root: the `merqo/` namespace (bearer-token-authenticated
endpoints the Merqo platform calls), `tour-seen/`, a same-origin,
vendor-session-authenticated endpoint the dashboard's own browser client
calls, and `telegram/`, Telegram's own webhook callback.

## Contents

- `merqo/`
- `tour-seen/` — `POST` endpoint the dashboard onboarding tour calls (via
  `fetch(..., { keepalive: true })`, not a Server Action) to stamp
  `vendors.tour_seen_at` the instant the tour auto-starts, so the write
  survives a hard-navigation page unload triggered mid-flight.
- `telegram/webhook/` — `POST` endpoint Telegram calls on every bot update;
  verifies the `X-Telegram-Bot-Api-Secret-Token` header (constant-time
  compare against `TELEGRAM_WEBHOOK_SECRET`) before touching any data,
  handles `/start <token>` by resolving the token in
  `telegram_link_tokens` (service-role) and upserting `vendor_telegram`
  with the message's `chat.id`, then deletes the token and sends a
  confirmation; always responds `200` to a Telegram-shaped request (even
  on an internal lookup failure — logged, not surfaced) since Telegram
  retries aggressively on non-2xx.

## Connectivity

`merqo/`'s routes let the Merqo platform pull loopkit data (metrics, vendor
status, qkit earn-config) over authenticated HTTP. `tour-seen/` is the odd
one out — it's called from loopkit's own dashboard in the browser
(`src/components/dashboard-tour.tsx`), authenticated by the vendor's own
Supabase session cookie rather than a bearer secret; it's a plain Route
Handler instead of a Server Action specifically so the calling `fetch` can
set `keepalive: true`, which a Server Action's own internal fetch cannot.
`telegram/webhook/` has no session cookie at all — it's naturally excluded
from `src/proxy.ts`'s auth gate since `updateSession`'s `isProtectedPath`
only checks `/dashboard` and `/setup`, so no matcher change was needed. The
dashboard settings "Connect Telegram" section (`src/app/dashboard/settings/`)
issues the short-lived tokens this route resolves, and `redeemAction`
(`src/app/dashboard/actions.ts`) is the sole caller of `sendTelegramMessage`
once a vendor is linked.

## Parent

[app](../README.md)
