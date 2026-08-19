import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { stampTourSeen } from "@/lib/tour-prefs";

export const revalidate = 0;

/**
 * Mark the dashboard onboarding tour as seen for the current vendor, so it
 * stops auto-running on first login. The actual update lives in
 * `stampTourSeen` (`src/lib/tour-prefs.ts`), shared with
 * `src/app/dashboard/layout.tsx`'s own durable server-side stamp — see that
 * file for why this route's client-fired write alone isn't reliable.
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

  await stampTourSeen(supabase, user.id);
  return new NextResponse(null, { status: 204 });
}
