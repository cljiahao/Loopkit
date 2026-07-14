# Nav Reachability + Responsive Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stats/Activity/Customers' merged (vendor-level) views
reachable-into-a-specific-program via a picker (closing the gap Feature B
left when it scoped the switcher to filtered views only), remove
`ProgramCard`'s now-redundant footer links now that reachability is
restored, and give `/setup`'s create/edit form a 2-column layout on
tablet+.

**Architecture:** Task 1 wires the existing `ProgramSwitcher` component
(built in Feature B, unmodified) into all three pages' merged branches.
Task 2 removes `ProgramCard`'s footer link block. Task 3 restructures
`SetupForm`'s field layout with `sm:grid-cols-2` wrappers around
logically-paired fields. All three tasks touch disjoint files.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4,
Vitest + Testing Library (jsdom).

## Global Constraints

- **Keep the codebase clean** (standing project rule): Task 2 must leave
  no trace of the removed footer-link block — no unused code, no stale
  test assertions for links that no longer exist.
- Every task's commit must leave `pnpm check` (prettier --check + eslint +
  tsc --noEmit) clean.
- `ProgramSwitcher` itself (`src/app/dashboard/program-switcher.tsx`) must
  NOT be modified by Task 1 — it already accepts any `currentId` string;
  the merged views pass `programs[0]?.id ?? ""` and rely on its existing
  `programs.length <= 1` early-return plus the browser's native `<select>`
  fallback behavior. No new placeholder-option feature.
- Task 3's field pairing must exactly match: Stamp (Card name + Stamps
  required), Plant (Card name + Visits to bloom), Lucky (Win chance +
  Guaranteed win by — already adjacent), Streak (Days per streak window +
  Streak length — already adjacent). Wheel/Scratch, the card type picker,
  segments editor, reward text, both checkboxes, and expiry days all stay
  full-width, unchanged.
- Tasks are independent (no file overlap) — any execution order is safe.
  This plan lists them in the spec's A→D order for narrative consistency
  (footer links conceptually only make sense to remove once the picker
  exists), not because of a hard code dependency.
- This repo has no page-level test precedent for full async Server
  Component pages (`/dashboard`, `/setup`, `/plan`, and the merged
  branches of `/dashboard/stats`, `/dashboard/activity`,
  `/dashboard/customers` all lack one) — confirmed during this and
  Feature B's planning. Task 1 adds no new test file for this reason,
  matching Feature B's own precedent for wiring `ProgramSwitcher` into
  Stats/Activity's filtered branches.

---

### Task 1: Program picker on merged Stats/Activity/Customers views

**Files:**

- Modify: `src/app/dashboard/stats/page.tsx`
- Modify: `src/app/dashboard/activity/page.tsx`
- Modify: `src/app/dashboard/customers/page.tsx`

**Interfaces:**

- Consumes: `ProgramSwitcher({ programs, currentId, action }: { programs:
{ id: string; name: string }[]; currentId: string; action: string })`
  (existing, unmodified, from `src/app/dashboard/program-switcher.tsx`).
- Produces: nothing later tasks depend on.

`ProgramSwitcher`'s existing implementation (for reference — do NOT
modify this file):

```tsx
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

`currentId={programs[0]?.id ?? ""}` is required (not
`currentId={programs[0].id}`) — `programs` can be an empty array (a
vendor with zero programs still reaches these pages; there is no
zero-programs redirect on Stats/Activity/Customers, unlike `/dashboard`).
`ProgramSwitcher` itself safely returns `null` for `programs.length <= 1`,
but that check happens _inside_ the component, after React has already
evaluated the prop expression — `programs[0].id` on an empty array throws
before `ProgramSwitcher` ever runs. The `?? ""` fallback is never actually
rendered (the component bails out before using it), it only exists to
avoid the crash while building the prop.

Stats' current merged branch (`src/app/dashboard/stats/page.tsx`, lines
52-70 — for reference, you are inserting one line, not rewriting this):

```tsx
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
```

Activity's current merged branch (`src/app/dashboard/activity/page.tsx`,
lines 70-90 — for reference):

```tsx
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
```

Customers' current merged branch (`src/app/dashboard/customers/page.tsx`,
lines 65-101 — for reference):

```tsx
export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { q, p } = await searchParams;

  if (!p) {
    const customers = await listVendorCustomers(q);
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
        <form className="flex items-center gap-3" action="/dashboard/customers">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by phone"
            className="h-11 rounded-xl"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-11 rounded-xl px-6"
          >
            Search
          </Button>
        </form>
        <VendorCustomerList customers={customers} />
      </main>
    );
  }
```

- [ ] **Step 1: Wire the picker into Stats' merged branch**

Add the import to `src/app/dashboard/stats/page.tsx`:

```ts
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
```

Change the merged branch's opening `<div>` block to:

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId={programs[0]?.id ?? ""}
            action="/dashboard/stats"
          />
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your shop is performing across every program.
          </p>
        </div>
```

- [ ] **Step 2: Wire the picker into Activity's merged branch**

Add the import to `src/app/dashboard/activity/page.tsx`:

```ts
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
```

Change the merged branch's opening `<div>` block to:

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId={programs[0]?.id ?? ""}
            action="/dashboard/activity"
          />
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>
        <VendorActivityList activity={activity} />
      </main>
    );
  }
```

- [ ] **Step 3: Wire the picker into Customers' merged branch**

Add the import to `src/app/dashboard/customers/page.tsx`:

```ts
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
```

Change the merged branch's opening `<div>` block to:

```tsx
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId={programs[0]?.id ?? ""}
            action="/dashboard/customers"
          />
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
```

(The search form and `<VendorCustomerList>` below it are unchanged.)

- [ ] **Step 4: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. No test file is added in this task — `ProgramSwitcher`
already has its own component test from Feature B, and this repo has no
page-level test precedent for these three pages' full async Server
Component bodies (only their extracted list sub-components,
`VendorActivityList`/`VendorCustomerList`, have tests — neither asserts
on page-level header content, so neither needs updating).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/stats/page.tsx src/app/dashboard/activity/page.tsx src/app/dashboard/customers/page.tsx
git commit -m "feat(dashboard): add program picker to merged Stats/Activity/Customers views

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Remove `ProgramCard`'s footer links

**Files:**

- Modify: `src/app/dashboard/program-card.tsx`
- Modify: `src/app/dashboard/program-card.dom.test.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing later tasks depend on.

Current `src/app/dashboard/program-card.tsx` in full (for reference — you
are removing one block, nothing else):

```tsx
"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROGRAM_TYPE_BADGE, describeProgram } from "./program-display";
import type { Program } from "@/lib/program";

// One card per active program. Field order is fixed across every card
// (header -> Open Counter -> footer links) so scanning a grid of
// several cards stays fast regardless of how many a vendor has. Serve/
// lookup lives on the dedicated Counter page now (see
// app/dashboard/counter/page.tsx), not embedded here.
export function ProgramCard({ program }: { program: Program }) {
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

- [ ] **Step 1: Update the failing test**

`program-card.dom.test.tsx`'s "scopes footer links to this program via
?p=" test asserts on links that will no longer exist. Replace the whole
file:

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

  it("links Open Counter to /dashboard/counter?p=<id>", () => {
    render(<ProgramCard program={program} />);
    expect(screen.getByRole("link", { name: /open counter/i })).toHaveAttribute(
      "href",
      "/dashboard/counter?p=p1",
    );
  });

  it("does not render Customers, Activity, or Stats links", () => {
    render(<ProgramCard program={program} />);
    expect(
      screen.queryByRole("link", { name: "Customers" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Activity" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Stats" }),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/program-card.dom.test.tsx`

Expected: FAIL — the new "does not render Customers, Activity, or Stats
links" test fails because those links still exist.

- [ ] **Step 3: Remove the footer-links block**

In `src/app/dashboard/program-card.tsx`, delete this entire block:

```tsx
<div className="flex gap-4 border-t pt-3 text-sm font-medium text-muted-foreground">
  <Link href={scoped("/dashboard/customers")} className="hover:text-foreground">
    Customers
  </Link>
  <Link href={scoped("/dashboard/activity")} className="hover:text-foreground">
    Activity
  </Link>
  <Link href={scoped("/dashboard/stats")} className="hover:text-foreground">
    Stats
  </Link>
</div>
```

Update the file-level comment (currently "header -> Open Counter ->
footer links") to reflect the new, shorter structure:

```tsx
// One card per active program. Field order is fixed across every card
// (header -> Open Counter) so scanning a grid of several cards stays
// fast regardless of how many a vendor has. Serve/lookup lives on the
// dedicated Counter page now (see app/dashboard/counter/page.tsx), not
// embedded here. Customers/Activity/Stats for this program are reached
// via each of those pages' own merged-view program picker instead of a
// per-card link.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/program-card.dom.test.tsx`

Expected: PASS, all 4 tests green.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. `scoped()` (the `?p=` URL-builder helper) is still used by
the `Open Counter` link, so it remains a live, non-dead function — no
unused-variable warning.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/program-card.tsx src/app/dashboard/program-card.dom.test.tsx
git commit -m "fix(dashboard): remove ProgramCard's now-redundant footer links

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `/setup` form — responsive 2-column layout

**Files:**

- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing later tasks depend on.

Current `src/app/setup/setup-form.tsx`'s relevant section — from "Card
name" through the type-conditional block (lines 219-451, for reference;
you are restructuring this, not the file's imports, state, or the rest of
the form):

```tsx
<div className="space-y-2">
  <Label htmlFor="name" className={labelClass}>
    Card name
  </Label>
  <Input
    key={`name-${prefillGeneration}`}
    id="name"
    name="name"
    type="text"
    required
    maxLength={60}
    placeholder={
      type === "lucky"
        ? "Lucky topping"
        : type === "plant"
          ? "Grow-a-kopi"
          : type === "wheel"
            ? "Spin to win"
            : type === "scratch"
              ? "Scratch & win"
              : type === "streak"
                ? "Weekly regular"
                : "Coffee card"
    }
    defaultValue={prefill?.name ?? program?.name ?? ""}
    className="h-11 rounded-xl"
  />
</div>;

{
  type === "stamp" ? (
    <div className="space-y-2">
      <Label htmlFor="stamps_required" className={labelClass}>
        Stamps required
      </Label>
      <Input
        key={`stamps_required-${prefillGeneration}`}
        id="stamps_required"
        name="stamps_required"
        type="number"
        required
        min={2}
        max={20}
        placeholder="10"
        defaultValue={
          prefill?.stamps_required ?? program?.stamps_required ?? 10
        }
        className="h-11 rounded-xl"
      />
    </div>
  ) : type === "plant" ? (
    <div className="space-y-2">
      <Label htmlFor="visits_to_bloom" className={labelClass}>
        Visits to bloom
      </Label>
      <Input
        key={`visits_to_bloom-${prefillGeneration}`}
        id="visits_to_bloom"
        name="visits_to_bloom"
        type="number"
        required
        min={4}
        max={20}
        placeholder="6"
        defaultValue={visitsToBloom}
        className="h-11 rounded-xl"
      />
    </div>
  ) : type === "streak" ? (
    <>
      <div className="space-y-2">
        <Label htmlFor="period_days" className={labelClass}>
          Days per streak window
        </Label>
        <Input
          key={`period_days-${prefillGeneration}`}
          id="period_days"
          name="period_days"
          type="number"
          required
          min={1}
          max={30}
          placeholder="7"
          defaultValue={prefill?.period_days ?? config.period_days ?? 7}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target_streak" className={labelClass}>
          Streak length to earn reward
        </Label>
        <Input
          key={`target_streak-${prefillGeneration}`}
          id="target_streak"
          name="target_streak"
          type="number"
          required
          min={2}
          max={20}
          placeholder="4"
          defaultValue={prefill?.target_streak ?? config.target_streak ?? 4}
          className="h-11 rounded-xl"
        />
      </div>
    </>
  ) : type === "wheel" || type === "scratch" ? (
    <>
      <div className="space-y-2">
        <Label className={labelClass}>
          {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
        </Label>
        <div className="space-y-2">
          {segments.map((segment, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="text"
                required
                maxLength={40}
                value={segment.label}
                onChange={(e) => updateSegment(i, { label: e.target.value })}
                placeholder="Label"
                className="h-11 flex-1 rounded-xl"
              />
              <Input
                type="number"
                required
                min={1}
                max={100}
                value={segment.weight}
                onChange={(e) =>
                  updateSegment(i, { weight: Number(e.target.value) })
                }
                className="h-11 w-20 rounded-xl"
              />
              <button
                type="button"
                onClick={() =>
                  updateSegment(i, { is_reward: !segment.is_reward })
                }
                className={cn(
                  "h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                  segment.is_reward
                    ? "border-gold bg-gold/10 text-gold-accent"
                    : "bg-card text-muted-foreground hover:bg-muted/50",
                )}
              >
                {segment.is_reward ? "Reward" : "No win"}
              </button>
              <button
                type="button"
                onClick={() => removeSegment(i)}
                disabled={segments.length <= 2}
                className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addSegment}
          disabled={segments.length >= 6}
          className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
        >
          Add segment
        </button>
        <input type="hidden" name="segments" value={JSON.stringify(segments)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pity_ceiling" className={labelClass}>
          Guaranteed win by (optional)
        </Label>
        <Input
          id="pity_ceiling"
          name="pity_ceiling"
          type="number"
          min={2}
          max={20}
          placeholder="No guarantee"
          defaultValue={config.pity_ceiling ?? ""}
          className="h-11 rounded-xl"
        />
      </div>
    </>
  ) : (
    <>
      <div className="space-y-2">
        <Label htmlFor="win_percent" className={labelClass}>
          Win chance (%)
        </Label>
        <Input
          key={`win_percent-${prefillGeneration}`}
          id="win_percent"
          name="win_percent"
          type="number"
          required
          min={2}
          max={100}
          placeholder="20"
          defaultValue={
            prefill?.win_percent ??
            (config.win_probability
              ? Math.round(config.win_probability * 100)
              : 20)
          }
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pity_ceiling" className={labelClass}>
          Guaranteed win by
        </Label>
        <Input
          key={`pity_ceiling-${prefillGeneration}`}
          id="pity_ceiling"
          name="pity_ceiling"
          type="number"
          required
          min={2}
          max={20}
          placeholder="8"
          defaultValue={prefill?.pity_ceiling ?? config.pity_ceiling ?? 8}
          className="h-11 rounded-xl"
        />
      </div>
    </>
  );
}
```

- [ ] **Step 1: Restructure Stamp and Plant to pair Card name with their
      one numeric field**

Replace the whole block above (from `<div className="space-y-2">` /
"Card name" through the end of the type-conditional `)}`) with:

```tsx
{
  type === "stamp" ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          key={`name-${prefillGeneration}`}
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="Coffee card"
          defaultValue={prefill?.name ?? program?.name ?? ""}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="stamps_required" className={labelClass}>
          Stamps required
        </Label>
        <Input
          key={`stamps_required-${prefillGeneration}`}
          id="stamps_required"
          name="stamps_required"
          type="number"
          required
          min={2}
          max={20}
          placeholder="10"
          defaultValue={
            prefill?.stamps_required ?? program?.stamps_required ?? 10
          }
          className="h-11 rounded-xl"
        />
      </div>
    </div>
  ) : type === "plant" ? (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          key={`name-${prefillGeneration}`}
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="Grow-a-kopi"
          defaultValue={prefill?.name ?? program?.name ?? ""}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="visits_to_bloom" className={labelClass}>
          Visits to bloom
        </Label>
        <Input
          key={`visits_to_bloom-${prefillGeneration}`}
          id="visits_to_bloom"
          name="visits_to_bloom"
          type="number"
          required
          min={4}
          max={20}
          placeholder="6"
          defaultValue={visitsToBloom}
          className="h-11 rounded-xl"
        />
      </div>
    </div>
  ) : (
    <>
      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          key={`name-${prefillGeneration}`}
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder={
            type === "lucky"
              ? "Lucky topping"
              : type === "wheel"
                ? "Spin to win"
                : type === "scratch"
                  ? "Scratch & win"
                  : "Weekly regular"
          }
          defaultValue={prefill?.name ?? program?.name ?? ""}
          className="h-11 rounded-xl"
        />
      </div>

      {type === "streak" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="period_days" className={labelClass}>
              Days per streak window
            </Label>
            <Input
              key={`period_days-${prefillGeneration}`}
              id="period_days"
              name="period_days"
              type="number"
              required
              min={1}
              max={30}
              placeholder="7"
              defaultValue={prefill?.period_days ?? config.period_days ?? 7}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target_streak" className={labelClass}>
              Streak length to earn reward
            </Label>
            <Input
              key={`target_streak-${prefillGeneration}`}
              id="target_streak"
              name="target_streak"
              type="number"
              required
              min={2}
              max={20}
              placeholder="4"
              defaultValue={prefill?.target_streak ?? config.target_streak ?? 4}
              className="h-11 rounded-xl"
            />
          </div>
        </div>
      ) : type === "wheel" || type === "scratch" ? (
        <>
          <div className="space-y-2">
            <Label className={labelClass}>
              {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
            </Label>
            <div className="space-y-2">
              {segments.map((segment, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="text"
                    required
                    maxLength={40}
                    value={segment.label}
                    onChange={(e) =>
                      updateSegment(i, { label: e.target.value })
                    }
                    placeholder="Label"
                    className="h-11 flex-1 rounded-xl"
                  />
                  <Input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={segment.weight}
                    onChange={(e) =>
                      updateSegment(i, {
                        weight: Number(e.target.value),
                      })
                    }
                    className="h-11 w-20 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateSegment(i, { is_reward: !segment.is_reward })
                    }
                    className={cn(
                      "h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                      segment.is_reward
                        ? "border-gold bg-gold/10 text-gold-accent"
                        : "bg-card text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {segment.is_reward ? "Reward" : "No win"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSegment(i)}
                    disabled={segments.length <= 2}
                    className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSegment}
              disabled={segments.length >= 6}
              className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
            >
              Add segment
            </button>
            <input
              type="hidden"
              name="segments"
              value={JSON.stringify(segments)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by (optional)
            </Label>
            <Input
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              min={2}
              max={20}
              placeholder="No guarantee"
              defaultValue={config.pity_ceiling ?? ""}
              className="h-11 rounded-xl"
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="win_percent" className={labelClass}>
              Win chance (%)
            </Label>
            <Input
              key={`win_percent-${prefillGeneration}`}
              id="win_percent"
              name="win_percent"
              type="number"
              required
              min={2}
              max={100}
              placeholder="20"
              defaultValue={
                prefill?.win_percent ??
                (config.win_probability
                  ? Math.round(config.win_probability * 100)
                  : 20)
              }
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by
            </Label>
            <Input
              key={`pity_ceiling-${prefillGeneration}`}
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              required
              min={2}
              max={20}
              placeholder="8"
              defaultValue={prefill?.pity_ceiling ?? config.pity_ceiling ?? 8}
              className="h-11 rounded-xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
```

Note what changed structurally: "Card name" is now duplicated across
three branches (Stamp, Plant, and the shared Lucky/Streak/Wheel/Scratch
fragment) instead of appearing once above the type-conditional block —
each branch needs its own copy since Stamp/Plant pair it inside a
2-column grid while Lucky/Streak/Wheel/Scratch keep it as a standalone
full-width field above their own content. The `placeholder` logic for
Card name is split accordingly: Stamp and Plant hardcode their own single
placeholder ("Coffee card" / "Grow-a-kopi"), and the shared branch's
ternary drops the `stamp`/`plant` cases since those are now dead code in
that branch (type can never be `stamp` or `plant` there — the type is
already `"lucky" | "wheel" | "scratch" | "streak"` at that point since
those two were already peeled off into their own branches above).

- [ ] **Step 2: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. `pnpm check`'s `tsc --noEmit` pass confirms the narrowed
placeholder ternary still type-checks against `ProgramType` correctly (no
missing case, since `type` is statically narrowed by the enclosing
`if`/`else if` chain — TypeScript's control-flow narrowing applies the
same way inside the shared fragment as it did in the original single
ternary, just with `"stamp"` and `"plant"` already excluded by the outer
branches).

- [ ] **Step 3: Manual smoke test**

Start the dev server, visit `/setup` (or `/setup?edit=<id>` for a Stamp
or Plant program), and resize the browser window across the `sm`
breakpoint (640px). Confirm: below 640px, Card name and its paired field
stack vertically (one per row); at 640px and above, they sit side by
side. Confirm the same for Lucky's Win chance/Guaranteed win by pair and
Streak's Days per streak window/Streak length pair. Confirm Wheel/Scratch,
the card type picker, reward text, both checkboxes, and expiry days all
remain full-width at every width.

- [ ] **Step 4: Commit**

```bash
git add src/app/setup/setup-form.tsx
git commit -m "fix(setup): pair related fields into a 2-column layout on tablet+

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Section A (picker on merged views) → Task 1. ✅
- Section B (`ProgramCard` footer removal) → Task 2. ✅
- Section C (Customers "filter by card") → satisfied entirely by Task 1's
  Customers wiring, no separate task needed, matching the spec's own "no
  new code beyond Section A" statement. ✅
- Section D (2-column `/setup` layout) → Task 3. ✅
- Section E (testing) → Task 1 explicitly notes no new test (matching
  established repo precedent), Task 2 extends `ProgramCard`'s test suite,
  Task 3 has no dedicated test (CSS breakpoint behavior isn't
  jsdom-testable, per the spec) but gets an explicit manual smoke-test
  step. ✅
- Out-of-scope items (data-shape changes, in-place merged-view filtering,
  further nav restructuring) — no task touches any of these. ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate" phrasing. Every
step has exact, complete code and exact commands with expected output.

**3. Type consistency:** `ProgramSwitcher`'s prop types
(`programs: { id: string; name: string }[]`, `currentId: string`, `action:
string`) are used identically across all three Task 1 call sites — each
page's `programs` (from `listPrograms()`, returning `Program[]`) satisfies
the narrower structural type the same way Feature B's filtered-view usage
already established. `SetupForm`'s restructuring in Task 3 introduces no
new props, state, or types — purely a JSX layout change within the
existing component, so no signature drift to check against other tasks.

**Build-integrity check:** All three tasks are fully independent — no
task imports, types, or files another task produces. Any execution order
leaves `pnpm check` green at every commit boundary. Task 1 and Task 2
have no code dependency on each other despite the spec's narrative
ordering (footer links "conceptually" only make sense to remove after the
picker exists) — this is a UX-sequencing preference, not a build
requirement, and is called out explicitly in Global Constraints so an
implementer or reviewer doesn't mistake it for one.
