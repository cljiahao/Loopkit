# Reachability picker + responsive setup form

Date: 2026-07-14

## Problem

Feature B (shipped earlier today) added a program switcher to Stats' and
Activity's filtered (`?p=`) views, mirroring Customers' existing one — but
scoped it to the filtered view only, matching Customers' precedent. That
precedent turns out to be a trap: `DashboardNav`'s Stats/Activity/Customers
links all point to the unscoped route, which lands on the _merged_
vendor-level view (shipped in Spec A) — which has no picker at all. Today,
the only way to ever reach a specific program's filtered view is via that
program's `ProgramCard` footer link on the dashboard.

User feedback, gathered together as one batch:

1. `/setup`'s create/edit form is too cramped on tablet — single-column
   regardless of viewport width.
2. The Stats page "still cannot" switch programs — root cause above, not a
   deploy bug.
3. `ProgramCard`'s footer "Customers/Activity/Stats" links should be
   removed, since those are reachable another way now.
4. Customers should have "filters for which loyalty card" — the same root
   cause as item 2, on the Customers page specifically.

Items 2-4 are one cohesive fix: removing `ProgramCard`'s footer links
(item 3) only makes sense once the merged view itself gains a way to reach
a specific program (items 2 + 4) — otherwise per-program pages become
unreachable entirely. Item 1 is fully independent.

## Decisions (from brainstorming)

- The merged (vendor-level) view survives as the default landing page for
  Stats/Activity/Customers — this was Spec A's deliberate design earlier
  this session, not something to remove. It gains a program picker that
  navigates _into_ the existing filtered page for a chosen program,
  rather than trying to filter the merged view's own aggregate data in
  place.
- Customers' "filter by card" ask is satisfied by the same mechanism —
  no separate filtering feature. The filtered `?p=` page already shows
  richer per-program data (real card/stamp counts) than the merged view's
  aggregate rows (program-name badges only), so navigating there via the
  picker is a genuine upgrade, not just a narrower view of the same data.
- `/setup`'s 2-column layout pairs logically-related simple fields
  (Card name + the type's one numeric field, Win chance + Guaranteed win
  by, Days per streak + Streak length) and leaves complex/unpaired
  elements (type picker, segments editor, checkboxes, reward text,
  expiry) full-width at every breakpoint.

## A. Program picker on merged views

Add `ProgramSwitcher` (already built in Feature B, unmodified) to the
merged branch of `stats/page.tsx`, `activity/page.tsx`, and
`customers/page.tsx`, right below each page's `<h1>`. Unlike the filtered
view's switcher (which resubmits to the same page with a different `?p=`),
the merged view's picker navigates to that program's filtered page — same
`action` URL, but with no "current" program to pass. `ProgramSwitcher`'s
`<select>` has no built-in placeholder/empty state; passing the vendor's
first program as `currentId` makes the browser's native `<select>`
fallback (defaulting to the first `<option>` when `defaultValue` doesn't
match any option) a non-issue — it lands on that same first program
either way. No change to `ProgramSwitcher` itself: the merged view simply
calls it with `currentId={programs[0].id}`.

## B. Remove `ProgramCard`'s footer links

Delete the "Customers / Activity / Stats" `<div>` from
`src/app/dashboard/program-card.tsx` entirely. The card becomes: header
(name, type badge, Edit pencil) → Open Counter button. No other content
remains — its sole remaining job is the counter-serving entry point,
consistent with the Counter-page split done earlier this session.

## C. Customers "filter by card"

No new code beyond Section A — picking a program on Customers' merged
view navigates to `/dashboard/customers?p=<id>`, the existing filtered
page (already shows that program's card list with real stamp/reward
counts, plus its own search-by-phone form).

## D. `/setup` form — responsive 2-column layout

Wrap these field pairs in `grid grid-cols-1 sm:grid-cols-2 gap-4`:

- Stamp: "Card name" + "Stamps required"
- Plant: "Card name" + "Visits to bloom"
- Lucky: "Win chance (%)" + "Guaranteed win by" (already adjacent siblings)
- Streak: "Days per streak window" + "Streak length to earn reward"
  (already adjacent siblings)

For Stamp/Plant, this means restructuring "Card name" (currently its own
full-width block above the type-conditional section) to live _inside_ the
type-conditional block, paired with that type's one numeric field. For
Wheel/Scratch, Streak, and Lucky, "Card name" stays exactly where it is
today (its own full-width row) since none of those types have a single
field to pair it with at that position.

Unchanged at every breakpoint: card type picker (already has its own
internal `grid-cols-2`/`grid-cols-3`), the segments editor (Wheel/Scratch),
reward text, both checkboxes, and expiry days — none pair naturally with a
neighbor, forcing a pairing would look arbitrary.

## E. Testing

- `ProgramSwitcher` itself needs no changes — no new tests for the
  component. Each page's merged-view test coverage (where it exists)
  gets extended to assert the picker renders when `programs.length > 1`.
- `ProgramCard`'s existing test suite loses its footer-link assertions
  (the links no longer exist) — no new assertions needed, just removal
  of now-invalid ones.
- `/setup`'s responsive layout: no dedicated test — this repo has no
  `/setup` page-level test precedent (confirmed during Feature B's
  planning), and CSS breakpoint behavior isn't meaningfully unit-testable
  through jsdom regardless.

## Out of scope

- Any change to the underlying data each filtered page fetches — this is
  pure navigation/UI wiring.
- A true in-place filter on the merged views (narrowing the aggregate
  list without navigating away) — considered and explicitly not chosen,
  per the Decisions section.
- Any further nav restructuring beyond adding the picker.
