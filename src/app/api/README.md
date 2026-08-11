# api

## Purpose

Route-handler root: the `merqo/` namespace (bearer-token-authenticated
endpoints the Merqo platform calls) plus `tour-seen/`, a same-origin,
vendor-session-authenticated endpoint the dashboard's own browser client
calls.

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

## Parent

[app](../README.md)
