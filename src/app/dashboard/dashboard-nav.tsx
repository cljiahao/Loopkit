"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { DashboardNav as SharedDashboardNav } from "@merqo/ui";
import { Wordmark } from "@/components/landing/wordmark";
import { cn } from "@/lib/utils";
import { submitFeedbackAction } from "@/app/actions/feedback";
import { submitSupportMessageAction } from "@/app/actions/support";
import { SUPPORT_CATEGORY_LABELS } from "@/lib/schemas";
import type { SupportMessageInput } from "@/lib/schemas";

type Tier = "free" | "pro";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];

function isActive(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

/** Stable anchor id for the onboarding tour, e.g. "/dashboard/customers" → "nav-customers". */
function tourAnchor(href: string): string {
  return `nav-${href === "/dashboard" ? "dashboard" : href.split("/").pop()}`;
}

const TIER_BADGE: Record<Tier, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-gold/10 text-gold-accent ring-gold/40",
  },
  pro: {
    label: "Pro",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:ring-emerald-400/30",
  },
};

function TierBadge({ tier }: { tier: Tier }) {
  const { label, className } = TIER_BADGE[tier];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold uppercase tracking-wider ring-1 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}

const HELP_CATEGORY_VALUES = Object.keys(
  SUPPORT_CATEGORY_LABELS,
) as SupportMessageInput["category"][];

function isSupportCategory(
  value: string | undefined,
): value is SupportMessageInput["category"] {
  return (HELP_CATEGORY_VALUES as string[]).includes(value ?? "");
}

/**
 * The other live Merqo kits a signed-in vendor can jump to. SSO (shared
 * `.merqo.io` cookie) already signs them in everywhere, so this is pure
 * in-product navigation — no live API call, no per-vendor filtering. Every
 * kit's own dashboard already handles a signed-in vendor without that
 * kit's vendor row gracefully, so listing all live kits unconditionally
 * (minus loopkit itself) is safe. See merqo-ui's kit-switcher plan doc
 * (docs/superpowers/plans/ in that repo) for the full design reasoning.
 */
const SWITCH_KITS = [
  { label: "qkit", href: "https://qkit-sg.vercel.app" },
  { label: "paykit", href: "https://paykit-sg.vercel.app" },
  { label: "stockkit", href: "https://stockkit-sg.vercel.app" },
];

/**
 * Dashboard sticky-header row: composes @merqo/ui's DashboardNav (burger +
 * inline links) and AccountMenu (avatar dropdown, owning its own
 * Feedback/Get-help Sheet chrome internally). Keeps the same call-site
 * signature the old hand-rolled version had.
 */
export function DashboardNav({
  signOut,
  email,
  vendorName,
  avatarUrl,
  tier,
}: {
  signOut: () => Promise<void>;
  email: string;
  vendorName: string | null;
  avatarUrl: string | null;
  tier: Tier;
}) {
  const path = usePathname();
  const label = vendorName?.trim() || email.trim().split("@")[0];

  return (
    <SharedDashboardNav
      LinkComponent={Link}
      wordmark={
        <a
          href="/dashboard"
          aria-label="loopkit dashboard home"
          className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Wordmark className="text-3xl" />
        </a>
      }
      navLinks={LINKS}
      isActiveHref={(href) =>
        href === "/dashboard" ? path === "/dashboard" : isActive(path, href)
      }
      tourAnchor={tourAnchor}
      vendor={{
        name: label,
        avatarUrl: avatarUrl ?? undefined,
        tier,
        subtitle: vendorName?.trim() || "Your stall",
      }}
      signOutAction={signOut}
      kitLocalSettingsHref="/dashboard/settings"
      showPlanItem
      tierBadge={<TierBadge tier={tier} />}
      switchKits={SWITCH_KITS}
      getHelp={{
        type: "form",
        onSubmit: async ({ message, category }) => {
          const res = await submitSupportMessageAction({
            category: isSupportCategory(category) ? category : "other",
            body: message,
          });
          if (!res.success) throw new Error(res.error);
        },
        categories: HELP_CATEGORY_VALUES.map((value) => ({
          value,
          label: SUPPORT_CATEGORY_LABELS[value],
        })),
      }}
      onFeedbackSubmit={async ({ message, nps }) => {
        const res = await submitFeedbackAction({ nps: nps ?? 0, message });
        if (!res.success) throw new Error(res.error);
      }}
      showNps
    />
  );
}
