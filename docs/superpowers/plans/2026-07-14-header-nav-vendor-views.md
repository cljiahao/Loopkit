# Header nav restructure + vendor-level Activity/Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Customers/Activity/Stats as plain header nav links (not tied to any one program card), and give Activity and Stats the same vendor-level "merged across every program" default view Customers already has.

**Architecture:** `DashboardNav` gets its inline `LINKS` array and mobile burger back (both pointing at unscoped routes now, no program switcher needed). `src/lib/activity.ts` adds a pure `aggregateActivity()` + impure `listVendorActivity()` shell, mirroring `src/lib/customers.ts`. `src/lib/stats.ts` gains `getVendorStats()`, which reuses its existing pure pipeline (`classifyActivity`/`computeCardStats`/`bucketVisitsByDay`/`avgDaysBetweenVisits`) unchanged, just fed a wider cards/events query. Both `activity/page.tsx` and `stats/page.tsx` gain a new unscoped-mode branch; their existing `?p=<id>` branches stay untouched.

**Tech Stack:** Next.js 16 App Router, React Server + Client Components, TypeScript strict, Vitest + Testing Library (jsdom), lucide-react icons.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (repo-wide rule, `loopkit/AGENTS.md`).
- No Supabase migrations, RLS changes, or RPCs — this plan is presentation-layer only. `activity`'s and `stats`' vendor-level modes reuse existing tables (`cards`, `stamp_events`) and existing RLS (already scopes both to the signed-in vendor via `owns_program`/`cards_own`), same as `src/lib/customers.ts` already does for `customers`+`cards`.
- The pre-existing `?p=<id>` filtered mode on both `activity/page.tsx` and `stats/page.tsx` must render exactly as it does today — byte-identical, copied verbatim, not refactored into a shared component with the new branch (established precedent from the vendor-customer-database plan's Task 3 — a task reviewer there flagged that even "safe-looking" extraction risks the untouched branch, and explicitly preferred leaving small duplication over touching it).
- `DashboardNav`'s `<header>` wrapper in `layout.tsx` is `position: sticky` (`src/app/dashboard/layout.tsx`) — sticky already establishes a containing block for `position: absolute` descendants (same as `relative`/`fixed`), so the restored mobile panel (`absolute inset-x-0 top-full`) needs no `layout.tsx` change. Do not add `relative` to the header — it isn't needed and isn't part of this plan's scope.
- Every new/changed component file gets a co-located `*.dom.test.tsx`; every new pure-logic file in `src/lib/` gets a test at `test/lib/<name>.test.ts` (repo convention — see `test/lib/customers.test.ts`, `test/lib/stats.test.ts`).
- Run `pnpm check` (prettier + eslint + tsc) and `pnpm test` before each commit.

---

## File Structure

- **Modify** `src/app/dashboard/dashboard-nav.tsx` — restore `LINKS` array (Customers/Activity/Stats, all unscoped), `isActive()` helper, mobile burger + slide-down panel, `usePathname`. Remove the `Users`/`Customers` `DropdownMenuItem` from the account menu (added in a prior fix, now superseded by the header link).
- **Modify** `src/app/dashboard/dashboard-nav.dom.test.tsx` — cover the restored links, active-state, burger toggle; confirm the account menu no longer has a separate Customers item.
- **Create** `src/lib/activity.ts` — `aggregateActivity()` (pure) + `listVendorActivity()` (impure shell), mirroring `src/lib/customers.ts`'s pure/impure split.
- **Create** `test/lib/activity.test.ts` — pure-function tests, no DOM/mocking needed.
- **Modify** `src/app/dashboard/activity/page.tsx` — add the unfiltered (no `?p=`) branch, rendered by a new exported `VendorActivityList` presentational component; the existing `?p=<id>` branch is untouched, copied verbatim.
- **Create** `src/app/dashboard/activity/activity-page.dom.test.tsx` — dom tests for `VendorActivityList`.
- **Modify** `src/lib/stats.ts` — add `getVendorStats(programIds: string[])`, an impure shell reusing the existing pure pipeline. No changes to `getProgramStats` or any pure function.
- **Modify** `src/app/dashboard/stats/page.tsx` — add the unfiltered branch (own inline Tile-grid JSX, duplicated rather than extracted — see Global Constraints); the existing `?p=<id>` branch is untouched, copied verbatim.

No changes to: `src/app/dashboard/program-card.tsx` (its footer Customers/Activity/Stats links still work — they pass `?p=<id>`, which both pages still honor exactly as today), `src/lib/customers.ts`, `src/app/dashboard/customers/page.tsx`, `src/app/dashboard/page.tsx` (the card grid), `src/app/dashboard/layout.tsx`.

---

## Task 1: Restore `DashboardNav`'s inline links + mobile burger

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx`
- Modify: `src/app/dashboard/dashboard-nav.dom.test.tsx`

**Interfaces:**

- Produces: `DashboardNav(props: { signOut: () => Promise<void>; email: string; vendorName: string | null; avatarUrl: string | null; tier: "free" | "pro" })` — same prop signature as today (unchanged), only the rendered output changes.

- [ ] **Step 1: Write the failing test**

Replace `src/app/dashboard/dashboard-nav.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/activity",
}));

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    email: "vendor@example.com",
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders Customers, Activity, and Stats as inline nav links", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/dashboard/customers",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/dashboard/activity",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats",
    );
  });

  it("renders a mobile menu toggle", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /open menu/i }),
    ).toBeInTheDocument();
  });

  it("toggles the mobile link panel open and closed", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const toggle = screen.getByRole("button", { name: /open menu/i });
    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: /close menu/i }),
    ).toBeInTheDocument();
  });

  it("account menu has Plan, Profile, Sign out, and no separate Customers item", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });
    await user.click(accountButton);
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Sign out")).toBeInTheDocument();
    // "Customers" appears exactly once — the inline nav link (asserted by
    // role "link" above) — proving the account-dropdown item was removed,
    // not merely hidden.
    expect(screen.getAllByText("Customers")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: FAIL — current component has no inline links, no burger, and still has the Customers dropdown item.

- [ ] **Step 3: Rewrite `dashboard-nav.tsx`**

Replace the whole file:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, Menu, User, Wallet, X } from "lucide-react";
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

const LINKS = [
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];

function isActive(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

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

/**
 * Up to two initials from a label (stall name when set, else the email
 * local part); falls back to a bullet. Splitting on the same separators
 * works for both "Kopi Corner" (space) and "jane.doe" (dot) shapes.
 */
function initials(label: string): string {
  const parts = label
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Dashboard sticky-header row: brand, vendor-level nav links
 * (Customers/Activity/Stats — none are program-scoped, each defaults to a
 * merged view across every program), and the account menu (Plan, Profile,
 * Sign out). Inline on sm+; below sm, links collapse behind a burger.
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const label = vendorName?.trim() || email.trim().split("@")[0];

  return (
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      <Link
        href="/dashboard"
        aria-label="loopkit dashboard home"
        className="shrink-0 rounded-sm outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Wordmark className="text-xl" />
      </Link>

      <nav className="hidden items-center gap-1 sm:flex">
        {LINKS.map((link) => {
          const active = isActive(path, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary",
                active && "bg-primary/10 text-primary hover:bg-primary/10",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary sm:hidden"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-1 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span
                aria-hidden="true"
                className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-primary/25"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt=""
                    fill
                    sizes="2rem"
                    className="object-cover"
                  />
                ) : (
                  initials(label)
                )}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="px-2 py-2">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold">
                  {vendorName ?? email}
                </p>
                <TierBadge tier={tier} />
              </div>
              <p className="text-xs font-normal text-muted-foreground">
                {vendorName ? email : "Vendor account"}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/plan" className="cursor-pointer">
                <Wallet className="size-4" />
                Plan
              </Link>
            </DropdownMenuItem>
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

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-20 border-b bg-background/95 px-5 py-3 backdrop-blur-md sm:hidden">
          <div className="flex flex-col gap-1">
            {LINKS.map((link) => {
              const active = isActive(path, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary",
                    active && "bg-primary/10 text-primary",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes, including `test/app/dashboard-nav.test.tsx` (the older avatar/initials test file, which already mocks `usePathname`/`useSearchParams` from `next/navigation` and is unaffected by this change).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx
git commit -m "feat(dashboard): restore Customers/Activity/Stats as header nav links"
```

---

## Task 2: Vendor-level Activity

**Files:**

- Create: `src/lib/activity.ts`
- Test: `test/lib/activity.test.ts`
- Modify: `src/app/dashboard/activity/page.tsx`
- Create: `src/app/dashboard/activity/activity-page.dom.test.tsx`

**Interfaces:**

- Consumes: `createServerClient` from `@/lib/supabase/server`; `listPrograms` from `@/lib/program`; `isWonVisit` from `@/lib/metrics`.
- Produces:
  - `export type VendorActivityRow = { id: string; phone: string; programName: string; kind: string; isReward: boolean; label: string; createdAt: string }`
  - `export function aggregateActivity(events: {id: string; card_id: string; kind: string; payload?: unknown; created_at: string}[], cardsById: Map<string, {id: string; phone: string; program_id: string}>, programNameById: Record<string, string>): VendorActivityRow[]` — pure, newest-first, capped at 15.
  - `export async function listVendorActivity(): Promise<VendorActivityRow[]>` — impure shell, consumed by Task 2's `page.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `test/lib/activity.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateActivity } from "@/lib/activity";

describe("aggregateActivity", () => {
  const cardsById = new Map([
    ["c1", { id: "c1", phone: "+6591111111", program_id: "p1" }],
    ["c2", { id: "c2", phone: "+6592222222", program_id: "p2" }],
  ]);
  const programNameById = { p1: "Coffee Stamps", p2: "Lucky Tap" };

  it("tags each event with its program name and phone", () => {
    const events = [
      {
        id: "e1",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
    ];
    const result = aggregateActivity(events, cardsById, programNameById);
    expect(result).toEqual([
      {
        id: "e1",
        phone: "+6591111111",
        programName: "Coffee Stamps",
        kind: "stamp",
        isReward: false,
        label: "stamp",
        createdAt: "2026-07-10T00:00:00Z",
      },
    ]);
  });

  it("marks redeem and won visits as rewards", () => {
    const events = [
      {
        id: "e1",
        card_id: "c1",
        kind: "redeem",
        created_at: "2026-07-10T00:00:00Z",
      },
      {
        id: "e2",
        card_id: "c2",
        kind: "visit",
        payload: { won: true },
        created_at: "2026-07-09T00:00:00Z",
      },
    ];
    const result = aggregateActivity(events, cardsById, programNameById);
    expect(result[0].isReward).toBe(true);
    expect(result[0].label).toBe("redeem");
    expect(result[1].isReward).toBe(true);
    expect(result[1].label).toBe("Won");
  });

  it("sorts newest first and caps at 15", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      card_id: "c1",
      kind: "stamp",
      created_at: new Date(2026, 6, i + 1).toISOString(),
    }));
    const result = aggregateActivity(events, cardsById, programNameById);
    expect(result).toHaveLength(15);
    expect(result[0].id).toBe("e19");
  });

  it("skips an event whose card is missing from cardsById (defensive)", () => {
    const events = [
      {
        id: "e1",
        card_id: "unknown",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
    ];
    expect(aggregateActivity(events, cardsById, programNameById)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/lib/activity.test.ts`
Expected: FAIL with "Cannot find module '@/lib/activity'"

- [ ] **Step 3: Write `src/lib/activity.ts`**

```ts
import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";
import { isWonVisit } from "@/lib/metrics";

export type VendorActivityRow = {
  id: string;
  phone: string;
  programName: string;
  kind: string;
  isReward: boolean;
  label: string;
  createdAt: string;
};

type ActivityEvent = {
  id: string;
  card_id: string;
  kind: string;
  payload?: unknown;
  created_at: string;
};
type ActivityCard = { id: string; phone: string; program_id: string };

const MAX_ROWS = 15;

// Pure: resolve each event's card/program, classify reward vs. plain
// activity (same "won visit or redeem" rule as src/lib/stats.ts), return
// newest-first, capped at MAX_ROWS. An event whose card isn't in
// cardsById is dropped — defensive; should not happen given the impure
// shell only fetches events for cards it already loaded.
export function aggregateActivity(
  events: ActivityEvent[],
  cardsById: Map<string, ActivityCard>,
  programNameById: Record<string, string>,
): VendorActivityRow[] {
  const rows: VendorActivityRow[] = [];
  for (const event of events) {
    const card = cardsById.get(event.card_id);
    if (!card) continue;
    const won = isWonVisit(event);
    const isReward = event.kind === "redeem" || won;
    const label = won ? "Won" : event.kind === "visit" ? "Visit" : event.kind;
    rows.push({
      id: event.id,
      phone: card.phone,
      programName: programNameById[card.program_id] ?? "—",
      kind: event.kind,
      isReward,
      label,
      createdAt: event.created_at,
    });
  }

  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_ROWS);
}

// Impure shell: every activity event across every one of the vendor's
// programs, newest first. Mirrors listVendorCustomers's two-query shape
// (programs -> their cards -> those cards' events); RLS scopes both
// `cards` and `stamp_events` reads to the signed-in vendor already.
export async function listVendorActivity(): Promise<VendorActivityRow[]> {
  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );
  const programIds = programs.map((p) => p.id);
  if (programIds.length === 0) return [];

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("id,phone,program_id")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listVendorActivity: ${cardsError.message}`);

  const cards = cardsData ?? [];
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length === 0) return [];

  const { data: eventsData, error: eventsError } = await supabase
    .from("stamp_events")
    .select("id,card_id,kind,payload,created_at")
    .in("card_id", cardIds)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (eventsError)
    throw new Error(`listVendorActivity: ${eventsError.message}`);

  return aggregateActivity(eventsData ?? [], cardsById, programNameById);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/lib/activity.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing dom test**

Create `src/app/dashboard/activity/activity-page.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorActivityList } from "./page";
import type { VendorActivityRow } from "@/lib/activity";

const activity: VendorActivityRow[] = [
  {
    id: "e1",
    phone: "+6591234567",
    programName: "Coffee Stamps",
    kind: "stamp",
    isReward: false,
    label: "stamp",
    createdAt: "2026-07-10T00:00:00Z",
  },
];

describe("VendorActivityList", () => {
  it("renders an event's phone and program badge", () => {
    render(<VendorActivityList activity={activity} />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
  });

  it("shows an empty state with zero activity", () => {
    render(<VendorActivityList activity={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
```

Run: `pnpm test activity-page.dom.test.tsx`
Expected: FAIL with "Cannot find module './page'" export `VendorActivityList`.

- [ ] **Step 6: Rewrite `activity/page.tsx`**

Replace `src/app/dashboard/activity/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Gift, Stamp } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { formatSgtDateTime } from "@/lib/format";
import { createServerClient } from "@/lib/supabase/server";
import { listVendorActivity, type VendorActivityRow } from "@/lib/activity";
import { Badge } from "@/components/ui/badge";

// Extracted so it's testable with plain props. Renders the vendor-level
// (no ?p=) feed: every event across every program, each tagged with which
// program it belongs to (not implicit anymore once merged).
export function VendorActivityList({
  activity,
}: {
  activity: VendorActivityRow[];
}) {
  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {activity.map((event) => (
        <li
          key={event.id}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={
                event.isReward
                  ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-accent"
                  : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
              }
            >
              {event.isReward ? (
                <Gift className="size-3.5" />
              ) : (
                <Stamp className="size-3.5" />
              )}
            </span>
            <span className="min-w-0">
              <span className="font-medium capitalize">{event.label}</span>
              <span className="ml-2 truncate text-muted-foreground">
                {event.phone}
              </span>
              <Badge variant="secondary" className="ml-2">
                {event.programName}
              </Badge>
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">
            {formatSgtDateTime(event.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ActivityPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;

  if (!p) {
    const activity = await listVendorActivity();
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>
        <VendorActivityList activity={activity} />
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const supabase = await createServerClient();
  // Scope recent activity to the current program's cards (cards_own already
  // limits this to the signed-in vendor). Reading the cards first also gives us
  // the phone map the activity list needs.
  const { data: cards } = await supabase
    .from("cards")
    .select("id,phone")
    .eq("program_id", program.id);
  const phoneByCardId = new Map<string, string>();
  const cardIds = (cards ?? []).map((c) => c.id);
  for (const c of cards ?? []) phoneByCardId.set(c.id, c.phone);

  const events =
    cardIds.length > 0
      ? (
          await supabase
            .from("stamp_events")
            .select("id,kind,payload,created_at,card_id")
            .in("card_id", cardIds)
            .order("created_at", { ascending: false })
            .limit(10)
        ).data
      : [];

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>

      {events && events.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {events.map((event) => {
            const won =
              event.kind === "visit" &&
              typeof event.payload === "object" &&
              event.payload !== null &&
              (event.payload as { won?: boolean }).won === true;
            const isReward = event.kind === "redeem" || won;
            const label = won
              ? "Won"
              : event.kind === "visit"
                ? "Visit"
                : event.kind;
            return (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={
                      isReward
                        ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-accent"
                        : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    {isReward ? (
                      <Gift className="size-3.5" />
                    ) : (
                      <Stamp className="size-3.5" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium capitalize">{label}</span>
                    <span className="ml-2 truncate text-muted-foreground">
                      {phoneByCardId.get(event.card_id) ?? "—"}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatSgtDateTime(event.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">No stamps yet.</p>
        </div>
      )}
    </main>
  );
}
```

Note: everything from `const program = currentProgram(programs, p);` to the end is copied verbatim from the file's current contents — this preserves the Global Constraint that filtered mode renders byte-identical to today.

- [ ] **Step 7: Run tests to verify they pass**

Run: `pnpm test activity-page.dom.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 8: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes.

- [ ] **Step 9: Commit**

```bash
git add src/lib/activity.ts test/lib/activity.test.ts src/app/dashboard/activity/page.tsx src/app/dashboard/activity/activity-page.dom.test.tsx
git commit -m "feat(dashboard): vendor-level Activity feed when no program is selected"
```

---

## Task 3: Vendor-level Stats

**Files:**

- Modify: `src/lib/stats.ts`
- Modify: `src/app/dashboard/stats/page.tsx`

**Interfaces:**

- Consumes: `classifyActivity`, `computeCardStats`, `bucketVisitsByDay`, `avgDaysBetweenVisits` (all already defined in `stats.ts`, unchanged) and `ProgramStats` (unchanged type).
- Produces: `export async function getVendorStats(programIds: string[]): Promise<ProgramStats>` — impure shell, same return shape as `getProgramStats`.

- [ ] **Step 1: Add `getVendorStats` to `stats.ts`**

No new pure logic exists to TDD here — `getVendorStats` is a thin impure shell that reuses the exact pure pipeline `getProgramStats` already uses (already covered by `test/lib/stats.test.ts`), just fed a wider query. This mirrors `getProgramStats` itself, which also has no direct test — only the pure functions it calls do. Append to `src/lib/stats.ts`, after `getProgramStats`:

```ts
// Impure shell: fetch cards+events across every one of the vendor's
// programs (not just one), then delegate to the same pure pipeline
// getProgramStats uses. classifyActivity/computeCardStats/
// bucketVisitsByDay/avgDaysBetweenVisits are already program-agnostic —
// no new pure logic is needed, only a wider query.
export async function getVendorStats(
  programIds: string[],
): Promise<ProgramStats> {
  const supabase = await createServerClient();
  const nowMs = Date.now();

  if (programIds.length === 0) {
    const cardStats = computeCardStats([], [], [], nowMs);
    return {
      ...cardStats,
      visitsByDay: bucketVisitsByDay([], nowMs),
      avgDaysBetweenVisits: null,
    };
  }

  const { data: cards, error: cardsError } = await supabase
    .from("cards")
    .select("id,created_at")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`getVendorStats: ${cardsError.message}`);

  const cardIds = (cards ?? []).map((c) => c.id);

  let events: StatsEvent[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("stamp_events")
      .select("card_id,kind,payload,created_at")
      .in("card_id", cardIds);
    if (error) throw new Error(`getVendorStats: ${error.message}`);
    events = data ?? [];
  }

  const { activityEvents, rewardEvents } = classifyActivity(events);
  const cardStats = computeCardStats(
    cards ?? [],
    activityEvents,
    rewardEvents,
    nowMs,
  );
  const visitsByDay = bucketVisitsByDay(activityEvents, nowMs);

  return {
    ...cardStats,
    visitsByDay,
    avgDaysBetweenVisits: avgDaysBetweenVisits(activityEvents),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: no TS errors.

- [ ] **Step 3: Rewrite `stats/page.tsx`**

Replace `src/app/dashboard/stats/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats, getVendorStats } from "@/lib/stats";
import { cn } from "@/lib/utils";

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
        up
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
          : "bg-destructive/12 text-destructive",
      )}
      title="vs. the prior 30 days"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}

function Tile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

type StatsPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;

  if (!p) {
    const stats = await getVendorStats(programs.map((prog) => prog.id));
    const maxDay = Math.max(1, ...stats.visitsByDay.map((d) => d.count));

    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your shop is performing across every program.
          </p>
        </div>

        {stats.enrolled === 0 ? (
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <p className="text-sm text-muted-foreground">
              No customers yet — share your QR from the Counter page to start
              enrolling.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile label="Enrolled customers" value={String(stats.enrolled)} />
              <Tile
                label="Active / lapsed (30d)"
                value={`${stats.active} / ${stats.lapsed}`}
                delta={stats.activeDelta}
              />
              <Tile
                label="Redemption rate"
                value={`${Math.round(stats.redemptionRate * 100)}%`}
              />
              <Tile
                label="Repeat-visit rate"
                value={`${Math.round(stats.repeatVisitRate * 100)}%`}
              />
              <Tile
                label="Visits (30d)"
                value={String(stats.visits30d)}
                delta={stats.visitsDelta}
              />
              <Tile
                label="Rewards redeemed (30d)"
                value={String(stats.rewards30d)}
                delta={stats.rewardsDelta}
              />
              <Tile
                label="Avg days between visits"
                value={
                  stats.avgDaysBetweenVisits === null
                    ? "—"
                    : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
                }
              />
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Last 30 days
              </h2>
              <div className="mt-4 flex h-24 items-end gap-[3px]">
                {stats.visitsByDay.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.count}`}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{
                      height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const stats = await getProgramStats(program.id);
  const maxDay = Math.max(1, ...stats.visitsByDay.map((d) => d.count));

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>

      {stats.enrolled === 0 ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            No customers yet — share your QR from the Counter page to start
            enrolling.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Enrolled customers" value={String(stats.enrolled)} />
            <Tile
              label="Active / lapsed (30d)"
              value={`${stats.active} / ${stats.lapsed}`}
              delta={stats.activeDelta}
            />
            <Tile
              label="Redemption rate"
              value={`${Math.round(stats.redemptionRate * 100)}%`}
            />
            <Tile
              label="Repeat-visit rate"
              value={`${Math.round(stats.repeatVisitRate * 100)}%`}
            />
            <Tile
              label="Visits (30d)"
              value={String(stats.visits30d)}
              delta={stats.visitsDelta}
            />
            <Tile
              label="Rewards redeemed (30d)"
              value={String(stats.rewards30d)}
              delta={stats.rewardsDelta}
            />
            <Tile
              label="Avg days between visits"
              value={
                stats.avgDaysBetweenVisits === null
                  ? "—"
                  : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
              }
            />
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Last 30 days
            </h2>
            <div className="mt-4 flex h-24 items-end gap-[3px]">
              {stats.visitsByDay.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count}`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{
                    height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
```

Note: the `Delta`/`Tile` helper components and everything from `const program = currentProgram(programs, p);` onward are copied verbatim from the file's current contents — this preserves the Global Constraint that filtered mode renders byte-identical to today. The `?p=` branch is deliberately NOT refactored to share JSX with the new unfiltered branch (see Global Constraints) — the Tile-grid markup is duplicated between the two branches on purpose.

- [ ] **Step 4: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes — no new tests were added in this task (see Step 1's rationale), so the pass count should be unchanged from the end of Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.ts src/app/dashboard/stats/page.tsx
git commit -m "feat(dashboard): vendor-level Stats when no program is selected"
```

---

## Self-Review

**Spec coverage:**

- Header nav restored, unscoped links, mobile burger → Task 1.
- Customers removed from account dropdown → Task 1.
- Vendor-level Activity (merged, program-tagged, top 15) → Task 2.
- Vendor-level Stats (reuses existing pure pipeline) → Task 3.
- Both `?p=<id>` filtered modes stay byte-identical → Task 2 Step 6's note, Task 3 Step 3's note (both explicit, both verified by task review the same way the Customers plan's Task 3 was).
- Counter page, universal scan, stamp redeem-carryover → explicitly out of scope (Specs B and C), untouched.

**Placeholder scan:** no TBD/TODO. Task 3's Step 1 deliberately has no RED/GREEN test cycle — this is documented as an intentional deviation (no new pure logic exists to test; mirrors `getProgramStats`'s own untested-shell precedent already in the codebase), not a placeholder or skipped requirement.

**Type consistency:** `VendorActivityRow` defined once in `src/lib/activity.ts` (Task 2), imported identically in `activity/page.tsx` and `activity-page.dom.test.tsx` — same field names throughout. `getVendorStats`'s return type (`ProgramStats`, Task 3) is the exact same type `getProgramStats` already returns, so `stats/page.tsx`'s unfiltered branch consumes it with zero new type surface. `DashboardNav`'s prop signature (Task 1) is unchanged from before this plan — no other file needed updating.
