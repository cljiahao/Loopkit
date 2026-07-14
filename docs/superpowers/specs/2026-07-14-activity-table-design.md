# Activity page: table + type/date filters

Date: 2026-07-14

## Problem

The Activity page (`src/app/dashboard/activity/page.tsx`) renders recent
stamps/plays/redemptions as a card list (`<ul>` of styled `<li>`s), with
no way to filter by event type or date. User wants a table instead,
specifically so they can filter for stamp vs. reward events, and by date.

## Investigation

Two separate, near-duplicate code paths exist today:

- **Merged view** (`?p=` absent): `listVendorActivity()` in
  `src/lib/activity.ts` — queries all of the vendor's programs' cards,
  then their `stamp_events`, capped at `MAX_ROWS = 15`, renders via the
  extracted `VendorActivityList` component (tested in
  `activity-page.dom.test.tsx`).
- **Filtered view** (`?p=<id>`): a separate ad-hoc query directly in
  `page.tsx` (not going through `lib/activity.ts` at all), capped at
  `.limit(10)`, rendered via inline JSX that duplicates
  `VendorActivityList`'s markup almost exactly.

Neither path supports any filtering — both just show "most recent N."
The 15-vs-10 cap mismatch is incidental drift, not a deliberate choice.

Every event's `kind` column is one of `stamp` / `redeem` / `visit`
(`visit` covers lucky/wheel/scratch/streak plays). `isReward` is already
computed (`kind === "redeem" || won`), giving a clean binary split that
matches the user's own phrasing ("filter for reward or stamp") without
inventing new classification logic.

No shadcn `Table` component is installed (`src/components/ui/table.tsx`
doesn't exist).

## Decisions

- **Filtering hits the database, not the already-fetched batch.**
  Confirmed with the user: a date range outside whatever's currently
  capped-and-loaded would silently return nothing under client-side
  filtering, even if matching events exist further back. Filters become
  real query constraints; the fixed row cap is replaced by pagination.
- **Type filter is binary**: `All` / `Stamps` (kind `stamp`/`visit`) /
  `Rewards` (kind `redeem`, or a won `visit`) — reusing the existing
  `isReward` boolean, not exposing all 4 raw kind/label combinations.
- **Date filter is a from/to range**, not fixed presets (24h/7d/30d/90d)
  — Activity can span a vendor's entire history, unlike qkit's
  look-back-window stats page that presets suit.
- **The merged and filtered code paths unify** into one query function
  and one table component, parameterized by which program IDs to
  include — removing the 15-vs-10 cap mismatch and the duplicated JSX as
  a side effect of building this properly, not as separate scope.
- Table's "Program" column only renders on the merged view (same
  information the current Badge conveys) — a single-program filtered
  view has no need to repeat the program name on every row.

## A. Unified data function

`src/lib/activity.ts`'s `listVendorActivity()` is replaced by a
parameterized `listActivity({ programIds, type, dateFrom, dateTo, limit,
offset })`:

- `programIds: string[]` — the merged view passes every one of the
  vendor's program IDs; the filtered view passes a single-element array
  with just the current program's ID. Same underlying query either way.
- `type?: "stamps" | "rewards"` — when set, constrains to `kind IN
('stamp','visit')` (stamps) or `kind = 'redeem' OR won` (rewards, same
  `isWonVisit` check already used for `isReward`).
- `dateFrom?: string`, `dateTo?: string` — ISO date strings (from the
  filter form's `<input type="date">`), inclusive bounds on
  `created_at`.
- `limit`/`offset` — pagination (see below), replacing the old fixed
  `MAX_ROWS` cap.
- Returns `{ rows: VendorActivityRow[]; hasMore: boolean }` —
  `hasMore` determined by requesting `limit + 1` rows and checking for
  the extra one, avoiding a separate `COUNT` query.

`VendorActivityRow`'s shape (`id`, `phone`, `programName`, `kind`,
`isReward`, `label`, `createdAt`) is unchanged — only how rows are
selected changes, not what each row contains.

## B. Table + filters UI

- Install shadcn `Table`: `pnpm dlx shadcn@latest add table`.
- New `ActivityTable` component (replaces `VendorActivityList` and the
  filtered branch's inline `<ul>`): columns Type (icon + label, same
  gift/stamp iconography as today), Phone, Program (merged view only,
  via a `showProgram: boolean` prop), Date. Empty state ("No activity
  yet." / a filtered-specific "No activity matches these filters.")
  preserved.
- New `ActivityFilters` component: one `<form method="get">` containing
  a `Select` (`name="type"`, options All/Stamps/Rewards — Radix's `name`
  prop bubbles a hidden native select into the form the same way it
  already does in `qkit-earn-settings.tsx` and
  `schedule-retirement-form.tsx`), two `Input type="date"` fields
  (`name="from"`/`name="to"`), an "Apply filters" submit button, and a
  hidden `<input name="p">` carrying the current program filter forward
  (same pattern as the existing Customers search form). A "Clear
  filters" link appears (plain `<a href="?p=...">`, filters omitted)
  only when at least one filter is currently active.

## C. Pagination

Fixed page size of 25 rows. `?page=N` search param (1-indexed, defaults
to 1). Prev/Next links constructed server-side by copying the current
`URLSearchParams` and only changing `page` — same technique
`ProgramSwitcher` already uses for its own param-copying — so Prev/Next
never drop an active type/date/program filter. Next is omitted/disabled
when `hasMore` is false; Prev is omitted/disabled on page 1.

## Testing

- `src/lib/activity.ts`'s pure logic (whatever of `aggregateActivity`
  survives the rewrite, or its replacement) keeps unit-test coverage for
  the type-classification and date-bound behavior — exact test shape
  determined during planning once the query function's final shape is
  locked in.
- `activity-page.dom.test.tsx` (exists, currently tests the old
  `VendorActivityList` component) is rewritten against the new
  `ActivityTable` component — same empty-state and row-rendering
  assertions, adapted to table markup (`role="table"`/`"row"`/`"cell"`
  queries instead of list-item queries).
- New test coverage for `ActivityFilters`: renders with the right
  initial `Select`/date values from the URL, "Clear filters" only shows
  when a filter is active.

## Out of scope

- Any change to how events are recorded (`stamp_events` schema, RPCs).
- Any change to the Stats or Customers pages, or their own pickers.
- Exposing the 4 raw kind values as separate filter options — binary
  Stamps/Rewards only, per the Decisions section.
- Infinite scroll or "load more" — plain Prev/Next pagination only.
