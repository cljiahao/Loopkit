# Header nav restructure + vendor-level Activity/Stats

Date: 2026-07-14

## Problem

The dashboard card revamp (shipped earlier this session) moved Customers/
Activity/Stats links off the header and onto each `ProgramCard`'s footer,
each scoped to that one program. The vendor-level customer database feature
(shipped immediately after) gave `/dashboard/customers` a new unscoped
"every customer across every program" default view, reachable only from the
account dropdown menu — but Activity and Stats stayed single-program-only.

User feedback: put Customers/Activity/Stats back as plain header links, not
tied to any one card. For that to make sense (a header link can't be
ambiguous about which program it means), Activity and Stats need the same
treatment Customers already got — a vendor-level merged view by default.

This is Spec A of three (decomposed during brainstorming): A (this spec,
nav + Activity/Stats), B (new per-program Counter page + universal QR
scan), C (stamp redeem-carryover mechanics). B and C are separate specs,
built after this one.

## Decisions (from brainstorming)

- `DashboardNav` gets inline links back: Customers, Activity, Stats — each
  pointing at the unscoped route (no `?p=`), i.e. the new vendor-level
  default view. Mobile burger menu returns (removed in the card revamp)
  since 3 inline links don't fit small screens.
- The `Customers` item just added to the account dropdown is removed —
  superseded by the header link, no duplicate entry points. Account
  dropdown goes back to account-only: Plan, Profile, Sign out.
- Activity's vendor-level mode: merge cards+events across every one of the
  vendor's programs (via `listPrograms()`, matching Customers' precedent of
  using every program, not just active ones), each event tagged with its
  program name (shown as a badge — not implicit anymore once merged), top
  15, newest first. Same pure/impure split as `src/lib/customers.ts`.
- Stats' vendor-level mode: `src/lib/stats.ts`'s existing pure functions
  (`classifyActivity`, `computeCardStats`, `bucketVisitsByDay`,
  `avgDaysBetweenVisits`) are already program-agnostic — they operate on
  arrays of cards/events with no program-specific logic. The vendor-level
  view needs zero new pure logic, only a new impure shell that fetches
  cards+events across every program instead of one, then feeds the same
  pure functions already in production.
- Both `/dashboard/activity` and `/dashboard/stats` keep their `?p=<id>`
  filtered mode exactly as-is (byte-identical), same precedent as
  Customers' Task 3.

## A. `DashboardNav`

Restore the pre-revamp `LINKS`-array pattern (minus `Counter`, which Spec B
handles separately — this spec does not touch the dashboard-card-grid page
or its "Counter" concept):

```
const LINKS = [
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/stats", label: "Stats" },
];
```

Desktop (`sm+`): inline row between brand and account menu, active-state
highlighting via pathname prefix match (same `isActive()` helper the
pre-revamp nav used). Mobile (`<sm`): links collapse behind a burger
button/slide-down panel, same mechanism the pre-revamp nav used before it
was stripped.

Remove the `Users`/`Customers` `DropdownMenuItem` added to the account menu
in the immediately-prior fix. Account dropdown: Plan, Profile, Sign out.

## B. Vendor-level Activity (`src/app/dashboard/activity/`)

New `src/lib/activity.ts`:

- `aggregateActivity(events, cardsById, programNameById)` — pure. Each
  event resolves its card's phone and program name, computes `isReward`/
  `label` (same logic as today's inline page code), returns rows sorted
  newest-first, capped at 15.
- `listVendorActivity(): Promise<VendorActivityRow[]>` — impure shell:
  `listPrograms()` for program names, fetch every program's cards, fetch
  those cards' `stamp_events` (mirrors `listVendorCustomers`'s two-query
  shape), delegate to `aggregateActivity`.

`activity/page.tsx`: `?p=` present → today's exact branch, unchanged. No
`?p=` → call `listVendorActivity()`, render each row with a program-name
badge (new — not needed in the single-program view).

## C. Vendor-level Stats (`src/app/dashboard/stats/`)

New `getVendorStats()` in `src/lib/stats.ts` (alongside, not replacing,
`getProgramStats`): fetch cards+events across every one of the vendor's
programs (same two-query shape as B), then call the existing
`classifyActivity` → `computeCardStats` → `bucketVisitsByDay` →
`avgDaysBetweenVisits` pipeline unchanged — identical to what
`getProgramStats` already does, just with a wider `cards` input.

`stats/page.tsx`: `?p=` present → today's exact branch, unchanged. No `?p=`
→ call `getVendorStats()`, render the same `Tile` layout with vendor-wide
numbers.

## D. Testing

- `aggregateActivity`: `test/lib/activity.test.ts`, pure, mirrors
  `test/lib/customers.test.ts`'s style.
- `getVendorStats`: covered by extending `test/lib/stats.test.ts` (it
  already tests the pure pipeline this reuses — a new test just confirms
  the wider-input wiring, not new pipeline logic).
- `DashboardNav`: extend `dashboard-nav.dom.test.tsx` for the restored
  links/active-state/burger, remove the now-stale Customers-in-account-menu
  assertion.
- Filtered (`?p=`) branches: verified byte-identical the same way as the
  Customers work (diff/hunk inspection during task review).

## Out of scope

- The Counter page, card-click routing, and universal scan — Spec B.
- Stamp redeem-carryover mechanics — Spec C.
- Any change to `ProgramCard`'s footer links or the dashboard card grid
  itself.
