"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Tier = "free" | "pro";

const TIER_BADGE: Record<Tier, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-secondary text-muted-foreground ring-border",
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

/** Up to two initials from an email's local part; falls back to a bullet. */
function initials(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Dashboard sticky-header row: brand on the left, account menu on the right.
 * Page navigation (Counter/Customers/Activity/Grow) lives in DashboardTabs,
 * not here — this header only carries the brand mark and the account menu.
 * The menu mirrors qkit's account dropdown (initials avatar, plan tier badge,
 * Profile, Sign out); Sign-out posts a `<form action={signOut}>` calling the
 * server closure the layout passes in.
 */
export function DashboardNav({
  signOut,
  email,
  tier,
}: {
  signOut: () => Promise<void>;
  email: string;
  tier: Tier;
}) {
  return (
    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
      <Link
        href="/dashboard"
        aria-label="loopkit dashboard home"
        className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Wordmark className="text-xl" />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-primary/25"
            >
              {initials(email)}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuLabel className="px-2 py-2">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold">{email}</p>
              <TierBadge tier={tier} />
            </div>
            <p className="text-xs font-normal text-muted-foreground">
              Vendor account
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/profile" className="cursor-pointer">
              <User className="size-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" className="w-full cursor-pointer">
                <LogOut className="size-4" />
                Sign out
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
