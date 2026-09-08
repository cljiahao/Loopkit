# Vendor dashboard redesign: design

Date: 2026-09-08

## Problem

`/dashboard` (`src/app/dashboard/page.tsx`) is a program launcher: a QR
hero, a scan-and-route block, and a grid of `ProgramCard`s. It answers "which
program do I want to work in", not "how is my loyalty program doing" or
"what should I do today". The vendor-value metrics all live one click away on
`/dashboard/stats` as eight point-in-time tiles.

From the vendor's point of view the questions that matter are:

1. Are my regulars still coming, and how often?
2. What is the reward liability costing me?
3. Who do I act on today: win back a drifting regular, expect a reward-ready
   one?

A stamp is a cheap re-visit hook; a redeemed reward is real cost off the
vendor's margin. The current dashboard celebrates activity ("reward
unlocked") which is the _customer's_ excitement, not the owner's.

This redesign rebuilds three screens (Overview, Counter,
Customers) around those three questions. `Activity` and `Referrals`
stay as-is for v1. `Stats` gets a light pass (it stays the deep view; the
Overview is the daily briefing).

Extensive design iteration happened in a standalone mockup (approved). This
spec is the source of truth for the implementation; the decision log behind
it is condensed below.

## Prior work this builds on

- `docs/superpowers/specs/2026-07-11-stats-expansion-design.md`: added
  `pctChange`, prior-period deltas, `avgDaysBetweenVisits` to `stats.ts`.
  All kept. This spec adds three more pure helpers alongside them.
- `docs/superpowers/specs/2026-07-14-dashboard-card-revamp-design.md`: the
  `ProgramCard` shape. The Overview keeps `ProgramCard` semantics (a
  clickable per-program row that routes to the Counter) but restyles the
  block.
- `docs/superpowers/specs/2026-07-10-dashboard-nav-plan-gating-design.md`:
  `canCreateProgram()` / Free = 1 active program. Unchanged.

## What does NOT change

- The shared `@merqo/ui` `DashboardNav`: no new nav item, no divergence
  from the other kits. "Serve a customer" is an in-page CTA, not a route in
  the nav.
- `stamp_events` / `cards` / `reward_vouchers` schema: every new metric is
  computed from data `stats.ts` already fetches. The one schema addition is
  `programs.reward_cost_cents` (sub-plan 2).
- The loyalty engine: `add_stamp`, `record_visit`, `redeem`,
  `regenerate_card`, `adjust_stamp` RPCs and the `serve-customer.tsx` result
  handlers (`handleStampVisit`, `handlePlantVisit`, `handleChanceVisit`) and
  the `ServeResult` type. The Counter rebuild recomposes the _layout_ around
  these; it does not touch the engine calls.
- `avgDaysBetweenVisits` stays all-time and pooled (resolved 2026-07-11).
- No new charting library. `stats/visits-chart.tsx` (the div-bar strip) is
  the idiom; the Overview's chart reuses / adapts it.

## Global constraints

- **Pin exact dependency versions**: no `^`/`~` on new or changed deps.
- **No em dashes** in any user-facing copy or code comments. Use a period,
  comma, colon, or parentheses; split into two sentences. This applies to
  files touched by this work, including sweeping existing em dashes out of a
  file being modified (the current stats page and dashboard copy use them).
- TypeScript strict: no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server
  actions).
- Authorization lives in RLS policies, not app code.
- Money is integer cents (`reward_cost_cents`), never a float.
- Currency is **SGD**.
- Pure helpers take `now: number` (ms), never read the wall clock (mirrors
  `programHealth`, `avgDaysBetweenVisits`).
- CI gate: changed-line coverage >= 80% (diff-cover). Every task ships its
  own tests.
- Every PR touches `CHANGELOG.md` (`## [Unreleased]`) and keeps the
  relevant folder README current in the same commit.

## Locked product decisions

### Metric definitions (research-checked)

- **"Regular"** = a card with 2+ lifetime activity events AND an event in
  the last 30 days.
- **"Return rate" / "% come back"** (the per-program health headline) = of
  cards active in the last **90 days**, the fraction with 2+ lifetime
  activity events. Denominator is 90-day-active cards, not all-time
  enrolled (dead cards must not drag it down). `null` when no card is
  90-day-active.
- **"Gone quiet"** (Overview "Worth a look") = a card with **3+** lifetime
  activity events whose latest event is **21 to 40 days** ago. Bounded, not
  open-ended: 21d is the early-warning line, past ~45d the customer is
  likely gone and low-ROI to chase.
- **"One / two stamps away"** (Overview "Worth a look") = `stamp_count ===
stamps_required - 1` (the hot list) and `=== stamps_required - 2`.
- **Redemption rate** = `rewardsTotal / enrolled` (already computed). It is
  the single most-cited program-health metric and must be visible on the
  Overview.
- **"New this month"** = card created since the 1st of the current month.
- **"At risk"** (recency past ~2x the card's own cadence) is Phase 2, not
  this spec.

### Reward cost

Current model: one program has one `stamps_required` threshold and one
`reward_text`. So one cost per program: `programs.reward_cost_cents`
(nullable int, SGD cents), the vendor's own estimate of the reward item's
COGS. The Overview cost panel shows `rewards_redeemed_this_month *
reward_cost_cents` per program plus `countExpiredVouchers` as breakage.
A per-product catalog and multi-tier `reward_tiers` are Phase 3, out of
scope here.

### Counter

- Scan-first: the scan target is the hero. Manual phone entry is a
  collapsed `<details>` fallback ("Existing customer who can't scan?").
- The active-card panel is **empty until a customer is loaded** (matches
  `serve-customer.tsx` where `result` starts `null`).
- "New customer" action: cashier enters a phone, `add_stamp` creates the
  card and lands the first stamp.
- "Shop join QR" action: shows a printable poster. The QR encodes
  `/c?v=<vendorId>&p=<programId>` (program-specific; add `&p=` to
  `ShopQrBlock`). Single-program vendors keep `/c?v=<vendorId>`.
- "Undo" on the just-served strip = `adjustStampAction` with `delta: -1`,
  `reason: "undo"`. Single level, cleared on the next action or leaving the
  page. Deeper corrections go to `customers/[phone]/adjust-stamp-form`.
- The "Serve a customer" CTA and each program row route to the Counter for
  the **last-used program** (stored in `localStorage`, per device); first
  use defaults to the program with the most active cards.

### Pricing / gating

loopkit Pro is **$4.99 SGD/month**. Free is fully usable. Pro unlocks:
multiple programs, all non-stamp mechanics, premium card styles, multi-tier
rewards, branding removal, customer Telegram nudges, Stats depth. **Phase 1
ships ungated**: gating is added in Phase 2 once there is real usage to
instrument. No `isPro()` checks in the Overview / Counter / Customers
rebuild.

### Layout

- Overview: one centred column at `max-width` ~46rem below 1024px. At
  > = 1024px **and** 2+ programs, a two-zone grid: the scannable read
  > (briefing, base strip, visits chart, "worth a look", recent activity) in
  > the wide column, the reference panel (reward cost, your programs) in a
  > ~20rem right rail.
- Visits chart: 7 bars below ~900px, 14 bars (prior week muted + current
  week + a "vs last week" delta) at >= ~900px.
- Follow loopkit's existing `globals.css` tokens and `ElevatedCard` /
  `@merqo/ui` `StatTile` idioms. No new design system.

## Sub-plans

Each is a separate plan document, each shipping working, tested software.

| #   | Plan                                    | Deliverable                                                                                                                                                                                                               | Depends on |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `2026-09-08-dashboard-stats-helpers.md` | 3 pure functions in `stats.ts` (`returnRate90d`, `regularsGoneQuiet`, `cardsNearReward`) + tests                                                                                                                          | none       |
| 2   | `2026-09-08-programs-reward-cost.md`    | `programs.reward_cost_cents` migration, type regen, a `rewardCostCents` field on `Program`, a small edit control                                                                                                          | none       |
| 3   | `2026-09-08-overview-rebuild.md`        | new `/dashboard` composition: briefing, base strip, visits chart, "worth a look", cost panel, recent activity, your-programs; `dashboard-view.ts` view-model assembling from `stats.ts` + plan-1 helpers + `customers.ts` | 1, 2       |
| 4   | `2026-09-08-counter-scan-first.md`      | `counter/page.tsx` + `serve-customer.tsx` recomposed: scan hero, collapsed manual fallback, empty active card, new-customer, shop-join-QR, undo, last-used-program routing                                                | none       |
| 5   | `2026-09-08-customers-segments-sort.md` | `customers/page.tsx` + `listVendorCustomers`: segment chips (all / reward-ready / new / lapsed), sort select (last visit / longest away / closest to reward), Serve on every row                                          | none       |

## Testing strategy

- Pure helpers: `test/lib/stats.test.ts` (vitest, `describe`/`it`), boundary
  cases explicit (exactly-at-cutoff, empty input, unparseable timestamps
  skipped not thrown).
- Pages / components: `*.dom.test.tsx` with React Testing Library, plain
  props, no Supabase/auth mocking (extract render logic to pure functions,
  the `dashboard-view.ts` / `VendorCustomerList` pattern).
- Server actions: mock the Supabase client, assert the RPC called + args.
- Migration: `test/db/<n>_*.test.ts` static SQL string-match, plus
  `supabase/tests/rls.test.sql` pgTAP if a policy changes.

## Out of scope

- `reward_tiers` multi-tier rewards, a `products` catalog (Phase 3).
- Non-stamp mechanic parity on the new Counter layout beyond re-hosting the
  existing `Plant`/`Cup`/`Wheel`/`ScratchCard` components (Phase 3 verifies
  each path; Plan 4 keeps them working, does not redesign them).
- Pro-tier gating (Phase 2).
- The customer-facing `/c` view, the rotating-QR-per-visit redesign, the
  "unclaimed reward from your old card" surface (after the vendor view).
- Activity and Referrals page redesigns.
- Program-swap ("Replace this program" / `archived_at`): Phase 2, folds
  into the program-edit screen.
- "At risk" cadence-relative segment (Phase 2).

## Open questions for Clarence

1. **Voucher expiry default**: when a reward is earned outside a program
   edit, should `reward_vouchers.expires_at` default to 90 days or stay
   `null` (never expires)? Currently nullable, set only where
   `reward_expiry_days` is configured. Not blocking Plan 1; needed by Plan 3.
