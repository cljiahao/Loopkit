import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { isPro, listPrograms } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";
import { createServerClient } from "@/lib/supabase/server";
import { DashboardNav } from "@/app/dashboard/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireVendor();

  // Admins have no program and don't use the vendor dashboard — send them home.
  if (await isAdmin(user.id)) redirect("/admin");

  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);

  // Only fetch per-program stats when there's a switcher to show them in —
  // the common single-program case pays no extra query.
  const activeByProgramId: Record<string, number> = {};
  if (programs.length > 1) {
    // This is purely decorative (the nav badge). If any program's stats
    // query fails, don't let it take down every page in the dashboard —
    // fall back to no badges (dashboard-nav already handles missing
    // entries via `activeByProgramId[prog.id] ?? 0`).
    try {
      const stats = await Promise.all(
        programs.map((prog) => getProgramStats(prog.id)),
      );
      programs.forEach((prog, i) => {
        activeByProgramId[prog.id] = stats[i].active;
      });
    } catch {
      // Leave activeByProgramId empty — nav degrades to showing no badges.
    }
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
      <header className="sticky top-0 z-20 border-b bg-background/85 px-5 py-3 backdrop-blur-md">
        <Suspense fallback={null}>
          <DashboardNav
            signOut={signOut}
            email={user.email ?? ""}
            tier={pro ? "pro" : "free"}
            programs={programs}
            activeByProgramId={activeByProgramId}
          />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
