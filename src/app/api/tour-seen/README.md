# tour-seen

## Purpose

`POST` endpoint that stamps the signed-in vendor's `vendors.tour_seen_at`,
marking the dashboard onboarding tour as seen.

## Contents

- `route.test.ts` — unit tests for `POST`: stamps `tour_seen_at` scoped to
  `vendor_id = auth.uid()` and returns 204, no-ops (still 204) when signed
  out, logs (never throws) on an update error
- `route.ts` — `POST`: cookie-authenticated via `createServerClient()`
  (the vendor's own Supabase session, not a bearer secret), scoped to the
  caller's own `vendors` row via RLS (`vendor_id = auth.uid()`, the
  `vendors_own` policy). Deliberately a plain Route Handler rather than a
  Server Action: `src/components/dashboard-tour.tsx` calls it with
  `fetch("/api/tour-seen", { method: "POST", keepalive: true })`, not
  `await`ed, so the write survives a full-page unload — `@merqo/ui`'s
  shared `DashboardNav` renders its links as plain `<a>` tags, so a
  dashboard nav click is a hard navigation, and only `keepalive` (which a
  Server Action's own internal fetch can't opt into) guarantees the browser
  finishes sending the request after the document that started it is gone.

## Connectivity

Called only from `src/components/dashboard-tour.tsx`'s `markTourSeen()`,
which `@merqo/ui`'s shared `DashboardTour` invokes once, immediately when
the tour auto-starts for an unseen vendor (never on replay, never on
completion).

## Parent

[api](../README.md)
