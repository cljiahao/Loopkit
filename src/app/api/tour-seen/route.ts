import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const revalidate = 0;

/**
 * Mark the dashboard onboarding tour as seen for the current vendor, so it
 * stops auto-running on first login. Best-effort: this is cosmetic, so a
 * failure is logged but never surfaced — the worst case is the tour shows
 * once more. RLS scopes the update to the vendor's own row
 * (vendor_id = auth.uid(), via the vendors_own policy).
 *
 * A plain Route Handler rather than a Server Action on purpose: it's called
 * from `DashboardTour` via `fetch(..., { keepalive: true })`, not `await`ed,
 * so the write survives a full-page unload. `@merqo/ui`'s shared
 * `DashboardNav` renders its links as plain `<a>` tags (it has no Next.js
 * dependency), so every dashboard nav click — including the one that brings
 * a vendor back to the overview page while the just-auto-started tour is
 * still up — is a hard navigation. A Server Action's own internal fetch
 * can't opt into `keepalive`, so a hard nav landing mid-flight would abort
 * the in-flight write and leave `tour_seen_at` unstamped, reproducing the
 * exact "re-runs on every visit" bug the stamp-on-start fix exists to
 * prevent. `keepalive` guarantees the browser finishes sending this request
 * even after the document that started it is gone.
 */
export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 204 });

  const { error } = await supabase
    .from("vendors")
    .update({ tour_seen_at: new Date().toISOString() })
    .eq("vendor_id", user.id);

  if (error) console.error("markTourSeen failed", error.message);
  return new NextResponse(null, { status: 204 });
}
