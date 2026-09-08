# overview

## Purpose

The presentational components of the vendor Overview (`/dashboard`). Each takes
plain props derived from `../dashboard-view.ts`'s `OverviewModel`, does no data
fetching, and is tested with React Testing Library and plain props. `page.tsx`
composes them.

## Contents

- `briefing.tsx` — `Briefing({ text })`: the editorial lead sentence as a `<p>`; a leading integer token is pulled out and set in the mono display face as a headline figure
- `briefing.dom.test.tsx` — renders the full sentence, pulls out a numeric lead, treats a non-numeric lead as plain text, asserts no em dash
- `base-strip.tsx` — `BaseStrip({ stats, redemptionRatePct, returnRatePct })`, client: the 4 base stats as `@merqo/ui` `StatTile`s wrapped in `ElevatedCard`, each with an `InfoTooltip trigger="tap"` whose content is the stat's title/body/hint; below them the redemption-rate and return-rate figures, each with their own tap tooltip. `--` (two hyphens) for a null return rate
- `base-strip.dom.test.tsx` — jsdom: the 4 displays/labels render, tapping a stat's info trigger reveals its body copy, the two rate figures render, `--%` for a null return rate and no em dash anywhere
- `visits-trend.tsx` — `VisitsTrend({ bars7, bars14, deltaVsLastWeek })`, client: a div-bar strip (the `stats/visits-chart.tsx` idiom) showing 7 bars by default and 14 on `matchMedia("(min-width: 56rem)")`, the prior week's 7 bars muted; a "Visits, last N days" caption and an "up/down N vs last week" delta (hidden at 0)
- `visits-trend.dom.test.tsx` — jsdom with a stubbed `matchMedia`: 7 bars + 7-day caption + a positive delta on a narrow screen, 14 bars + 14-day caption + a negative delta on a wide screen, the delta hidden at 0
- `worth-a-look.tsx` — `WorthALook({ items })`: one `next/link` per `WorthALookItem` to `/dashboard/customers?seg=lapsed` (gone-quiet) or `?seg=ready` (one/two stamps away), with strong + sub copy; renders nothing when `items` is empty
- `worth-a-look.dom.test.tsx` — jsdom: two items render two links with the right hrefs, empty renders nothing, singular wording for a count of one
- `recent-activity.tsx` — `RecentActivity({ rows, programIdByName? })`: up to 6 `VendorActivityRow`s, each with a kind mark, `maskPhone` phone, a label + program meta line, an SGT timestamp, and a Serve `Link` to `/dashboard/counter?p=<id>&phone=<phone>` on non-reward rows when the program id resolves; a header link to the full Activity page
- `recent-activity.dom.test.tsx` — jsdom: the list caps at 6, a visit row shows a Serve link when the id resolves, a reward row does not, the phone is masked
- `reward-cost-panel.tsx` — `RewardCostPanel({ cost, manageHref })`: rewards redeemed this month with `formatSgd(knownCostCents)` (`+` and a "programs have no cost set" note when a program's cost is unset), the pending-return-soon count, expired-unclaimed breakage, and a `<details>` per-program breakdown linking to `/setup`
- `reward-cost-panel.dom.test.tsx` — jsdom: the summary numbers render, the missing-cost note and the `+` suffix appear only when a program has no cost, the breakdown lists every program
- `your-programs.tsx` — `YourPrograms({ programs })`: renders nothing below 2 programs; otherwise a row per program (colour seed dot, name, `"{n}% come back"` or `"not enough data"`, an Edit `Link` to `/setup?id=<id>`, a Serve `Link` to `/dashboard/counter?p=<id>`) plus an "Add another program" link to `/setup`
- `your-programs.dom.test.tsx` — jsdom: one program renders nothing, two render an Edit + Serve link each, a null return rate shows the fallback copy

## Parent

[dashboard](../README.md)
