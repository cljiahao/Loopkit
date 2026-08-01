import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { isAdmin } from "@/lib/admin";
import { isPro } from "@/lib/program";
import { getVendorProfile } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";
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
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 py-3.5 backdrop-blur-md print:hidden">
        <Suspense fallback={null}>
          <DashboardNav
            signOut={signOut}
            email={user.email ?? ""}
            vendorName={vendorProfile.name}
            avatarUrl={user.user_metadata?.avatar_url ?? null}
            tier={pro ? "pro" : "free"}
          />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
      <DashboardTour seen={!!vendorRow?.tour_seen_at} />
    </div>
  );
}
