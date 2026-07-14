# Dashboard nav & program-switcher polish

Date: 2026-07-14

## Problem

A batch of six small UI/navigation issues surfaced while brainstorming the
tiered-program-switching feature (sent as asides, not part of that
feature). None touch schema or backend — all client-observable UI/routing
changes, cohesive enough to design and plan as one spec:

1. Stats and Activity have no way to switch programs on the page itself —
   only Customers has this today, via a `?p=` picker in its filtered view.
2. `ProgramCard`'s per-card "N active (30d)" stat line becomes redundant
   once switching programs on Stats is one click away — the user asked for
   it removed.
3. `DashboardNav` is missing an explicit "Dashboard" link and its inline
   nav visually centers instead of sitting next to the logo (qkit's nav
   doesn't have this problem — worth mirroring its layout).
4. `/setup` has no way back to `/dashboard` — a real problem on mobile,
   since `/setup` has no shared nav chrome at all.
5. `/plan`'s feature-comparison table misaligns its Free/Pro columns —
   the same class of bug qkit already fixed on its own equivalent page.
6. A stats sentence on `/plan` ("X% of your customers have come back...")
   has no header, so a vendor can't tell what it's about at a glance.

## Decisions (from brainstorming)

- The Stats/Activity program-switcher appears only in the filtered (`?p=`)
  view, matching Customers' existing scope exactly — not the merged
  vendor-level view. No new "drill into one program" affordance from the
  merged view; that stays a click through `/dashboard`.
- Removing `ProgramCard`'s stat line also removes its only data source —
  `dashboard/page.tsx`'s `getProgramStats`-per-program fetch — rather than
  leaving now-dead code behind.
- `DashboardNav` and `/plan`'s table both mirror qkit's already-fixed
  equivalents exactly (same cross-kit precedent as this session's
  `BackButton` component, ported from qkit for the Counter page).
- `/setup`'s back button reuses the existing `BackButton` component
  (`src/components/back-button.tsx`) — no new component needed.

## A. Stats + Activity program-switcher

Mirror `src/app/dashboard/customers/page.tsx`'s existing picker
(lines 113–139) into `stats/page.tsx`'s and `activity/page.tsx`'s filtered
branches, placed directly above each page's `<h1>`:

```tsx
{
  programs.length > 1 ? (
    <form
      action="/dashboard/stats"
      method="get"
      className="mb-4 flex items-center gap-2"
    >
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

(`action="/dashboard/activity"` for the Activity page's copy.) A plain GET
form — no client JS, matching Customers' existing implementation exactly.

## B. Remove `ProgramCard`'s stat line

Delete the stat `<p>` (`program-card.tsx:49-51`), the `stats` prop, and
the now-unused `ProgramStats` import. In `dashboard/page.tsx`, remove the
`statsSettled`/`statsByProgramId` block (lines 41-51) and the
`getProgramStats`/`ProgramStats` import — that fetch has no other
consumer once `ProgramCard` stops reading it. `ProgramCard` shrinks to
header → Open Counter → footer links.

## C. `DashboardNav` — left-align + Dashboard link

`dashboard-nav.tsx:96` currently has 3 top-level flex children under
`justify-between` (brand `<Link>`, `<nav>`, right-side `<div>`), which
visually centers the middle nav. Mirror qkit's fix: wrap brand + inline
`<nav>` in one left-side `<div className="flex items-center gap-1
sm:gap-3">`, leaving exactly 2 top-level children. Add a leading entry to
`LINKS`:

```ts
const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];
```

Applies to both the desktop inline nav and the mobile burger-menu list
(both already map over `LINKS`, so this is a single source-of-truth
change).

## D. `/setup` back button

Add `<BackButton href="/dashboard" label="Back to dashboard" />` at the
top of `/setup/page.tsx`'s content (inside `<div className="w-full">`,
before the existing centered header block). Same component already used
on the Counter page — no new code, just a new usage site.

## E. `/plan` table alignment + stats-sentence header

Both the header row and each `FEATURES` row (`plan/page.tsx:91,99`)
independently use `grid-cols-[1fr_auto_auto]` — since each row is its own
grid instance, `auto` can size differently per row. Mirror qkit's exact
fix: fixed widths on both, `grid-cols-[1fr_2.75rem_2.75rem]` (loopkit has
2 data columns — Free/Pro — vs. qkit's 3).

Add a small label above the stats-sentence paragraph (`plan/page.tsx:57`),
styled like the existing "Billing" label (`text-xs font-semibold uppercase
tracking-wider text-muted-foreground`):

```tsx
{
  stats && stats.enrolled > 0 && program && (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        How your program is doing
      </p>
      <p className="mt-1.5 text-sm">{/* existing sentence, unchanged */}</p>
    </div>
  );
}
```

## F. Testing

- Stats/Activity picker: extend each page's existing test coverage (or add
  co-located coverage if none exists at the page level today — check
  first) asserting the picker renders when `programs.length > 1` and is
  absent for a single-program vendor, matching Customers' precedent.
- `ProgramCard`: extend its existing `*.dom.test.tsx` to assert the stat
  line and `stats` prop are gone.
- `DashboardNav`: extend `dashboard-nav.dom.test.tsx` for the new
  "Dashboard" link and the restructured left-side grouping.
- `/setup`: extend or add page-level coverage for `BackButton`'s presence
  (this repo has no dedicated `/setup` page-level test file today per
  precedent from the tiered-program-switching plan — a co-located
  `*.dom.test.tsx` may not be practical for a full async Server Component
  page; follow whatever this repo's existing convention turns out to be
  once checked during planning).
- `/plan`: a targeted test confirming the grid classes are fixed-width,
  not `auto`, plus the new header label renders.

## Out of scope

- Any change to the merged (no-`?p=`) views on Stats/Activity/Customers.
- Any schema, RPC, or migration change — this entire spec is
  application-layer UI only.
- `/plan`'s `FEATURES` table _content_ (e.g. adding rows for the
  tiered-program-switching feature) — only its layout/alignment.
