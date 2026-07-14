# Dashboard multi-program card revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace loopkit's single-program `/dashboard` (header dropdown switcher, one giant "Serve a customer" section, Edit off-card) with a card grid — one card per active program, each self-contained with its serve action, Edit, and links into its own scoped Customers/Activity/Stats.

**Architecture:** `dashboard/page.tsx` fetches all active programs + per-program stats + the shared shop QR in one pass, and renders a compact QR block followed by a CSS grid of `ProgramCard` (client component, wraps the existing `ServeCustomer` widget unchanged) plus a trailing `+ New program`/upgrade tile. `DashboardNav` sheds the program switcher and scoped page links — it becomes brand + account menu only.

**Tech Stack:** Next.js 16 App Router, React Server + Client Components, Tailwind v4, shadcn/ui, Vitest + Testing Library (jsdom), lucide-react icons.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (repo-wide rule, `loopkit/AGENTS.md`).
- No new Supabase migrations, RLS changes, or RPCs — this is presentation-layer only. Reuse `listPrograms`, `isPro`, `getProgramStats`, `canCreateProgram`/`getEntitlement`, and every existing server action (`stampAction`, `recordVisitAction`, etc. via `ServeCustomer`) unchanged.
- Every new/changed component file gets a co-located `*.dom.test.tsx` (repo convention — see `qkit-earn-settings.dom.test.tsx`), `// @vitest-environment jsdom` at the top.
- Out of scope (per spec): `/setup` edit-form revamp, per-program QR codes, any change to `vendor_join`/`/c`/the customer join flow.
- Run `pnpm check` (prettier + eslint + tsc) and `pnpm test` before each commit — this repo's Stop hook re-runs the test suite automatically and blocks on failure.

---

## File Structure

- **Modify** `src/app/dashboard/dashboard-nav.tsx` — strip program switcher + scoped links + mobile burger; add Plan to account menu.
- **Modify** `src/app/dashboard/layout.tsx` — drop the now-unused `activeByProgramId` stats fetch and the `programs`/`activeByProgramId` props passed to `DashboardNav`.
- **Create** `src/app/dashboard/dashboard-nav.dom.test.tsx` — no prior test file existed for this component.
- **Create** `src/app/dashboard/program-display.ts` — pure helpers: type→badge label/variant map, `describeProgram(program)` reward-blurb generator. Covers all 6 program types (today's page.tsx only branches on lucky/plant/else, silently mislabeling wheel/scratch/streak as generic "Stamp" — fixed here since all types now render simultaneously on one page).
- **Create** `src/app/dashboard/program-display.test.ts` — pure unit tests, no DOM needed.
- **Create** `src/app/dashboard/program-card.tsx` — client component, one per active program: header (name, type badge, Edit icon-button), stat line, `ServeCustomer` (reused as-is), footer links (Customers/Activity/Stats, `?p=` scoped).
- **Create** `src/app/dashboard/program-card.dom.test.tsx`.
- **Create** `src/app/dashboard/new-program-tile.tsx` — server component, two render modes: `+ New program` link tile, or a locked upsell tile (reuses `ProLock`).
- **Create** `src/app/dashboard/new-program-tile.dom.test.tsx`.
- **Create** `src/app/dashboard/shop-qr-block.tsx` — the shared QR, extracted from `page.tsx` and made always-visible (was a collapsed `<details>`), with an explicit instruction line next to the code.
- **Create** `src/app/dashboard/shop-qr-block.dom.test.tsx`.
- **Modify** `src/app/dashboard/page.tsx` — rewrite to fetch active programs + `Promise.allSettled` stats + QR, render `ShopQrBlock` + a `ProgramGrid` (inline in `page.tsx`, no separate file — it's a 5-line CSS grid `.map`, doesn't earn its own file) + `NewProgramTile`, keep the untouched `qkit integration` `<details>` section below.

No changes to: `src/app/dashboard/serve-customer.tsx`, `src/app/dashboard/actions.ts`, `src/app/dashboard/card-link.tsx`, `src/app/dashboard/qkit-earn-settings.tsx`, `src/lib/program.ts`, `src/lib/stats.ts`, `src/app/setup/**`, `src/app/dashboard/{customers,activity,stats}/**`.

---

## Task 1: Simplify `DashboardNav`

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx`
- Modify: `src/app/dashboard/layout.tsx`
- Create: `src/app/dashboard/dashboard-nav.dom.test.tsx`

**Interfaces:**

- Produces: `DashboardNav(props: { signOut: () => Promise<void>; email: string; vendorName: string | null; avatarUrl: string | null; tier: "free" | "pro" })` — a JSX component. Drops the `programs: Program[]` and `activeByProgramId: Record<string, number>` props the current signature has.

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/dashboard-nav.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardNav } from "./dashboard-nav";

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    email: "vendor@example.com",
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders brand and account menu, no program switcher", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.queryByRole("button", { name: /program/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /account menu/i }),
    ).toBeInTheDocument();
  });

  it("does not render the scoped page links or mobile burger", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.queryByText("Counter")).not.toBeInTheDocument();
    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /open menu/i }),
    ).not.toBeInTheDocument();
  });

  it("includes Plan in the account menu alongside Profile and Sign out", async () => {
    render(<DashboardNav {...baseProps} />);
    await screen.findByRole("link", { name: /plan/i });
    expect(screen.getByRole("link", { name: /profile/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: FAIL — current component still renders switcher/links (props also mismatch: passing no `programs` will crash `programs.length` calls first).

- [ ] **Step 3: Rewrite `dashboard-nav.tsx`**

Replace the whole file:

```tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { LogOut, User, Wallet } from "lucide-react";
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
 * Dashboard sticky-header row: brand + account menu only. Program-scoped
 * navigation (switcher, Counter/Customers/Activity/Stats) moved onto each
 * program's dashboard card — see program-card.tsx.
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
  const label = vendorName?.trim() || email.trim().split("@")[0];

  return (
    <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
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
  );
}
```

- [ ] **Step 4: Update `layout.tsx`**

In `src/app/dashboard/layout.tsx`, remove the `getProgramStats` import and the whole `activeByProgramId` block (lines computing it), and drop the now-unneeded `listPrograms` call and its `programs`/`activeByProgramId` props on `<DashboardNav>`:

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { isPro } from "@/lib/program";
import { getVendorProfile } from "@/lib/vendor";
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

  const [pro, vendorProfile] = await Promise.all([isPro(), getVendorProfile()]);

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
            vendorName={vendorProfile.name}
            avatarUrl={user.user_metadata?.avatar_url ?? null}
            tier={pro ? "pro" : "free"}
          />
        </Suspense>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors from the dropped `DashboardNav` props anywhere else (grep confirmed `dashboard-nav.tsx`/`layout.tsx` are the only two files referencing it); full suite passes.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx src/app/dashboard/layout.tsx
git commit -m "refactor(dashboard): strip program switcher/nav links from header, move Plan into account menu"
```

---

## Task 2: `program-display.ts` — shared type label/badge/description helpers

**Files:**

- Create: `src/app/dashboard/program-display.ts`
- Create: `src/app/dashboard/program-display.test.ts`

**Interfaces:**

- Consumes: `Program` type from `@/lib/program` (`{ type: string; stamps_required: number; reward_text: string; config: unknown }`).
- Produces:
  - `PROGRAM_TYPE_BADGE: Record<string, { label: string; variant: "default" | "gold" }>`
  - `describeProgram(program: Pick<Program, "type" | "stamps_required" | "reward_text" | "config">): string`

- [ ] **Step 1: Write the failing tests**

Create `src/app/dashboard/program-display.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";

describe("PROGRAM_TYPE_BADGE", () => {
  it("has an entry for every program type", () => {
    for (const type of [
      "stamp",
      "lucky",
      "plant",
      "wheel",
      "scratch",
      "streak",
    ]) {
      expect(PROGRAM_TYPE_BADGE[type]).toBeDefined();
    }
  });
});

describe("describeProgram", () => {
  it("describes a stamp program", () => {
    expect(
      describeProgram({
        type: "stamp",
        stamps_required: 8,
        reward_text: "a free coffee",
        config: {},
      }),
    ).toBe("Buy 8, get 1 a free coffee");
  });

  it("describes a lucky program using config.win_probability", () => {
    expect(
      describeProgram({
        type: "lucky",
        stamps_required: 10,
        reward_text: "a free drink",
        config: { win_probability: 0.2 },
      }),
    ).toBe("Every visit has a 20% chance to win a free drink");
  });

  it("describes a plant program", () => {
    expect(
      describeProgram({
        type: "plant",
        stamps_required: 12,
        reward_text: "a free bouquet",
        config: {},
      }),
    ).toBe("Water it 12 times to bloom a free bouquet");
  });

  it("describes a wheel program", () => {
    expect(
      describeProgram({
        type: "wheel",
        stamps_required: 10,
        reward_text: "a free dessert",
        config: {},
      }),
    ).toBe("Spin the wheel for a chance to win a free dessert");
  });

  it("describes a scratch program", () => {
    expect(
      describeProgram({
        type: "scratch",
        stamps_required: 10,
        reward_text: "a free side",
        config: {},
      }),
    ).toBe("Scratch for a chance to win a free side");
  });

  it("describes a streak program", () => {
    expect(
      describeProgram({
        type: "streak",
        stamps_required: 5,
        reward_text: "a free meal",
        config: {},
      }),
    ).toBe("Check in 5 times in a row to unlock a free meal");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test program-display.test.ts`
Expected: FAIL with "Cannot find module './program-display'"

- [ ] **Step 3: Write the implementation**

Create `src/app/dashboard/program-display.ts`:

```ts
export const PROGRAM_TYPE_BADGE: Record<
  string,
  { label: string; variant: "default" | "gold" }
> = {
  stamp: { label: "Stamp", variant: "default" },
  lucky: { label: "Lucky Tap", variant: "default" },
  plant: { label: "Sprout", variant: "gold" },
  wheel: { label: "Wheel", variant: "default" },
  scratch: { label: "Scratch", variant: "default" },
  streak: { label: "Streak", variant: "default" },
};

type DescribableProgram = {
  type: string;
  stamps_required: number;
  reward_text: string;
  config: unknown;
};

// One-line reward-mechanic blurb per program type, for the dashboard card
// header. Every branch is exercised now that all of a vendor's active
// programs render at once (previously only the single switched-to program
// was visible, so wheel/scratch/streak silently fell through to a generic
// description on dashboard/page.tsx).
export function describeProgram(program: DescribableProgram): string {
  const { type, stamps_required, reward_text, config } = program;
  if (type === "lucky") {
    const winProbability =
      (config as { win_probability?: number })?.win_probability ?? 0;
    return `Every visit has a ${Math.round(winProbability * 100)}% chance to win ${reward_text}`;
  }
  if (type === "plant") {
    return `Water it ${stamps_required} times to bloom ${reward_text}`;
  }
  if (type === "wheel") {
    return `Spin the wheel for a chance to win ${reward_text}`;
  }
  if (type === "scratch") {
    return `Scratch for a chance to win ${reward_text}`;
  }
  if (type === "streak") {
    return `Check in ${stamps_required} times in a row to unlock ${reward_text}`;
  }
  return `Buy ${stamps_required}, get 1 ${reward_text}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test program-display.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/program-display.ts src/app/dashboard/program-display.test.ts
git commit -m "feat(dashboard): add shared program type badge + description helpers covering all 6 types"
```

---

## Task 3: `ProgramCard` component

**Files:**

- Create: `src/app/dashboard/program-card.tsx`
- Create: `src/app/dashboard/program-card.dom.test.tsx`

**Interfaces:**

- Consumes: `Program` from `@/lib/program`; `ProgramStats` from `@/lib/stats`; `PROGRAM_TYPE_BADGE`/`describeProgram` from `./program-display` (Task 2); `ServeCustomer` from `./serve-customer` (unchanged); `Badge` from `@/components/ui/badge`.
- Produces: `ProgramCard(props: { program: Program; stats: ProgramStats | null })` — a JSX component. Later used by Task 5's `page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/program-card.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgramCard } from "./program-card";
import type { Program } from "@/lib/program";
import type { ProgramStats } from "@/lib/stats";

const program: Program = {
  id: "p1",
  name: "Coffee Stamps",
  stamps_required: 8,
  reward_text: "a free coffee",
  type: "stamp",
  config: {},
  active: true,
  expiry_days: null,
  head_start: false,
  replaced_by: null,
  carry_over_stamps: false,
};

const stats = { active: 12 } as ProgramStats;

describe("ProgramCard", () => {
  it("renders the program name, type badge, and description", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Stamp")).toBeInTheDocument();
    expect(screen.getByText(/buy 8, get 1 a free coffee/i)).toBeInTheDocument();
  });

  it("links Edit to /setup?edit=<id>", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(
      screen.getByRole("link", { name: /edit coffee stamps/i }),
    ).toHaveAttribute("href", "/setup?edit=p1");
  });

  it("shows the active-count stat when stats are available", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByText(/12 active/i)).toBeInTheDocument();
  });

  it("falls back to a dash when stats are null (fetch failed)", () => {
    render(<ProgramCard program={program} stats={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("scopes footer links to this program via ?p=", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/dashboard/customers?p=p1",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/dashboard/activity?p=p1",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats?p=p1",
    );
  });

  it("renders the ServeCustomer widget for this program", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByLabelText(/customer phone/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test program-card.dom.test.tsx`
Expected: FAIL with "Cannot find module './program-card'"

- [ ] **Step 3: Write the implementation**

Create `src/app/dashboard/program-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ServeCustomer } from "@/app/dashboard/serve-customer";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";
import type { Program } from "@/lib/program";
import type { ProgramStats } from "@/lib/stats";

// One card per active program. Field order is fixed across every card
// (header -> stat -> serve action -> footer links) so scanning a grid of
// several cards stays fast regardless of how many a vendor has.
export function ProgramCard({
  program,
  stats,
}: {
  program: Program;
  stats: ProgramStats | null;
}) {
  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const scoped = (href: string) => `${href}?p=${program.id}`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-bold tracking-tight">
              {program.name}
            </h2>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {describeProgram(program)}
          </p>
        </div>
        <Link
          href={`/setup?edit=${program.id}`}
          aria-label={`Edit ${program.name}`}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Pencil className="size-4" />
        </Link>
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        {stats ? `${stats.active} active (30d)` : "—"}
      </p>

      <ServeCustomer
        programId={program.id}
        type={program.type}
        stampsRequired={program.stamps_required}
        rewardText={program.reward_text}
      />

      <div className="flex gap-4 border-t pt-3 text-sm font-medium text-muted-foreground">
        <Link
          href={scoped("/dashboard/customers")}
          className="hover:text-foreground"
        >
          Customers
        </Link>
        <Link
          href={scoped("/dashboard/activity")}
          className="hover:text-foreground"
        >
          Activity
        </Link>
        <Link
          href={scoped("/dashboard/stats")}
          className="hover:text-foreground"
        >
          Stats
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test program-card.dom.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/program-card.tsx src/app/dashboard/program-card.dom.test.tsx
git commit -m "feat(dashboard): add ProgramCard wrapping serve/edit/scoped-links per program"
```

---

## Task 4: `NewProgramTile` + `ShopQrBlock`

**Files:**

- Create: `src/app/dashboard/new-program-tile.tsx`
- Create: `src/app/dashboard/new-program-tile.dom.test.tsx`
- Create: `src/app/dashboard/shop-qr-block.tsx`
- Create: `src/app/dashboard/shop-qr-block.dom.test.tsx`

**Interfaces:**

- `NewProgramTile(props: { canCreate: boolean })` — renders a `+ New program` link tile when `canCreate`, else a locked upsell tile using `ProLock` from `@/components/pro-lock`.
- `ShopQrBlock(props: { qrSvgMarkup: string; link: string; programNames: string[] })` — the shared shop QR, always visible (not collapsed), with a one-line CTA and `CardLinkActions` (unchanged import from `./card-link`).

- [ ] **Step 1: Write the failing tests**

Create `src/app/dashboard/new-program-tile.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewProgramTile } from "./new-program-tile";

describe("NewProgramTile", () => {
  it("links to /setup when the vendor can create another program", () => {
    render(<NewProgramTile canCreate={true} />);
    expect(screen.getByRole("link", { name: /new program/i })).toHaveAttribute(
      "href",
      "/setup",
    );
  });

  it("shows an upgrade prompt instead when at the free-tier cap", () => {
    render(<NewProgramTile canCreate={false} />);
    expect(
      screen.queryByRole("link", { name: /new program/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument();
  });
});
```

Create `src/app/dashboard/shop-qr-block.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShopQrBlock } from "./shop-qr-block";

describe("ShopQrBlock", () => {
  it("shows the join instruction and the link", () => {
    render(
      <ShopQrBlock
        qrSvgMarkup="<svg></svg>"
        link="https://example.com/c?v=vendor1"
        programNames={["Coffee Stamps", "Lucky Tap"]}
      />,
    );
    expect(
      screen.getByText(/scan this to join coffee stamps, lucky tap/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://example.com/c?v=vendor1"),
    ).toBeInTheDocument();
  });

  it("falls back to generic copy when there are no active programs", () => {
    render(
      <ShopQrBlock
        qrSvgMarkup="<svg></svg>"
        link="https://example.com/c?v=vendor1"
        programNames={[]}
      />,
    );
    expect(
      screen.getByText(/scan this to join your programs/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test new-program-tile.dom.test.tsx shop-qr-block.dom.test.tsx`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Write the implementations**

Create `src/app/dashboard/new-program-tile.tsx`:

```tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { ProLock } from "@/components/pro-lock";

// Trailing tile in the program grid — the one place "add a program" lives
// on the dashboard now that Edit/serve/etc moved onto each card.
export function NewProgramTile({ canCreate }: { canCreate: boolean }) {
  if (!canCreate) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card p-5 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Free plan includes 1 active program.
        </p>
        <ProLock label="Upgrade to Pro" />
      </div>
    );
  }

  return (
    <Link
      href="/setup"
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-5 text-center text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      <Plus className="size-5" />
      <span className="text-sm font-semibold">New program</span>
    </Link>
  );
}
```

Create `src/app/dashboard/shop-qr-block.tsx`:

```tsx
import { CardLinkActions } from "@/app/dashboard/card-link";

// Shared shop-wide QR — one per vendor, not per program (a per-program QR
// would need a new scoped join RPC; out of scope, see the design spec).
// Always visible (not collapsed) with an explicit instruction next to the
// code — a bare QR with no CTA is a common failure mode.
export function ShopQrBlock({
  qrSvgMarkup,
  link,
  programNames,
}: {
  qrSvgMarkup: string;
  link: string;
  programNames: string[];
}) {
  const joinCopy =
    programNames.length > 0
      ? `Customers scan this to join ${programNames.join(", ")}.`
      : "Customers scan this to join your programs.";

  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
      <div
        className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-20"
        dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{joinCopy}</p>
        <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
          {link}
        </code>
        <CardLinkActions link={link} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test new-program-tile.dom.test.tsx shop-qr-block.dom.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/new-program-tile.tsx src/app/dashboard/new-program-tile.dom.test.tsx src/app/dashboard/shop-qr-block.tsx src/app/dashboard/shop-qr-block.dom.test.tsx
git commit -m "feat(dashboard): add NewProgramTile and always-visible ShopQrBlock"
```

---

## Task 5: Rewrite `dashboard/page.tsx` to assemble the grid

**Files:**

- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**

- Consumes: `ProgramCard` (Task 3), `NewProgramTile`/`ShopQrBlock` (Task 4), `listPrograms`/`isPro`/`canCreateProgram`/`getEntitlement` from `@/lib/program`, `getProgramStats` from `@/lib/stats`, `qrSvg` from `@/lib/qr`, `QkitEarnSettings` (unchanged).
- No `searchParams`/`?p=` reading anymore at the page level — the page shows every active program, not one switched-to program.

- [ ] **Step 1: Rewrite the file**

Replace `src/app/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  listPrograms,
  isPro,
  canCreateProgram,
  getEntitlement,
} from "@/lib/program";
import { getProgramStats, type ProgramStats } from "@/lib/stats";
import { requireVendor } from "@/lib/auth";
import { qrSvg } from "@/lib/qr";
import { createServerClient } from "@/lib/supabase/server";
import { ProgramCard } from "@/app/dashboard/program-card";
import { NewProgramTile } from "@/app/dashboard/new-program-tile";
import { ShopQrBlock } from "@/app/dashboard/shop-qr-block";
import { QkitEarnSettings } from "@/app/dashboard/qkit-earn-settings";

export default async function DashboardPage() {
  const { user } = await requireVendor();

  const programs = await listPrograms();
  // True first run — no programs of any kind yet. A vendor who has
  // programs but paused all of them is NOT redirected (see the empty-state
  // branch below): redirecting them away from their own dashboard would be
  // a surprising dead end, not a "go set up" nudge.
  if (programs.length === 0) redirect("/setup");

  const activePrograms = programs.filter((prog) => prog.active);

  const [pro, supabase] = await Promise.all([isPro(), createServerClient()]);
  const { data: qkitEarnConfig } = await supabase
    .from("qkit_earn_config")
    .select("program_id, enabled")
    .eq("vendor_id", user.id)
    .maybeSingle();

  // One program's stats failing shouldn't take down the whole grid — each
  // card falls back to a "—" stat line (see ProgramCard).
  const statsSettled = await Promise.allSettled(
    activePrograms.map((prog) => getProgramStats(prog.id)),
  );
  const statsByProgramId: Record<string, ProgramStats | null> = {};
  activePrograms.forEach((prog, i) => {
    const settled = statsSettled[i];
    statsByProgramId[prog.id] =
      settled.status === "fulfilled" ? settled.value : null;
  });

  // The QR must encode an absolute URL — a host-less path is unscannable. Fall
  // back to the request host when NEXT_PUBLIC_BASE_URL is unset.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?v=${user.id}`;
  const cardQr = await qrSvg(cardLink);

  const canCreate = canCreateProgram(
    getEntitlement(pro),
    activePrograms.length,
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-5 py-10">
      <ShopQrBlock
        qrSvgMarkup={cardQr}
        link={cardLink}
        programNames={activePrograms.map((prog) => prog.name)}
      />

      {activePrograms.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          None of your programs are active right now.{" "}
          <a href="/setup" className="font-medium text-primary hover:underline">
            Manage them in Setup
          </a>{" "}
          to reactivate one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {activePrograms.map((prog) => (
            <ProgramCard
              key={prog.id}
              program={prog}
              stats={statsByProgramId[prog.id]}
            />
          ))}
          <NewProgramTile canCreate={canCreate} />
        </div>
      )}

      <details className="group rounded-2xl border bg-card shadow-sm">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
          qkit integration
        </summary>
        <div className="px-6 pb-6">
          <QkitEarnSettings
            programs={programs
              .filter((prog) => prog.type === "stamp")
              .map((prog) => ({
                id: prog.id,
                name: prog.name,
              }))}
            current={
              qkitEarnConfig
                ? {
                    programId: qkitEarnConfig.program_id,
                    enabled: qkitEarnConfig.enabled,
                  }
                : null
            }
            isPro={pro}
          />
        </div>
      </details>
    </main>
  );
}
```

Note: when `activePrograms.length === 0` (but `canCreate` may still gate a _reactivation_, not a new create), the `NewProgramTile` is intentionally not shown in the empty-state branch — reactivating an existing paused program happens in `/setup`, not by creating a new one; the empty-state message links there directly.

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: no TS errors. `ProgramStats` must be exported from `@/lib/stats` — confirm the `export type ProgramStats` line already present in `src/lib/stats.ts:7` covers this (it does; no change needed there).

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`, sign in as a vendor with 2+ active programs of different types (reuse the seeded Pro-vendor test data from the qkit-loopkit auto-award work if available).

Check:

- `/dashboard` shows the shop QR block at top (visible, not collapsed), one card per active program in a grid.
- Each card shows correct type badge/description for stamp AND at least one non-stamp type (plant/lucky/wheel/scratch/streak) — confirms the Task 2 multi-type fix.
- Serving a customer from a card works exactly as before (stamp/play/water/spin/scratch/check-in) — `ServeCustomer` is unchanged, only its wrapper moved.
- Edit icon on a card goes to `/setup?edit=<id>`.
- Customers/Activity/Stats footer links on a card go to the right `?p=` scoped page.
- Header only shows brand + account menu; Plan is reachable from the account dropdown.
- Deactivate a vendor's only program in `/setup`, reload `/dashboard` → empty-state message with a Setup link, no redirect loop.
- A free-tier vendor at the 1-program cap sees the locked upsell tile, not a `+ New program` link.

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: PASS — every test written in Tasks 1-4, plus no regressions in `serve-customer`/`actions`/other dashboard tests (none exist to break, per repo scan).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): render all active programs as a card grid instead of one switched-to program"
```

---

## Self-Review

**Spec coverage:**

- Header revamp (drop switcher/links, brand+account only) → Task 1.
- All active programs as cards → Task 5 (`activePrograms.map`).
- Compact serve action per card, visually primary → Task 3 (`ServeCustomer` unchanged, wrapped compactly; no separate huge section).
- QR baked into one shared compact block, not split into two sections → Task 4 (`ShopQrBlock`, always visible, one instruction line) + Task 5 (single top-of-page render, `qkit integration` is a genuinely separate concern left untouched, not part of the "two QR sections" problem the spec named).
- Edit on each card → Task 3.
- Customers/Activity/Stats scoped per-card, removed from header → Task 1 (removed) + Task 3 (added to footer).
- Active-only cards, inactive stay in `/setup` → Task 5 (`programs.filter((prog) => prog.active)`).
- `+ New program` tile at grid end, Pro-gated → Task 4 + Task 5.
- Per-program QR / `/setup` form revamp → explicitly out of scope, untouched.

**Placeholder scan:** no TBD/TODO, no "add error handling" hand-waving — every step has real code. The one open judgment call (empty-active-state doesn't redirect) is documented inline in Task 5, not left ambiguous.

**Type consistency:** `Program` (from `@/lib/program`), `ProgramStats` (from `@/lib/stats`) used identically across Tasks 3-5. `ProgramCard`'s props (`program`, `stats`) match exactly what Task 5 passes. `NewProgramTile`'s `canCreate` boolean matches `canCreateProgram(...)`'s return type. `DashboardNav`'s trimmed props (Task 1) match exactly what `layout.tsx` passes after the edit — no leftover `programs`/`activeByProgramId` references anywhere (confirmed via grep: only `dashboard-nav.tsx` and `layout.tsx` reference `DashboardNav`).
