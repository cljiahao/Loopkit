"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { Wordmark } from "@/components/landing/wordmark";
import { Button } from "@/components/ui/button";

/**
 * Dashboard sticky-header row: brand on the left, Sign out on the right. Page
 * navigation (Counter/Customers/Activity/Grow) lives in DashboardTabs, not
 * here — this header only carries the brand mark and the account escape
 * hatch. Sign-out is a `<form action={signOut}>` calling the server closure
 * the layout passes in.
 */
export function DashboardNav({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
      <Link
        href="/dashboard"
        aria-label="loopkit dashboard home"
        className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Wordmark className="text-xl" />
      </Link>

      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="rounded-lg text-muted-foreground"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </form>
    </div>
  );
}
