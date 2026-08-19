"use client";

import { usePathname, useRouter } from "next/navigation";
import { DashboardTour as SharedDashboardTour } from "@merqo/ui";

import { tourSteps } from "./tour-steps";

// Matches Tailwind's `sm` breakpoint: below 640px the nav links collapse
// behind the burger, so the mobile step list spotlights that instead.
// Resolved lazily (only at tour-start time, per @merqo/ui's `steps` contract)
// rather than during render, so this stays SSR-safe.
function resolveTourSteps() {
  const isMobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 639px)").matches;
  return tourSteps(isMobile);
}

// Fire-and-forget POST, not a Server Action: `@merqo/ui`'s shared
// DashboardNav renders its links as plain <a> tags (the package has no
// Next.js dependency), so every dashboard nav click (including the one
// that brings a vendor back to the overview page while the just-auto-
// started tour is still up) is a hard navigation, not a client-side
// transition. A Server Action's own internal fetch can't opt into
// `keepalive`, so a hard nav landing mid-write would abort it and leave
// `tour_seen_at` unstamped, reproducing the "tour re-runs on every visit"
// bug the stamp-on-start fix exists to prevent. `keepalive: true` tells
// the browser to finish sending this request even after the document that
// started it is gone.
function markTourSeen(): Promise<void> {
  return fetch("/api/tour-seen", { method: "POST", keepalive: true })
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * loopkit's wiring for `@merqo/ui`'s `DashboardTour`: supplies this kit's
 * own step content, mark-seen action, and routing, while the tour mechanism
 * itself (driver.js lifecycle, floating replay button, popover styling) is
 * fully owned by the shared component.
 */
export function DashboardTour({ seen }: { seen: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SharedDashboardTour
      steps={resolveTourSteps}
      seen={seen}
      onFirstSeen={markTourSeen}
      isHomeRoute={pathname === "/dashboard"}
      navigateHome={() => router.push("/dashboard")}
      scopeClassName="loopkit-tour"
    />
  );
}
