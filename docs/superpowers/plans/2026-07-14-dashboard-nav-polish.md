# Dashboard Nav Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship six small, independent UI/navigation fixes: a program
switcher on Stats and Activity's filtered views, removal of `ProgramCard`'s
now-redundant stat line, a left-aligned `DashboardNav` with an explicit
Dashboard link, a back button on `/setup`, and a fixed-width `/plan` table
with a labeled stats sentence.

**Architecture:** Each task touches a disjoint set of files with no
cross-task dependencies — any execution order is safe. A new shared
`ProgramSwitcher` component backs both Stats and Activity's pickers (kept
separate from Customers' existing inline picker, which stays as-is — no
refactor of working code). Every other task is an in-place edit to an
existing file.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4,
Vitest + Testing Library (jsdom).

## Global Constraints

- **Keep the codebase clean** (standing project rule): Task 2 must fully
  remove the now-dead `getProgramStats`-per-program fetch in
  `dashboard/page.tsx`, not just stop passing it to `ProgramCard` — no
  unused imports, no unused variables.
- Every task's commit must leave `pnpm check` (prettier --check + eslint +
  tsc --noEmit) clean.
- No schema, RPC, or migration changes anywhere in this plan — every task
  is application-layer UI only.
- Tasks are independent (no task's files overlap with another's), so they
  may be implemented in any order — this plan lists them in the spec's
  A→E order for consistency, not because of a dependency.

---

### Task 1: Program switcher on Stats + Activity

**Files:**

- Create: `src/app/dashboard/program-switcher.tsx`
- Create: `src/app/dashboard/program-switcher.dom.test.tsx`
- Modify: `src/app/dashboard/stats/page.tsx`
- Modify: `src/app/dashboard/activity/page.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `ProgramSwitcher({ programs, currentId, action }: { programs:
Pick<Program, "id" | "name">[]; currentId: string; action: string })` —
  a small client-agnostic (plain function, no `"use client"` needed — it's
  a native GET form) component. No later task imports it.

Customers' existing inline picker (`src/app/dashboard/customers/page.tsx`,
lines 113–139 — for reference, NOT being modified by this task):

```tsx
{
  programs.length > 1 ? (
    <form
      action="/dashboard/customers"
      method="get"
      className="mb-4 flex items-center gap-2"
    >
      <input type="hidden" name="q" value={q ?? ""} />
      <select
        name="p"
        defaultValue={program.id}
        aria-label="Switch program"
        className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm"
      >
        {programs.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted/50"
      >
        Switch
      </button>
    </form>
  ) : null;
}
```

Stats' current filtered branch (`src/app/dashboard/stats/page.tsx`, the
non-`!p` return block starting at line 144 — for reference):

```tsx
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
```

Activity's current filtered branch (`src/app/dashboard/activity/page.tsx`,
the non-`!p` return block starting at line 120 — for reference):

```tsx
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>
```

- [ ] **Step 1: Write the failing test**

Create `src/app/dashboard/program-switcher.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgramSwitcher } from "./program-switcher";

const programs = [
  { id: "p1", name: "Coffee Stamps" },
  { id: "p2", name: "Bubble Tea Club" },
];

describe("ProgramSwitcher", () => {
  it("renders a select with every program and the current one chosen", () => {
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p2"
        action="/dashboard/stats"
      />,
    );
    const select = screen.getByLabelText("Switch program") as HTMLSelectElement;
    expect(select.value).toBe("p2");
    expect(
      screen.getByRole("option", { name: "Coffee Stamps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Bubble Tea Club" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch" })).toBeInTheDocument();
  });

  it("submits as a GET form to the given action", () => {
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p1"
        action="/dashboard/activity"
      />,
    );
    const form = screen
      .getByRole("button", { name: "Switch" })
      .closest("form") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/dashboard/activity");
    expect(form.method).toBe("get");
  });

  it("renders nothing when there is only one program", () => {
    render(
      <ProgramSwitcher
        programs={[programs[0]]}
        currentId="p1"
        action="/dashboard/stats"
      />,
    );
    expect(screen.queryByLabelText("Switch program")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/program-switcher.dom.test.tsx`

Expected: FAIL — `ProgramSwitcher` does not exist yet.

- [ ] **Step 3: Implement `ProgramSwitcher`**

Create `src/app/dashboard/program-switcher.tsx`:

```tsx
// Same-page program switcher for Stats/Activity's filtered (?p=) view —
// mirrors Customers' existing inline picker (customers/page.tsx), pulled
// into a shared component since two pages need it identically. A plain GET
// form; no client JS needed.
export function ProgramSwitcher({
  programs,
  currentId,
  action,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  action: string;
}) {
  if (programs.length <= 1) return null;

  return (
    <form action={action} method="get" className="mb-4 flex items-center gap-2">
      <select
        name="p"
        defaultValue={currentId}
        aria-label="Switch program"
        className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm"
      >
        {programs.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted/50"
      >
        Switch
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/program-switcher.dom.test.tsx`

Expected: PASS, all 3 tests green.

- [ ] **Step 5: Wire it into Stats' filtered branch**

In `src/app/dashboard/stats/page.tsx`, add the import:

```ts
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
```

Replace the filtered branch's header block with:

```tsx
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          action="/dashboard/stats"
        />
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>
```

- [ ] **Step 6: Wire it into Activity's filtered branch**

In `src/app/dashboard/activity/page.tsx`, add the import:

```ts
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
```

Replace the filtered branch's header block with:

```tsx
  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          action="/dashboard/activity"
        />
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/program-switcher.tsx src/app/dashboard/program-switcher.dom.test.tsx src/app/dashboard/stats/page.tsx src/app/dashboard/activity/page.tsx
git commit -m "feat(dashboard): add program switcher to Stats and Activity's filtered view

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Remove `ProgramCard`'s stat line

**Files:**

- Modify: `src/app/dashboard/program-card.tsx`
- Modify: `src/app/dashboard/program-card.dom.test.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `ProgramCard`'s props narrow from `{ program: Program; stats:
ProgramStats | null }` to `{ program: Program }`. Its one caller,
  `dashboard/page.tsx`, is updated in this same task (both files in one
  commit — never leave a caller passing a prop the component no longer
  accepts).

Current `src/app/dashboard/program-card.tsx` in full (for reference — you
are editing this file, not replacing it wholesale):

```tsx
"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";
import type { Program } from "@/lib/program";
import type { ProgramStats } from "@/lib/stats";

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

      <Button asChild className="h-11 w-full rounded-xl font-semibold">
        <Link href={scoped("/dashboard/counter")}>Open Counter</Link>
      </Button>

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

- [ ] **Step 1: Update the failing/changing tests**

`program-card.dom.test.tsx` currently imports `ProgramStats` and passes a
`stats` prop to every `<ProgramCard>` render. Replace the whole file:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";
import { ProgramCard } from "./program-card";

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

describe("ProgramCard", () => {
  it("renders the program name, type badge, and description", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Stamp")).toBeInTheDocument();
    expect(screen.getByText(/buy 8, get 1 a free coffee/i)).toBeInTheDocument();
  });

  it("links Edit to /setup?edit=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.getByRole("link", { name: /edit coffee stamps/i }),
    ).toHaveAttribute("href", "/setup?edit=p1");
  });

  it("scopes footer links to this program via ?p=", () => {
    render(<ProgramCard program={program} />);
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

  it("links Open Counter to /dashboard/counter?p=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByRole("link", { name: /open counter/i })).toHaveAttribute(
      "href",
      "/dashboard/counter?p=p1",
    );
  });
});
```

This drops the two stat-specific tests ("shows the active-count stat" and
"falls back to a dash") entirely — the behavior they tested no longer
exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/program-card.dom.test.tsx`

Expected: FAIL — `ProgramCard` still requires a `stats` prop (TypeScript
error) and still renders the stat line.

- [ ] **Step 3: Implement the removal in `ProgramCard`**

In `src/app/dashboard/program-card.tsx`:

1. Remove the `import type { ProgramStats } from "@/lib/stats";` line.
2. Change the props type from `{ program: Program; stats: ProgramStats |
null }` to `{ program: Program }`, and the destructure from
   `{ program, stats }` to `{ program }`.
3. Remove this block entirely:

```tsx
<p className="text-xs font-medium text-muted-foreground">
  {stats ? `${stats.active} active (30d)` : "—"}
</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/program-card.dom.test.tsx`

Expected: PASS, all 4 remaining tests green.

- [ ] **Step 5: Remove the now-dead stats fetch from `dashboard/page.tsx`**

Current `src/app/dashboard/page.tsx` in full (for reference — you are
editing this file, not replacing it wholesale):

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  listPrograms,
  isPro,
  canCreateProgram,
  getEntitlement,
  applyDueCutovers,
} from "@/lib/program";
import { getProgramStats, type ProgramStats } from "@/lib/stats";
import { requireVendor } from "@/lib/auth";
import { qrSvg } from "@/lib/qr";
import { createServerClient } from "@/lib/supabase/server";
import { ProgramCard } from "@/app/dashboard/program-card";
import { NewProgramTile } from "@/app/dashboard/new-program-tile";
import { ShopQrBlock } from "@/app/dashboard/shop-qr-block";
import { ScanAndRoute } from "@/app/dashboard/scan-and-route";
import { QkitEarnSettings } from "@/app/dashboard/qkit-earn-settings";
import { shouldShowQr } from "@/app/dashboard/dashboard-view";

export default async function DashboardPage() {
  const { user } = await requireVendor();
  await applyDueCutovers();

  const programs = await listPrograms();
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
    <main className="mx-auto max-w-7xl space-y-6 p-5 py-10">
      {!shouldShowQr(activePrograms.length) ? (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          None of your programs are active right now.{" "}
          <a href="/setup" className="font-medium text-primary hover:underline">
            Manage them in Setup
          </a>{" "}
          to reactivate one.
        </div>
      ) : (
        <>
          <ShopQrBlock
            qrSvgMarkup={cardQr}
            link={cardLink}
            programNames={activePrograms.map((prog) => prog.name)}
          />

          <ScanAndRoute />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activePrograms.map((prog) => (
              <ProgramCard
                key={prog.id}
                program={prog}
                stats={statsByProgramId[prog.id]}
              />
            ))}
            <NewProgramTile canCreate={canCreate} />
          </div>
        </>
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

Make these changes:

1. Remove `import { getProgramStats, type ProgramStats } from
"@/lib/stats";` entirely.
2. Remove this whole block:

```tsx
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
```

3. Change the `<ProgramCard>` usage from:

```tsx
{
  activePrograms.map((prog) => (
    <ProgramCard
      key={prog.id}
      program={prog}
      stats={statsByProgramId[prog.id]}
    />
  ));
}
```

to:

```tsx
{
  activePrograms.map((prog) => <ProgramCard key={prog.id} program={prog} />);
}
```

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS — `pnpm check`'s eslint pass confirms no unused imports or
variables remain in either file (an unused `getProgramStats`/`ProgramStats`
import or an unused `statsByProgramId` would both be flagged).

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/program-card.tsx src/app/dashboard/program-card.dom.test.tsx src/app/dashboard/page.tsx
git commit -m "fix(dashboard): remove redundant per-card stat line

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `DashboardNav` left-align + Dashboard link

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx`
- Modify: `src/app/dashboard/dashboard-nav.dom.test.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing later tasks depend on.

Current `src/app/dashboard/dashboard-nav.tsx`'s `LINKS` and the render's
top-level structure (for reference — full file already read; you are
editing lines 21-25 and 96-121, nothing else):

```ts
const LINKS = [
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];
```

```tsx
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
```

(Everything from `<div className="flex items-center gap-1">` — the burger

- account menu — through the end of the function is unchanged by this
  task.)

* [ ] **Step 1: Write the failing test**

Add this test to `src/app/dashboard/dashboard-nav.dom.test.tsx`, inside
the existing `describe("DashboardNav", ...)` block, right after the
existing "renders Customers, Activity, and Stats as inline nav links"
test:

```tsx
it("renders Dashboard as the first inline nav link", () => {
  render(<DashboardNav {...baseProps} />);
  const links = screen.getAllByRole("link");
  const navLabels = ["Dashboard", "Customers", "Activity", "Stats"];
  const navLinks = links.filter((l) => navLabels.includes(l.textContent ?? ""));
  expect(navLinks.map((l) => l.textContent)).toEqual(navLabels);
  expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
    "href",
    "/dashboard",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/dashboard-nav.dom.test.tsx`

Expected: FAIL — no "Dashboard" link exists in `LINKS` yet.

- [ ] **Step 3: Add the Dashboard link and restructure the layout**

In `src/app/dashboard/dashboard-nav.tsx`, change `LINKS` to:

```ts
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];
```

Then restructure the render's top section — wrap the brand `<Link>` and
the inline `<nav>` in one left-side `<div>`, mirroring qkit's fix
(`qkit/src/app/dashboard/dashboard-nav.tsx:122-165`) so exactly 2
top-level children remain under `justify-between`:

```tsx
  return (
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
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
      </div>

      <div className="flex items-center gap-1">
```

Note: `isActive(path, "/dashboard")` uses the existing `isActive` helper
(`path === href || path.startsWith(\`${href}/\`)`) — since every other
`LINKS`entry is a sub-path of`/dashboard`, visiting e.g.
`/dashboard/stats`would make`isActive(path, "/dashboard")`also return`true`(because`path.startsWith("/dashboard/")`), incorrectly
highlighting both "Dashboard" and "Stats" at once. This is a real
pre-existing quirk of the shared `isActive` helper, not something to fix
generically here — scope this task's fix narrowly: add a special case so
"Dashboard" is only active on an exact match, not a sub-path:

```tsx
<nav className="hidden items-center gap-1 sm:flex">
  {LINKS.map((link) => {
    const active =
      link.href === "/dashboard"
        ? path === "/dashboard"
        : isActive(path, link.href);
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
```

Apply this exact same `active` computation to the mobile menu's `LINKS.map`
loop later in the same file (the `{mobileOpen && (...)}` block) — it has
an identical `const active = isActive(path, link.href);` line that needs
the same special case.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/dashboard-nav.dom.test.tsx`

Expected: PASS, including the new test and every pre-existing test in the
file (the "toggles the mobile link panel" and account-menu tests don't
assert on `LINKS` content, so they're unaffected by the new entry).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. `test/app/dashboard-nav.test.tsx` (the separate legacy
test file) only tests avatar-initials and account-dropdown-label
behavior — it makes no assertions about `LINKS` content or count, so it
requires no changes.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx
git commit -m "fix(dashboard): left-align nav next to logo, add Dashboard link

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `/setup` back button

**Files:**

- Modify: `src/app/setup/page.tsx`

**Interfaces:**

- Consumes: `BackButton` from `src/components/back-button.tsx` (existing,
  unmodified — `BackButton({ href, label }: { href: string; label:
string })`).
- Produces: nothing later tasks depend on.

Current `src/app/setup/page.tsx`'s return statement's opening (for
reference — full file already read; you are inserting one line, changing
nothing else):

```tsx
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5">
      <div className="w-full">
        <div className="mb-8 text-center">
```

- [ ] **Step 1: Add the import**

At the top of `src/app/setup/page.tsx`, add:

```ts
import { BackButton } from "@/components/back-button";
```

- [ ] **Step 2: Add the back button**

Change the return statement's opening to:

```tsx
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5">
      <div className="w-full">
        <div className="mb-4">
          <BackButton href="/dashboard" label="Back to dashboard" />
        </div>
        <div className="mb-8 text-center">
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. This repo has no dedicated `/setup` page-level test file
today (confirmed during planning — a full async Server Component page
isn't practically testable through RTL without extensive Supabase mocking,
matching the precedent already established for `/dashboard`'s own
page.tsx, which also has no page-level test). No new test file is added
in this task.

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/page.tsx
git commit -m "fix(setup): add a back-to-dashboard button

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `/plan` table alignment + stats-sentence header

**Files:**

- Modify: `src/app/dashboard/plan/page.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing later tasks depend on.

Current `src/app/dashboard/plan/page.tsx` in full (for reference — you are
editing two disjoint blocks, lines 57-67 and 90-110, nothing else):

```tsx
import { Check, Sparkles } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { isPro, listPrograms, currentProgram } from "@/lib/program";
import { getProgramStats } from "@/lib/stats";
import { UpgradeCta } from "@/app/dashboard/plan/upgrade-cta";
import { Badge } from "@/components/ui/badge";

function Cell({ on }: { on: boolean }) {
  return (
    <span className="flex justify-center">
      {on ? (
        <Check className="size-4 text-primary" />
      ) : (
        <span className="text-muted-foreground/40">—</span>
      )}
    </span>
  );
}

const FEATURES = [
  { label: "Loyalty programs", free: "1", pro: "Unlimited" },
  { label: "Loyalty card templates", free: true, pro: true },
  { label: "Change card type", free: true, pro: true },
  { label: "Stats dashboard", free: true, pro: true },
] as const;

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  await requireVendor();
  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);
  const { p } = await searchParams;
  const program = currentProgram(programs, p);
  const stats = program ? await getProgramStats(program.id) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-7 p-5 py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Billing
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Plan
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5">
          {pro && <Sparkles className="size-3.5 text-primary" />}
          <Badge variant={pro ? "gold" : "secondary"}>
            {pro ? "Pro" : "Free"}
          </Badge>
        </span>
      </div>

      {stats && stats.enrolled > 0 && program && (
        <p className="rounded-xl border bg-card px-5 py-4 text-sm">
          <strong className="font-semibold">
            {Math.round(stats.repeatVisitRate * 100)}%
          </strong>{" "}
          of your customers have come back for a second visit, and you&apos;ve
          handed out{" "}
          <strong className="font-semibold">{stats.rewardsTotal}</strong> reward
          {stats.rewardsTotal === 1 ? "" : "s"} so far with {program.name}.
        </p>
      )}

      {pro ? (
        <p className="rounded-xl border bg-card px-5 py-4 text-sm text-muted-foreground">
          You&apos;re on Pro — unlimited loyalty programs are unlocked. Thanks
          for supporting loopkit.
        </p>
      ) : (
        <div className="rounded-2xl border border-primary/40 bg-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="font-display text-xl font-semibold">Pro</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Run more than one loyalty program at a time. Message us and
            we&apos;ll set you up — no card needed yet.
          </p>
          <div className="mt-4">
            <UpgradeCta />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Feature</span>
          <span className="text-center">Free</span>
          <span className="text-center">Pro</span>
        </div>
        {FEATURES.map((f) => (
          <div
            key={f.label}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 border-t px-5 py-3 text-sm"
          >
            <span>{f.label}</span>
            <span className="text-center text-muted-foreground">
              {typeof f.free === "string" ? f.free : <Cell on={f.free} />}
            </span>
            <span className="text-center">
              {typeof f.pro === "string" ? f.pro : <Cell on={f.pro} />}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
```

qkit's fixed table (`qkit/src/app/dashboard/plan/page.tsx:180-199`, for
reference — the pattern being mirrored, not copied verbatim since loopkit
has 2 data columns vs. qkit's 3):

```tsx
{
  /* Three-rung comparison. Header and every row use the same fixed
          column widths (not "auto") so the Free/Pass/Pro ticks line up under
          their headers regardless of each row being its own grid instance. */
}
<div className="overflow-hidden rounded-2xl border border-border">
  <div className="grid grid-cols-[1fr_2.75rem_2.75rem_2.75rem] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    <span>Feature</span>
    <span className="text-center">Free</span>
    <span className="text-center">Pass</span>
    <span className="text-center">Pro</span>
  </div>
  {FEATURES.map((f) => (
    <div
      key={f.label}
      className="grid grid-cols-[1fr_2.75rem_2.75rem_2.75rem] items-center gap-x-5 border-t border-border px-5 py-3 text-sm"
    >
      <span>{f.label}</span>
      <Cell on={f.free} />
      <Cell on={f.pass} />
      <Cell on={f.pro} />
    </div>
  ))}
</div>;
```

- [ ] **Step 1: Fix the table's column widths**

In `src/app/dashboard/plan/page.tsx`, add the explanatory comment (matching
qkit's own documentation of this fix) and change both `grid-cols-[1fr_auto_auto]`
occurrences to `grid-cols-[1fr_2.75rem_2.75rem]`:

```tsx
{
  /* Header and every row use the same fixed column widths (not "auto")
          so the Free/Pro ticks line up under their headers regardless of
          each row being its own grid instance. */
}
<div className="overflow-hidden rounded-2xl border">
  <div className="grid grid-cols-[1fr_2.75rem_2.75rem] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    <span>Feature</span>
    <span className="text-center">Free</span>
    <span className="text-center">Pro</span>
  </div>
  {FEATURES.map((f) => (
    <div
      key={f.label}
      className="grid grid-cols-[1fr_2.75rem_2.75rem] items-center gap-x-5 border-t px-5 py-3 text-sm"
    >
      <span>{f.label}</span>
      <span className="text-center text-muted-foreground">
        {typeof f.free === "string" ? f.free : <Cell on={f.free} />}
      </span>
      <span className="text-center">
        {typeof f.pro === "string" ? f.pro : <Cell on={f.pro} />}
      </span>
    </div>
  ))}
</div>;
```

- [ ] **Step 2: Add the stats-sentence header**

Change the stats-sentence block from:

```tsx
{
  stats && stats.enrolled > 0 && program && (
    <p className="rounded-xl border bg-card px-5 py-4 text-sm">
      <strong className="font-semibold">
        {Math.round(stats.repeatVisitRate * 100)}%
      </strong>{" "}
      of your customers have come back for a second visit, and you&apos;ve
      handed out <strong className="font-semibold">{stats.rewardsTotal}</strong>{" "}
      reward
      {stats.rewardsTotal === 1 ? "" : "s"} so far with {program.name}.
    </p>
  );
}
```

to:

```tsx
{
  stats && stats.enrolled > 0 && program && (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        How your program is doing
      </p>
      <p className="mt-1.5 text-sm">
        <strong className="font-semibold">
          {Math.round(stats.repeatVisitRate * 100)}%
        </strong>{" "}
        of your customers have come back for a second visit, and you&apos;ve
        handed out{" "}
        <strong className="font-semibold">{stats.rewardsTotal}</strong> reward
        {stats.rewardsTotal === 1 ? "" : "s"} so far with {program.name}.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. This repo has no existing test file for `/plan` (confirmed
during planning) — none is added in this task, matching the same
page-level-testing precedent noted in Task 4.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/plan/page.tsx
git commit -m "fix(plan): align comparison table columns, label the stats sentence

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Section A (Stats + Activity picker) → Task 1. ✅
- Section B (ProgramCard stat-line removal) → Task 2. ✅
- Section C (DashboardNav left-align + Dashboard link) → Task 3. ✅
- Section D (`/setup` back button) → Task 4. ✅
- Section E (`/plan` table + header) → Task 5. ✅
- Section F (testing) → covered per-task: new `ProgramSwitcher` component
  test (Task 1), `ProgramCard` test updated (Task 2), `DashboardNav` test
  extended (Task 3); `/setup` and `/plan` have no page-level test
  precedent in this repo, explicitly noted rather than silently skipped
  (Tasks 4 and 5). ✅
- Out-of-scope items (merged-view pickers, schema changes, `/plan`'s
  `FEATURES` content) — no task touches any of these. ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate" phrasing. Every step
has exact, complete code and exact commands with expected output.

**3. Type consistency:** `ProgramSwitcher`'s `programs` prop type
(`{ id: string; name: string }[]`) matches what both `stats/page.tsx` and
`activity/page.tsx` already have in scope — both pages call `listPrograms()`
which returns `Program[]`, and `Program` has both `id: string` and
`name: string` fields, so passing `programs` directly satisfies the
narrower prop type via structural typing (no explicit `.map()` needed at
either call site). `ProgramCard`'s prop narrowing (`{ program: Program }`,
dropping `stats`) is applied consistently in both the component (Task 2,
Step 3) and its one caller (Task 2, Step 5) within the same task/commit —
no intermediate state where one is updated and not the other.

**Build-integrity check:** Every task is self-contained — Task 2 updates
both `ProgramCard` and its one caller in the same commit (a prop-signature
narrowing and its consumer must never be split, same standing rule applied
throughout this session). No task imports anything a later task produces,
so `pnpm check` never goes red at any commit boundary regardless of
execution order.
