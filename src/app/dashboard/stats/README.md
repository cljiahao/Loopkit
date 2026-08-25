# stats

## Purpose

Vendor stats page at `/dashboard/stats` — enrollment, retention, and visit metrics either merged across all programs or scoped to one via `?p=`, plus a 30-day visits bar chart.

## Contents

- `page.tsx` — `StatsPage` server component; requires a vendor, redirects to the single program when there's exactly one, renders `ProgramSwitcher` below the page header, then stat tiles (enrolled, active/lapsed, redemption rate, repeat-visit rate, visits, rewards redeemed, avg days between visits, expired unclaimed) with day-over-day deltas and a shared `VisitsChart`, sourced from `getVendorStats`/`getProgramStats` plus the separately-sourced `countExpiredVouchers`. Each tile's own `Tile` helper wraps `@merqo/ui`'s shared `StatTile` (label/value/delta content, value-above-label via its `reverse` prop) in loopkit's own `ElevatedCard` shell. Both return branches' root element is a plain `<div className="space-y-8">` — the page no longer sets its own `max-w-*`/padding; the enclosing `../layout.tsx` `<main>` now owns the shared `max-w-7xl` width and padding for the whole `/dashboard` tree. The vendor-wide branch also renders a "By mechanic" card from `getVendorMechanicBreakdown` (`@/lib/stats`), shown only when the vendor runs 2+ distinct mechanics — a single-mechanic shop already sees those numbers in the tiles above.
- `stats-page.dom.test.tsx` — jsdom tests for `StatsPage`: renders vendor-wide stat tiles (including "Expired unclaimed (30d)") and the visits chart with no program selected, renders program-scoped tiles when `?p=` is set, shows the empty state at zero enrolled customers, and shows/hides the "By mechanic" card based on how many mechanics `getVendorMechanicBreakdown` returns.
- `visits-chart.tsx` — `VisitsChart({ data })`: the 30-day visits bar chart, extracted so both of `page.tsx`'s branches (all programs / single program) share one implementation instead of ~110 duplicated lines; renders a `border-t border-border` baseline under the bars and `text-[10px]` first/last date labels (via `formatShortDate`) beneath it, since the per-bar `title` tooltip alone is invisible on touch — the primary device per PRODUCT.md.

## Parent

[dashboard](../README.md)
