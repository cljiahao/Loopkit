# tour-seen

## Purpose

`POST` endpoint that stamps the signed-in vendor's `vendors.tour_seen_at`,
marking the dashboard onboarding tour as seen.

## Contents

- `route.test.ts` — unit tests for `POST`: calls `stampTourSeen` with the
  signed-in vendor's id and returns 204, no-ops (still 204, no
  `stampTourSeen` call) when signed out
- `route.ts` — `POST`: cookie-authenticated via `createServerClient()`
  (the vendor's own Supabase session, not a bearer secret), then delegates
  the actual `vendors.tour_seen_at` update to `@/lib/tour-prefs`'s
  `stampTourSeen` (see `src/lib/README.md`) — the same helper `src/app/dashboard/layout.tsx`
  calls for its durable server-side stamp, so there's one source of truth
  for the update itself. Deliberately a plain Route Handler rather than a
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
completion). This client-fired write is a best-effort fast path only — the
durable stamp is `src/app/dashboard/layout.tsx`'s own server-render call to
the same `stampTourSeen` helper (`@/lib/tour-prefs`), which closes the race
where a fast page refresh lands before this route's `keepalive` POST
completes.

## Parent

[api](../README.md)
