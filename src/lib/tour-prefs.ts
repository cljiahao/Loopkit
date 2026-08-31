import { createServerClient } from "@/lib/supabase/server";

type VendorSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Upsert `tour_seen_at = now()` on a vendor's own `vendors` row. Best-effort:
 * this is cosmetic, so a failure is logged but never surfaced — the worst
 * case is the tour shows once more. RLS scopes the upsert to the vendor's
 * own row (vendor_id = auth.uid(), via the vendors_own policy).
 *
 * Upsert, not update: `loopkit.vendors` is created lazily (0017_loopkit_
 * vendor_profile.sql — "a vendor's first save via /profile is their first
 * write here"), so a vendor who lands on the dashboard without ever
 * visiting /profile has no row yet. An `.update()` against a nonexistent
 * row matches zero rows and returns no error — silently persisting
 * nothing, so tour_seen_at could never actually be set and the tour
 * re-triggered on every single load. Same "starts with no row" shape as
 * paykit's `vendor_prefs` (see paykit's own `tour-prefs.ts`), fixed the
 * same way there from the start — loopkit's version of this fix
 * (loopkit#61, 2026-08-12) copied stockkit's `.update()` pattern instead,
 * which only works because stockkit's vendor row is guaranteed to exist.
 *
 * Shared by two callers: `src/app/api/tour-seen/route.ts`'s `POST` (the
 * client-fired, `keepalive` fire-and-forget path) and
 * `src/app/dashboard/layout.tsx`'s own server render (the durable path —
 * see that file for why the client-fired path alone isn't reliable). Kept
 * in a plain module rather than inlined in the route so `layout.tsx` can
 * call it directly during SSR without depending on the route handler.
 */
export async function stampTourSeen(
  supabase: VendorSupabaseClient,
  vendorId: string,
): Promise<void> {
  const { error } = await supabase
    .from("vendors")
    .upsert({ vendor_id: vendorId, tour_seen_at: new Date().toISOString() });

  if (error) console.error("markTourSeen failed", error.message);
}
