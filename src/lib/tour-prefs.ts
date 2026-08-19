import { createServerClient } from "@/lib/supabase/server";

type VendorSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Stamp `tour_seen_at = now()` on a vendor's own `vendors` row. Best-effort:
 * this is cosmetic, so a failure is logged but never surfaced — the worst
 * case is the tour shows once more. RLS scopes the update to the vendor's
 * own row (vendor_id = auth.uid(), via the vendors_own policy).
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
    .update({ tour_seen_at: new Date().toISOString() })
    .eq("vendor_id", vendorId);

  if (error) console.error("markTourSeen failed", error.message);
}
