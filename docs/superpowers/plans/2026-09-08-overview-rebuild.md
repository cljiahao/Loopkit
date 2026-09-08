# Overview rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/dashboard` (a program launcher) with a vendor briefing: are my regulars coming and how often, what do the rewards cost, who do I act on today.

**Architecture:** A pure view-model (`dashboard-view.ts`, already the home of `shouldShowQr`) assembles everything the page shows from data `stats.ts` + plan-1 helpers + `customers.ts` + `activity.ts` already fetch. `page.tsx` becomes a thin server component: fetch, call `buildOverviewModel`, render a handful of focused presentational components. Layout is one centred column below 1024px, a two-zone grid (scannable read + reference rail) at >= 1024px when the vendor has 2+ programs. The visits chart renders 7 bars on phones, 14 on wide screens, via `matchMedia` in a client component.

**Tech Stack:** Next.js 16 server components, React 19, Tailwind v4, `@merqo/ui` (`StatTile`, `InfoTooltip` trigger="tap"), loopkit `ElevatedCard`, Vitest + React Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-08-vendor-dashboard-redesign-design.md` (sub-plan 3 of 5)

**Depends on:** sub-plan 1 (`returnRate90d`, `regularsGoneQuiet`, `cardsNearReward` in `stats.ts` - already merged as PR #121) and sub-plan 2 (`programs.reward_cost_cents` + `Program.reward_cost_cents`).

**Visual source of truth:** the approved mockup at
`C:\Users\Clarence\AppData\Local\Temp\claude\C--Users-Clarence-Desktop-Coding-Merqo-Business\27d61aa7-84bb-4d83-9a4b-fa8896b15c15\scratchpad\loopkit-dashboard-mockup.html`
(Overview screen, `<div class="screen" data-name="overview">`). Copy its structure, wording, and information hierarchy. Use loopkit's `globals.css` tokens and existing component idioms for styling; do not import the mockup's raw CSS.

## Global Constraints

- Pin exact dependency versions. This plan adds no new dependency (no new charting library: the div-bar strip in `stats/visits-chart.tsx` is the idiom).
- **No em dashes** in any user-facing copy or code comment. Period, comma, colon, parentheses, or two sentences. The current `stats/page.tsx` and dashboard copy use em dashes and the literal `"—"` string for null values: any line you touch, convert. Use `"not yet"` or `"--"` (two hyphens) for an empty metric, never `"—"`.
- TypeScript strict: no `any`, no `@ts-ignore`.
- Pure helpers take `now: number` (ms), never read the wall clock. Mirrors `programHealth`, `avgDaysBetweenVisits`, `returnRate90d`.
- Validate any user input (the average-order-value prompt, if built) with Zod.
- Authorization lives in RLS. Every `stats.ts` / `customers.ts` / `activity.ts` read is already RLS-scoped to the signed-in vendor; add no service-role usage.
- Money is integer cents (`reward_cost_cents`), formatted through `@/lib/money`'s `formatSgd`. Currency SGD.
- No `isPro()` checks anywhere in this rebuild (spec: Phase 1 ships ungated).
- CI gate: changed-line coverage >= 80%. Pages/components tested as `*.dom.test.tsx` with plain props (extract render logic to pure functions, the `dashboard-view.ts` pattern) - no Supabase/auth mocking in component tests.
- Every PR touches `CHANGELOG.md` and keeps every changed folder's `README.md` current in the same commit, including a running-narrative sentence in the root `README.md`.

## What this plan does NOT do

- No `reward_tiers` / multi-tier reward cards (Phase 3). The cost panel shows one `reward_cost_cents` per program times rewards redeemed this month. The mockup's "3 tiers" breakdown and per-product lines are Phase 3; render a single line per program.
- No average-order-value / repeat-sales estimate persistence beyond a `localStorage` per-device convenience (the mockup's `cost-prompt` / `cost-sales`). Build it as an optional client enhancement in Task 8, or omit it and leave the prompt out. It is explicitly out of the spec's scope; do not add a DB column for it.
- No zero-state / loading polish beyond a correct empty branch (Phase 2 owns the deep empty and skeleton states). A vendor with zero enrolled customers sees a short "no customers yet, share your join QR" card, same as `stats/page.tsx` today.
- Activity and Referrals pages are untouched. "Recent activity" on the Overview reuses `listActivity` read-only.

## File Structure

**Pure logic**

- `src/app/dashboard/dashboard-view.ts` (modify) - keep `shouldShowQr`; add the Overview view-model builder + sub-helpers.
- `src/app/dashboard/dashboard-view.test.ts` (modify) - cover every new helper.

**Components** (all under `src/app/dashboard/`, each with a `*.dom.test.tsx`)

- `overview/briefing.tsx` - the editorial lead sentence. Server component (pure text).
- `overview/base-strip.tsx` - the 4 self-explaining stats. **Client** (`InfoTooltip trigger="tap"`).
- `overview/visits-trend.tsx` - the responsive 7/14-bar chart + caption + delta. **Client** (`matchMedia`).
- `overview/worth-a-look.tsx` - the action rows (gone quiet, N stamps away). Server component; each row is a `Link`.
- `overview/recent-activity.tsx` - a short activity list. Server component.
- `overview/reward-cost-panel.tsx` - rewards redeemed this month, cost, expired-unclaimed breakage, breakdown toggle. **Client** (breakdown disclosure) or server with `<details>`. Prefer server + `<details>`.
- `overview/your-programs.tsx` - per-program rows with return rate, edit link, Serve link (2+ programs only). Server component.
- `serve-cta.tsx` - the "Serve a customer" button. **Client** (reads last-used program id from `localStorage`, falls back to the server-provided default).
- `src/app/dashboard/page.tsx` (rewrite) - compose the above.
- `src/app/dashboard/dashboard-page.dom.test.tsx` (rewrite) - assert the new composition.

**Deleted after the rewrite** (dead once `page.tsx` no longer imports them - confirm no other importer with `grep`):

- `scan-and-route.tsx` + test, if `page.tsx` was its only consumer. `grep -rn "ScanAndRoute\|scan-and-route" src` first; the Counter (sub-plan 4) may adopt it. If unsure, leave it and note in the ledger.
- Keep `program-card.tsx`, `new-program-tile.tsx`, `shop-qr-block.tsx`, `program-display.ts` (reused).

## Interfaces produced (the view-model)

```ts
// src/app/dashboard/dashboard-view.ts

import type { ProgramStats } from "@/lib/stats";

export type OverviewProgram = {
  id: string;
  name: string;
  type: string;
  returnRate: number | null; // returnRate90d for this program, 0..1
  rewardText: string;
  rewardCostCents: number | null;
  rewardsThisMonth: number; // reward events since the 1st
};

export type WorthALookItem =
  | { kind: "gone-quiet"; count: number }
  | { kind: "one-away"; count: number }
  | { kind: "two-away"; count: number };

export type BaseStat = {
  key: "regulars" | "new" | "lapsed" | "net";
  label: string;
  display: string; // already sign-formatted, e.g. "+9", "-4", "38"
  tone: "plain" | "pos" | "soft";
  title: string;
  body: string;
  hint: string;
};

export type OverviewModel = {
  greeting: string; // "Good afternoon" | "Good morning" | "Good evening"
  briefing: string;
  baseStats: BaseStat[];
  redemptionRatePct: number; // rounded 0..100
  returnRatePct: number | null; // vendor-wide returnRate90d, rounded
  trend: {
    bars7: { date: string; count: number }[];
    bars14: { date: string; count: number }[]; // [prior week (7)] + [current week (7)]
    deltaVsLastWeek: number; // current-week visits minus prior-week visits
  };
  worthALook: WorthALookItem[];
  cost: {
    rewardsThisMonth: number;
    knownCostCents: number; // sum over programs with a cost set
    programsMissingCost: number;
    expiredUnclaimed: number;
    pendingReturnSoon: number; // cardsNearReward oneAway + twoAway, vendor-wide
    perProgram: {
      name: string;
      rewardText: string;
      unitCents: number | null;
      redeemed: number;
      lineCents: number | null;
    }[];
  };
  programs: OverviewProgram[]; // for "Your programs"; empty-or-1 hides that block
  serveDefaultProgramId: string; // program with the most active cards, else first
};

export function buildGreeting(nowMs: number, tz?: string): string;
export function buildBriefing(
  regularsCount: number,
  avgDaysBetweenVisits: number | null,
  avgDaysPrevPeriod: number | null,
): string;
export function splitTrend(
  visitsByDay: { date: string; count: number }[],
): OverviewModel["trend"];
export function buildBaseStats(input: {
  active: number;
  newThisMonth: number;
  lapsed: number;
}): BaseStat[];
export function buildCostView(
  programs: OverviewProgram[],
  expiredUnclaimed: number,
  near: { oneAway: number; twoAway: number },
): OverviewModel["cost"];
export function buildOverviewModel(input: BuildOverviewInput): OverviewModel;
```

`avgDaysPrevPeriod` is only used for the briefing's "N days sooner/later than last month" clause. `stats.ts` does not currently compute a prior-period `avgDaysBetweenVisits`. **Ruling for this plan:** pass `null` for `avgDaysPrevPeriod` and have `buildBriefing` omit the comparison clause when it is `null`. Do not add a prior-period cadence stat in this plan (it is a `stats.ts` change with its own test surface; open a follow-up if the vendor asks). The briefing still reads well: "41 regulars kept coming back this month, on average every 9 days."

---

### Task 1: `buildGreeting` + `buildBriefing`

**Files:** `src/app/dashboard/dashboard-view.ts`, `src/app/dashboard/dashboard-view.test.ts`

**Interfaces:**

- Produces `buildGreeting(nowMs, tz?)`, `buildBriefing(regularsCount, avgDays, avgDaysPrev)`.

- [ ] **Step 1: Write failing tests**

```ts
import { buildGreeting, buildBriefing } from "@/app/dashboard/dashboard-view";

describe("buildGreeting", () => {
  // SGT is UTC+8 with no DST. nowMs picked so SGT hour is unambiguous.
  const sgt = (h: number) => Date.UTC(2026, 8, 8, h - 8, 0, 0);
  it("morning before noon", () => {
    expect(buildGreeting(sgt(9))).toBe("Good morning");
  });
  it("afternoon noon to 17:59", () => {
    expect(buildGreeting(sgt(14))).toBe("Good afternoon");
  });
  it("evening 18:00 onward", () => {
    expect(buildGreeting(sgt(20))).toBe("Good evening");
  });
});

describe("buildBriefing", () => {
  it("states the regular count and cadence, no em dash", () => {
    const s = buildBriefing(41, 9.2, null);
    expect(s).toContain("41 regulars");
    expect(s).toContain("every 9 days");
    expect(s).not.toContain("\u2014");
  });
  it("omits the cadence clause when avgDays is null", () => {
    const s = buildBriefing(3, null, null);
    expect(s).toContain("3 regulars");
    expect(s).not.toContain("every");
  });
  it("singular for one regular", () => {
    expect(buildBriefing(1, 5, null)).toContain("1 regular ");
  });
  it("adds the sooner/later clause when a prior cadence is given", () => {
    expect(buildBriefing(20, 9, 11)).toContain("2 days sooner");
    expect(buildBriefing(20, 12, 9)).toContain("3 days later");
  });
  it("handles zero regulars gracefully", () => {
    expect(buildBriefing(0, null, null)).toMatch(/No regulars yet|0 regulars/);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** in `dashboard-view.ts` (after `shouldShowQr`):

```ts
// SGT (UTC+8, no DST). react `cache`-free pure helper: the caller passes nowMs.
export function buildGreeting(nowMs: number): string {
  const sgtHour = new Date(nowMs + 8 * 60 * 60 * 1000).getUTCHours();
  if (sgtHour < 12) return "Good morning";
  if (sgtHour < 18) return "Good afternoon";
  return "Good evening";
}

// The Overview lead sentence. Vendor-framed: their loyal base and how fast it
// turns over, not a customer celebration.
export function buildBriefing(
  regularsCount: number,
  avgDaysBetweenVisits: number | null,
  avgDaysPrevPeriod: number | null,
): string {
  if (regularsCount === 0) {
    return "No regulars yet this month. A regular is someone who has come back at least once.";
  }
  const noun = regularsCount === 1 ? "regular" : "regulars";
  let s = `${regularsCount} ${noun} kept coming back this month`;
  if (avgDaysBetweenVisits !== null) {
    const d = Math.round(avgDaysBetweenVisits);
    s += `, on average every ${d} ${d === 1 ? "day" : "days"}`;
    if (avgDaysPrevPeriod !== null) {
      const diff = Math.round(avgDaysPrevPeriod) - d;
      if (diff > 0)
        s += `. ${diff} ${diff === 1 ? "day" : "days"} sooner than last month`;
      else if (diff < 0)
        s += `. ${-diff} ${-diff === 1 ? "day" : "days"} later than last month`;
    }
  }
  return s + ".";
}
```

- [ ] **Step 4: Run tests, green.**
- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): buildGreeting + buildBriefing view-model helpers"`

---

### Task 2: `splitTrend`

**Files:** `dashboard-view.ts`, `dashboard-view.test.ts`

**Interfaces:**

- Consumes: `ProgramStats["visitsByDay"]` (always 30 entries, oldest first, from `bucketVisitsByDay`).
- Produces: `splitTrend(visitsByDay)` -> `{ bars7, bars14, deltaVsLastWeek }`. `bars7` = last 7 entries. `bars14` = last 14. `deltaVsLastWeek` = sum(last 7 counts) - sum(the 7 before that).

- [ ] **Step 1: Failing tests**

```ts
import { splitTrend } from "@/app/dashboard/dashboard-view";

const days = (counts: number[]) =>
  counts.map((count, i) => ({ date: `d${i}`, count }));

describe("splitTrend", () => {
  it("bars7 is the last 7 days, bars14 the last 14", () => {
    const input = days(Array.from({ length: 30 }, (_, i) => i)); // 0..29
    const t = splitTrend(input);
    expect(t.bars7.map((b) => b.count)).toEqual([23, 24, 25, 26, 27, 28, 29]);
    expect(t.bars14).toHaveLength(14);
    expect(t.bars14[0].count).toBe(16);
  });
  it("deltaVsLastWeek is this-week sum minus prior-week sum", () => {
    // last 7 all 2 (sum 14), the 7 before all 1 (sum 7) -> +7
    const arr = Array(30).fill(0);
    for (let i = 23; i < 30; i++) arr[i] = 2;
    for (let i = 16; i < 23; i++) arr[i] = 1;
    expect(splitTrend(days(arr)).deltaVsLastWeek).toBe(7);
  });
  it("handles a short array without throwing", () => {
    const t = splitTrend(days([1, 2, 3]));
    expect(t.bars7).toHaveLength(3);
    expect(t.bars14).toHaveLength(3);
    expect(t.deltaVsLastWeek).toBe(0); // no prior week
  });
});
```

- [ ] **Step 2-4: fail, implement, pass.**

```ts
export function splitTrend(visitsByDay: { date: string; count: number }[]): {
  bars7: { date: string; count: number }[];
  bars14: { date: string; count: number }[];
  deltaVsLastWeek: number;
} {
  const bars7 = visitsByDay.slice(-7);
  const bars14 = visitsByDay.slice(-14);
  const sum = (a: { count: number }[]) => a.reduce((n, d) => n + d.count, 0);
  const thisWeek = sum(visitsByDay.slice(-7));
  const priorWeek = sum(visitsByDay.slice(-14, -7));
  return { bars7, bars14, deltaVsLastWeek: thisWeek - priorWeek };
}
```

- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): splitTrend view-model helper"`

---

### Task 3: `buildBaseStats`

**Files:** `dashboard-view.ts`, `dashboard-view.test.ts`

**Interfaces:**

- Produces `buildBaseStats({ active, newThisMonth, lapsed })` -> `BaseStat[]` of length 4 in order `regulars, new, lapsed, net`. `net = newThisMonth - lapsed`. `display` is sign-formatted: `new` always shows a leading `+` when `> 0`; `lapsed` shows as `-N` (a magnitude with a minus, never `+`); `regulars` is a plain count; `net` shows a leading `+`/`-`. `tone`: `new` -> `pos` when `> 0` else `plain`; `lapsed` -> `soft`; others `plain`.
- `title`/`body`/`hint` copy comes verbatim from the mockup's `data-title` / `data-body` / `data-hint` attributes (lines ~625-636). No em dashes (there are none in that copy).

- [ ] **Step 1: Failing tests** - assert length 4, order, `display` strings (`buildBaseStats({active:38,newThisMonth:9,lapsed:4})` -> `["38","+9","-4","+5"]`), `tone` values, and that `body` for `regulars` is `"Visited 2 or more times, and back within the last 30 days."`.

- [ ] **Step 2-4: fail, implement, pass.** Copy map:

| key      | label           | title           | body                                                       | hint                                         |
| -------- | --------------- | --------------- | ---------------------------------------------------------- | -------------------------------------------- |
| regulars | active regulars | Active regulars | Visited 2 or more times, and back within the last 30 days. | Your loyal base right now.                   |
| new      | new this month  | New this month  | First-time cards created since the 1st.                    | People just trying the program.              |
| lapsed   | lapsed          | Lapsed          | Regulars not seen in 30 or more days.                      | They were coming. Now quiet.                 |
| net      | net             | Net change      | New cards minus lapsed regulars.                           | Whether your base grew or shrank this month. |

- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): buildBaseStats view-model helper"`

---

### Task 4: `buildCostView` + `buildOverviewModel`

**Files:** `dashboard-view.ts`, `dashboard-view.test.ts`

**Interfaces:**

- `buildCostView(programs, expiredUnclaimed, near)`:
  - `rewardsThisMonth` = sum of `p.rewardsThisMonth`.
  - `knownCostCents` = sum of `p.rewardCostCents * p.rewardsThisMonth` over programs where `rewardCostCents != null`.
  - `programsMissingCost` = count of programs with `rewardsThisMonth > 0 && rewardCostCents == null`.
  - `pendingReturnSoon` = `near.oneAway + near.twoAway`.
  - `perProgram`: one row per program, `lineCents = rewardCostCents == null ? null : rewardCostCents * rewardsThisMonth`.
- `buildOverviewModel(input)`: pure, `now: number`. Wires Tasks 1-4 together. `serveDefaultProgramId` = the id passed in as `input.serveDefaultProgramId` (the page computes it from a card-count query; see Task 9). `returnRatePct` = `input.vendorReturnRate == null ? null : Math.round(input.vendorReturnRate * 100)`.
- `BuildOverviewInput`:

```ts
export type BuildOverviewInput = {
  nowMs: number;
  vendorName: string;
  stats: ProgramStats; // vendor-wide, from getVendorStats
  vendorReturnRate: number | null; // returnRate90d over all activity events
  regularsCount: number; // computeCardStats "repeat + active" - see Task 9 note
  newThisMonth: number;
  goneQuiet: number; // regularsGoneQuiet(...).count
  near: { oneAway: number; twoAway: number }; // cardsNearReward vendor-wide
  expiredUnclaimed: number; // countExpiredVouchers
  recentActivity: import("@/lib/activity").VendorActivityRow[];
  programs: OverviewProgram[];
  serveDefaultProgramId: string;
};
```

- [ ] **Step 1: Failing tests** - one building a full model from a hand-built input and asserting: `greeting` matches `buildGreeting(nowMs)`, `briefing` contains the regular count, `baseStats` length 4, `cost.knownCostCents` math (e.g. 2 programs: A cost 80c x 5 redeemed = 400, B cost null x 2 -> missing; expect `knownCostCents: 400`, `programsMissingCost: 1`), `worthALook` contains `{kind:"gone-quiet",count}` only when `goneQuiet > 0` and `{kind:"one-away"}` only when `near.oneAway > 0`, `programs` passed through, `trend` from `splitTrend`.

- [ ] **Step 2-4: fail, implement, pass.** `worthALook` order: gone-quiet first, then one-away, then two-away; drop any with count 0.

- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): buildCostView + buildOverviewModel"`

---

### Task 5: presentational components (server) - briefing, worth-a-look, recent-activity, reward-cost-panel, your-programs

**Files:** `src/app/dashboard/overview/{briefing,worth-a-look,recent-activity,reward-cost-panel,your-programs}.tsx` + a `*.dom.test.tsx` each.

Each takes plain props derived from `OverviewModel` (no data fetching, no `"use client"` unless noted). Style with `ElevatedCard`, `globals.css` tokens, and the mockup's layout. Test each with RTL + plain props.

- [ ] **`briefing.tsx`** - `<Briefing text={model.briefing} />`. Renders a `<p>` with the lead number styled (wrap the leading integer token in a `<span className="font-[var(--font-fraunces)] ...">` if present, else plain). Test: renders the text; no `\u2014`.
- [ ] **`worth-a-look.tsx`** - `<WorthALook items={model.worthALook} serveHref={...} />`. Each item is a `next/link` to `/dashboard/customers?seg=<segment>`:
  - `gone-quiet` -> `?seg=lapsed`, dot tone "warn", strong text `"{count} regular(s) have gone quiet"`, sub `"Weekly customers, not in for about three weeks. A message brings most back."`
  - `one-away` -> `?seg=ready`, dot tone "gold", strong `"{count} are one stamp from a reward"`, sub `"They will be in soon to claim it. A planned cost, and a near-certain visit."`
  - `two-away` -> `?seg=ready`, strong `"{count} are two stamps away"`, sub `"Close enough to nudge."`
    Renders nothing (`return null`) when `items` is empty. Test: 2 items render 2 links with correct hrefs; empty -> nothing.
- [ ] **`recent-activity.tsx`** - `<RecentActivity rows={rows} />`, `rows: VendorActivityRow[]` (already mapped). Show up to 6. Per row: a kind mark (visit/reward/first-visit), masked phone (`maskPhone(row.phone)` - add a tiny pure helper in `@/lib/phone` if none exists: last 4 digits replaced with bullets, e.g. `"9123 ****"` -> keep first 4, mask rest; check `phone.ts` first), a meta line (`row.label` plus reward text / cost tag when `row.isReward` and a cost is knowable - if cost is not on the row, just show the label), relative time (`formatSgtDateTime` or a relative formatter - reuse whatever `activity-table.tsx` uses), and a "Serve" `Link` to `/dashboard/counter?p=<program>&phone=<phone>` for non-reward rows. Link to full Activity in the section header. Test: renders N rows capped at 6, a reward row shows the reward wording, a visit row shows a Serve link.
- [ ] **`reward-cost-panel.tsx`** - `<RewardCostPanel cost={model.cost} manageHref="/setup" />`. Header `"What the rewards cost this month"`. Three summary rows (mockup lines 687-689):
  - `"{rewardsThisMonth} rewards redeemed"` with value `formatSgd(knownCostCents)` when `programsMissingCost === 0`, else value `"{formatSgd(knownCostCents)}+"` and a sub note `"{programsMissingCost} program(s) have no cost set"` linking to `/setup`.
  - `"{pendingReturnSoon} pending, expect them back soon"` (no value).
  - `"{expiredUnclaimed} expired unclaimed"`, muted.
  - A `<details>` "Breakdown" showing `perProgram` rows: `"{redeemed} x {rewardText}"`, `"{formatSgd(unitCents)} ea"` or `"cost not set"`, line total `formatSgd(lineCents)` or blank. A "Set what each reward costs you" link to `/setup` inside.
    Server component, `<details>`/`<summary>` for the disclosure (no client JS). Test: summary rows render with the right numbers; missing-cost note appears only when `programsMissingCost > 0`; breakdown lists every program.
- [ ] **`your-programs.tsx`** - `<YourPrograms programs={model.programs} />`. Render nothing when `programs.length < 2`. Per program: a color seed dot (derive from program type via a small map, or index), name, `"{returnRatePct}% come back"` (or `"not enough data"` when `returnRate == null`), an Edit `Link` to `/setup?id=<id>`, a Serve `Link` to `/dashboard/counter?p=<id>`. An "Add another program" `Link` to `/setup` respecting `canCreateProgram` is Phase 2; for now always link to `/setup`. Test: 1 program -> nothing; 2 programs -> 2 rows with edit + serve links; `null` return rate shows the fallback copy.

- [ ] **Commit after each component + its test passes** (or batch the 5 into one commit if the reviewer prefers - they are same-shape). Suggested: `git commit -m "feat(dashboard): Overview presentational components"`

---

### Task 6: `base-strip.tsx` (client, InfoTooltip)

**Files:** `src/app/dashboard/overview/base-strip.tsx`, `base-strip.dom.test.tsx`

**Interfaces:**

- `<BaseStrip stats={model.baseStats} redemptionRatePct={n} returnRatePct={n | null} />`
- `"use client"`. Each `BaseStat` renders as a tile: `display` (tabular, tone class), `label`, and an `InfoTooltip` from `@merqo/ui` with `trigger="tap"` whose `content` is a formatted card: `<strong>{title}</strong>`, `<p>{body}</p>`, `<p class="muted">{hint}</p>`. The whole tile is the tooltip trigger (pass the tile content as the tooltip's rendered trigger, or place the `InfoTooltip` icon-button in the tile's label row via `StatTile`'s `deltaSlot`). Simplest: use `@merqo/ui` `StatTile` with `value={display}`, `label`, `deltaSlot={<InfoTooltip trigger="tap" content={...} ariaLabel={title} />}`, wrapped in `ElevatedCard`.
- Also render two read-only figures near the strip (spec: "redemption rate must be visible on the Overview", "% come back"): `"{redemptionRatePct}% redeem their reward"` and `"{returnRatePct ?? "--"}% come back within 90 days"`, each with its own `InfoTooltip trigger="tap"` explaining the definition (redemption rate = rewards redeemed / enrolled; return rate = of cards active in the last 90 days, the share with 2+ visits).

- [ ] **Step 1: Failing test** (`// @vitest-environment jsdom`) - render with a fixture `baseStats`; assert the 4 displays and labels are in the document; assert tapping a tile's info trigger reveals its `body` text (`fireEvent.click` the trigger by its `ariaLabel`, then `getByText(body)`); assert `"% redeem"` and `"% come back"` render; assert no `\u2014`.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): Overview base stat strip with tap-to-explain"`

---

### Task 7: `visits-trend.tsx` (client, responsive 7/14)

**Files:** `src/app/dashboard/overview/visits-trend.tsx`, `visits-trend.dom.test.tsx`

**Interfaces:**

- `<VisitsTrend bars7={...} bars14={...} deltaVsLastWeek={n} />`
- `"use client"`. Uses `window.matchMedia("(min-width: 56rem)")` in a `useState` + `useEffect` (with a listener) to pick `bars14` on wide screens, `bars7` otherwise. SSR-safe default: `bars7` (mobile-first), so first paint has no layout shift on phones.
- Renders a div-bar strip like `stats/visits-chart.tsx` (reuse its exact bar markup: `flex h-24 items-end gap-[3px]`, `rounded-t bg-primary/70`, `border-t` baseline, first/last `formatShortDate` labels). On the 14-bar view, render the first 7 bars at `bg-primary/30` (prior week, muted) and the last 7 at `bg-primary/70`.
- Caption: `"Visits, last 7 days"` / `"Visits, last 14 days"`. Delta pill: `deltaVsLastWeek === 0` -> hidden; `> 0` -> `"up {n} vs last week"` in the up tone; `< 0` -> `"down {abs} vs last week"`. Reuse `@merqo/ui` `DeltaPill` if its contract fits (`pct` is a percent though, not an absolute; if it does not fit, render a plain span, no em dash).
- Per-bar accessible label: `title={\`${formatShortDate(bar.date)}: ${bar.count}\`}`(touch has no hover, matches the`visits-chart.tsx` precedent).

- [ ] **Step 1: Failing test** - mock `matchMedia` (jsdom has no impl: `window.matchMedia = vi.fn().mockImplementation(q => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }))`). Assert: with `matches:false`, 7 bars render (`container.querySelectorAll` the bar class); caption says "last 7 days"; a positive delta shows "up N"; a zero delta hides the pill. Then a second test with `matches:true` -> 14 bars, caption "last 14 days".
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): responsive visits trend (7 bars phone, 14 wide)"`

---

### Task 8: `serve-cta.tsx` (client, last-used program)

**Files:** `src/app/dashboard/serve-cta.tsx`, `serve-cta.dom.test.tsx`

**Interfaces:**

- `<ServeCta defaultProgramId={string} programIds={string[]} />`
- `"use client"`. On mount reads `localStorage.getItem("loopkit:last-counter-program")` inside `try/catch`; if it is one of `programIds`, that is the target, else `defaultProgramId`. Renders a `next/link`-styled `<Link href={\`/dashboard/counter?p=${target}\`}>`with the mockup's circle-plus icon and label "Serve a customer". Until mount resolves, link to`defaultProgramId` (no fl?icker: it is a valid target).
- The Counter page (sub-plan 4) is responsible for _writing_ that key. This component only reads.

- [ ] **Step 1: Failing test** (jsdom) - `localStorage.setItem` a valid id -> link href points at it; an id not in `programIds` -> falls back to `defaultProgramId`; `localStorage` throwing (stub `getItem` to throw) -> falls back, no crash.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): Serve a customer CTA with last-used program memory"`

---

### Task 9: rewrite `page.tsx` + its test

**Files:** `src/app/dashboard/page.tsx`, `src/app/dashboard/dashboard-page.dom.test.tsx`

**Interfaces:**

- Consumes: everything above, plus `getVendorStats`, `returnRate90d`, `regularsGoneQuiet`, `cardsNearReward`, `countExpiredVouchers` from `@/lib/stats`; `listActivity` from `@/lib/activity`; `listPrograms` from `@/lib/program`; `requireVendor`, `applyDueCutovers`.

- [ ] **Step 1: Write the page**
  - `requireVendor()`, `applyDueCutovers()`.
  - `const programs = await listPrograms();` - `if (programs.length === 0) redirect("/setup");` (keep the true-first-run redirect).
  - `const programIds = programs.map(p => p.id);`
  - Fetch in `Promise.all`: `getVendorStats(programIds)`, `countExpiredVouchers(programIds)`, `listActivity({ programIds, limit: 6, offset: 0 })`, and the raw activity events + cards needed for `returnRate90d` / `regularsGoneQuiet` / `cardsNearReward` / per-program return rate / active-card counts / rewards-this-month.
  - **The raw reads:** `returnRate90d` and `regularsGoneQuiet` need `{ card_id, kind, created_at }[]` (activity events, classified). `cardsNearReward` needs `{ stamp_count }[]` per program with that program's `stamps_required`. `getVendorStats` already fetches cards+events internally but does not expose them. **Ruling:** add one thin exported impure helper to `stats.ts` - `getVendorOverviewInputs(programIds): Promise<{ activityEvents; cards: {id;program_id;stamp_count;created_at}[]; rewardEvents }>` - that does the same cards+events query `getVendorStats` does but returns the classified arrays plus `stamp_count`/`program_id` on cards. Then `getVendorStats` and this helper can share a private fetch function. Keep `getVendorStats`'s public shape unchanged. Cover the new helper with a `stats.test.ts` test (mock the Supabase client the same way `countExpiredVouchers`'s test does, or - simpler - make the pure split its own tested function and only smoke-test the shell). If sharing the fetch is fiddly, it is acceptable for this helper to issue its own query; note the choice in the ledger.
  - Compute `serveDefaultProgramId`: the program id with the most cards active in the last 30 days (from the cards+events data), else `programs[0].id`.
  - `regularsCount`: cards with 2+ lifetime activity events AND an event in the last 30 days (the spec's "Regular" definition). Compute inline from the activity events or add a pure `stats.ts` helper `countRegulars(activityEvents, nowMs)` with tests (preferred - it is a spec metric definition and deserves its own test).
  - `newThisMonth`: cards with `created_at >= ` the 1st of the current SGT month. Inline or a pure helper `countNewThisMonth(cards, nowMs)`.
  - `rewardsThisMonth` per program: reward events for that program's cards since the 1st. Compute from `rewardEvents` + a card->program map.
  - `buildOverviewModel({...})`.
  - Render: a `<ServeCta>` in the head row; then the layout:
    - Wrapper: `<div className="mx-auto max-w-[46rem] ... lg:max-w-none">` and, when `programs.length >= 2`, a `lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8`. Below `lg` or with 1 program: single column.
    - Left / main column: `<Briefing>`, `<BaseStrip>`, `<VisitsTrend>`, `<WorthALook>`, `<RecentActivity>`.
    - Right rail (or, single-column, continues below): `<RewardCostPanel>`, `<YourPrograms>`.
  - Empty-customers branch: if `stats.enrolled === 0`, render the briefing head + a single `ElevatedCard` "No customers yet. Share your join QR from the Counter to start enrolling." and the `<ServeCta>`. Skip the rest.
  - Keep `data-tour="shop-qr"` on some stable element for the onboarding tour anchor (`layout.tsx` still references it). Put it on the `<ServeCta>` wrapper or the cost panel. Verify `@/components/dashboard-tour` still resolves its step-1 anchor; if the tour copy names the QR specifically, update that copy in `dashboard-tour` (check `merqo-ui` `DashboardTour` - the steps may be passed from loopkit). Note any tour change in the ledger.

- [ ] **Step 2: Rewrite `dashboard-page.dom.test.tsx`** - mock `@/lib/stats`, `@/lib/activity`, `@/lib/program`, `@/features/auth`, `next/headers` and each `overview/*` component (render a stub div per component, as the current test stubs `ProgramCard` etc). Assert: the briefing text appears, the base strip stub appears, the visits trend stub appears, "Worth a look" content appears, the Serve CTA appears, and - with a 1-program mock - the "Your programs" block does NOT render; with a 2-program mock it does. Assert the zero-enrolled mock renders the empty card and skips the trend.

- [ ] **Step 3: Delete dead code** - `grep -rn "ScanAndRoute\|scan-and-route\|shouldShowQr" src` . If `page.tsx` was the only importer of `ScanAndRoute` and sub-plan 4 has not adopted it, delete `scan-and-route.tsx` + `scan-and-route.dom.test.tsx` and its README bullet. `shouldShowQr` is now unused (the QR block moved to the Counter) - if nothing else imports it, delete it + its tests + README bullet. If sub-plan 4 is not yet merged, leave `ShopQrBlock` in place (Counter uses it) and just remove the `page.tsx` usage. Record what you deleted in the ledger.

- [ ] **Step 4: `pnpm build` + `pnpm check` + `pnpm test`.** All green. `pnpm build` is mandatory here (client/server boundary: `base-strip`, `visits-trend`, `serve-cta` are client; `page.tsx` is server).

- [ ] **Step 5: Commit** - `git commit -m "feat(dashboard): rebuild /dashboard as the vendor Overview"`

---

### Task 10: CHANGELOG + READMEs

**Files:** `CHANGELOG.md`, `src/app/dashboard/README.md`, `src/lib/README.md` (if `stats.ts` gained helpers), `src/lib/stats.ts` folder README, root `README.md`.

- [ ] **Step 1: `CHANGELOG.md`** `## [Unreleased]` `### Changed`: `The dashboard home is now a vendor briefing (regulars and cadence, base stats that explain themselves on tap, a 7/14-day visits trend, "worth a look" actions, what the rewards cost this month, recent activity) instead of a program launcher.`
- [ ] **Step 2: `src/app/dashboard/README.md`** - rewrite the `page.tsx` bullet and add bullets for every new `overview/*` component and `serve-cta.tsx`; update the Connectivity paragraph; remove bullets for any deleted file.
- [ ] **Step 3: `src/lib/README.md`** - if `stats.ts` gained `countRegulars` / `countNewThisMonth` / `getVendorOverviewInputs`, note them on the `stats.ts` entry.
- [ ] **Step 4: Root `README.md`** - one running-narrative sentence: `Sub-plan 3 landed: /dashboard is now the vendor Overview (briefing, self-explaining base stats, visits trend, worth-a-look, reward-cost panel).`
- [ ] **Step 5: Commit** - `git commit -m "docs: Overview rebuild across CHANGELOG and folder READMEs"`

---

## Self-Review

- **Spec coverage:** briefing (Task 1), base strip with tap-to-explain + redemption rate + return rate (Tasks 3, 6), visits chart 7/14 non-scrollable (Task 7), "worth a look" gone-quiet + one/two-away (Tasks 4, 5), cost panel `rewards * reward_cost_cents` + breakage (Tasks 4, 5), recent activity as cost not confetti (Task 5), your-programs 2+ only (Task 5), Serve CTA last-used-program (Task 8), layout 1-col/<1024 vs two-zone/>=1024 & 2+ programs (Task 9), no em dashes (every task), ungated (no `isPro` anywhere). Covered.
- **Deferred with a ruling (in-plan):** prior-period cadence for the briefing's "sooner than last month" clause (pass `null`, omit the clause); multi-tier / per-product cost breakdown (one line per program). Both are Phase 3 per the spec.
- **Type consistency:** `OverviewModel` / `BaseStat` / `WorthALookItem` / `OverviewProgram` defined once in `dashboard-view.ts`, imported by every component. `returnRatePct` (rounded int, page side) vs `returnRate` (0..1, `OverviewProgram`) named distinctly.
- **Placeholder scan:** Task 9's raw-reads paragraph names the exact query and the fallback ruling; no "add appropriate fetching".

## Execution Handoff

Subagent-driven. Cheap model for Tasks 1-4 (pure, full code given), 10 (docs). Standard model for Tasks 5-9 (component + integration judgment). Task 9 is the integration task: standard model, and re-review carefully against the mockup.
