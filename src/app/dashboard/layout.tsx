import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { isAdmin } from "@/lib/admin";
import { isPro } from "@/lib/program";
import { getVendorProfile } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";
import { stampTourSeen } from "@/lib/tour-prefs";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";
import { DashboardTour } from "@/components/dashboard-tour";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireVendor();

  // Admins have no program and don't use the vendor dashboard — send them home.
  if (await isAdmin(user.id)) redirect("/admin");

  // A plain top-level client for the tour_seen_at read below — kept separate
  // from signOut's own client (that one is created inside its "use server"
  // closure on purpose, so the inline action doesn't close over a
  // non-serializable Supabase client instance).
  const supabase = await createServerClient();
  const [pro, vendorProfile, { data: vendorRow }] = await Promise.all([
    isPro(),
    getVendorProfile(),
    supabase.from("vendors").select("tour_seen_at").maybeSingle(),
  ]);

  // Durable "start" stamp, in addition to dashboard-tour.tsx's client-fired
  // one: this layout wraps every /dashboard/* page, so stamping here —
  // synchronously, as part of this request — lands before the response is
  // even sent, no matter what happens client-side afterwards. See
  // tour-prefs.ts's stampTourSeen and dashboard-tour.tsx's markTourSeen
  // comments for the hard-navigation race this closes.
  if (!vendorRow?.tour_seen_at) {
    await stampTourSeen(supabase, user.id);
  }

  // Inline server action so the header's Sign out `<form>` can post directly —
  // no client bundle, no exposed endpoint beyond this closure.
  async function signOut() {
    "use server";
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* @merqo/ui's DashboardNav renders its own <header> (sticky/border/
          background/blur, identical classes to what this wrapper used to
          own) — a plain <div> here would nest a second <header> inside it,
          breaking `position: sticky`'s containing block. `display: contents`
          removes this wrapper from the box tree entirely so DashboardNav's
          own <header> becomes the direct flex child, while still applying
          print:hidden. */}
      <div className="contents print:hidden">
        <Suspense fallback={null}>
          <DashboardNav
            signOut={signOut}
            email={user.email ?? ""}
            vendorName={vendorProfile.name}
            avatarUrl={user.user_metadata?.avatar_url ?? null}
            tier={pro ? "pro" : "free"}
          />
        </Suspense>
      </div>
      {/* Single canonical content container for every /dashboard page — mirrors
          qkit's dashboard/layout.tsx <main>, so the nav's inner max-w-7xl and
          this container's max-w-7xl line up at the same edge. Individual pages
          used to each set their own (inconsistent) width; they now render a
          plain <div> (no landmark clash with this <main>) and may still nest a
          narrower wrapper inside here when content genuinely reads better
          narrower (profile/counter/plan/settings). */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-5 py-10">
        {children}
      </main>
      <DashboardTour seen={!!vendorRow?.tour_seen_at} />
    </div>
  );
}
