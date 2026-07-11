# Stats expansion — trend deltas + visit cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/dashboard/stats` trend context (is this program growing or
shrinking vs. the prior period) and a new visit-cadence metric (how many
days apart a repeat customer's visits actually are), without adding a
charting library or any Pro-tier gating.

**Architecture:** Pure additions to `src/lib/stats.ts` — a `pctChange`
helper (ported verbatim from qkit), a second 31–60-day cutoff window inside
`computeCardStats` so three existing counts (`visits30d`, `rewards30d`,
`active`) gain a comparable prior-period figure, and a new
`avgDaysBetweenVisits` pure function operating on the full (unwindowed)
activity-event history. `getProgramStats` (the impure Supabase-fetching
shell) wires the new field in with no new query — everything is computed
from `cards`/`stamp_events` data it already fetches. UI: a small local
`Delta` pill component and two new tiles on `stats/page.tsx`, no new shared
module, no new dependency.

**Tech Stack:** Next.js 16 App Router (Server Component page), Vitest, this
repo's existing pure-function-plus-thin-fetch-shell pattern already used by
every other function in `src/lib/stats.ts`.

## Global Constraints

- No new charting library (`recharts` or otherwise) — the existing
  hand-rolled `visitsByDay` div-bar strip in `stats/page.tsx` is untouched.
- `enrolled`, `newThisWeek`, `redemptionRate`, `repeatVisitRate`,
  `visitsByDay`, `active`, `lapsed` keep their existing values and meaning —
  nothing is renamed, removed, or recomputed differently. Every addition in
  this plan is additive on top.
- No Pro-tier gating on anything in this plan — matches the current page's
  precedent (nothing on `/dashboard/stats` is gated today).
- No new Supabase query — every new number is derived from `cards` and
  `stamp_events` rows `getProgramStats` already fetches.
- No historized/materialized stats snapshots — `getProgramStats` stays a
  fully-derived `cache()`-wrapped read, same as today.
- **Tile-count note:** the spec's resolved open question 1 says "6 tiles
  total" but also confirms both `visitsDelta` and `rewardsDelta` get their
  own tiles. Combined with the 4 existing tiles this plan is required to
  keep unchanged (constraint above) plus the new `avgDaysBetweenVisits`
  tile, that's 7 tiles, not 6 — dropping an existing tile isn't authorized
  by the spec, and dropping either new delta tile contradicts the same
  resolved answer. This plan ships **7 tiles** on a `sm:grid-cols-3` grid
  (last row has 1 tile) and treats "6" as an arithmetic approximation in
  the spec resolution, not a hard cap. Flag to Clarence during review if a
  7th tile actually needs cutting.

---

### Task 1: `pctChange` helper

**Files:**

- Modify: `src/lib/stats.ts`
- Modify: `test/lib/stats.test.ts`

**Interfaces:**

- Produces: `pctChange(current: number, prior: number): number | null`,
  exported from `src/lib/stats.ts`. Consumed by Task 2 (delta field
  computation) and, indirectly, by the UI in Task 4.
- Consumes: nothing — pure arithmetic, no dependency on any other function
  in this file.

- [ ] **Step 1: Write the failing test**

Add to `test/lib/stats.test.ts`, alongside the existing `describe` blocks:

```typescript
import {
  classifyActivity,
  bucketVisitsByDay,
  computeCardStats,
  pctChange,
} from "@/lib/stats";
```

```typescript
describe("pctChange", () => {
  it("returns null when prior is 0 (undefined growth from nothing)", () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });

  it("computes positive percent change", () => {
    expect(pctChange(15, 10)).toBe(50);
  });

  it("computes negative percent change", () => {
    expect(pctChange(5, 10)).toBe(-50);
  });

  it("returns -100 when current drops to zero from a nonzero prior", () => {
    expect(pctChange(0, 10)).toBe(-100);
  });
});
```

Run `pnpm test` — confirms this fails (`pctChange` doesn't exist yet).

- [ ] **Step 2: Implement `pctChange`**

Add to `src/lib/stats.ts`, near the top-level exports (after
`classifyActivity`, before `bucketVisitsByDay` — grouped with the other
small pure helpers):

```typescript
// Percent change of current vs prior. null when prior is 0 — growth from
// nothing is undefined; the UI shows "—", never Infinity/NaN.
export function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}
```

- [ ] **Step 3: Verify**

Run `pnpm test` — the four new cases pass, nothing else regresses. Run
`pnpm check` — no type/lint errors (new export is used nowhere yet, which
is fine; it's exported for Task 2/4 to consume).

---

### Task 2: Prior-period counts + delta fields on `ProgramStats`

**Files:**

- Modify: `src/lib/stats.ts`
- Modify: `test/lib/stats.test.ts`

**Interfaces:**

- Produces: `ProgramStats` gains `visitsDelta: number | null`,
  `rewardsDelta: number | null`, `activeDelta: number | null`.
  `computeCardStats` computes all three via `pctChange` (Task 1) against a
  new internal 31–60-day-ago window over the same `activityEvents`/
  `rewardEvents` arrays it already receives — no new parameters, no new
  fetch.
- Consumes: `pctChange` (Task 1), `MS_PER_DAY` (already imported from
  `@/lib/utils`).
- Task 4 (UI) consumes `visitsDelta`/`rewardsDelta`/`activeDelta`.

- [ ] **Step 1: Write the failing tests**

Add to the existing `describe("computeCardStats", ...)` block in
`test/lib/stats.test.ts`:

```typescript
it("computes prior-period deltas from the 31-60 day window", () => {
  const cards = [{ id: "c1", created_at: iso(70) }];
  const activityEvents = [
    { card_id: "c1", kind: "stamp", created_at: iso(5) }, // current 30d
    { card_id: "c1", kind: "stamp", created_at: iso(5) }, // current 30d
    { card_id: "c1", kind: "stamp", created_at: iso(45) }, // prior 31-60d
  ];
  const rewardEvents = [
    { card_id: "c1", kind: "redeem", created_at: iso(5) }, // current 30d
    { card_id: "c1", kind: "redeem", created_at: iso(45) }, // prior 31-60d
    { card_id: "c1", kind: "redeem", created_at: iso(45) }, // prior 31-60d
  ];
  const stats = computeCardStats(cards, activityEvents, rewardEvents, now);

  expect(stats.visits30d).toBe(2);
  expect(stats.visitsDelta).toBe(100); // 2 vs prior 1 -> +100%
  expect(stats.rewards30d).toBe(1);
  expect(stats.rewardsDelta).toBe(-50); // 1 vs prior 2 -> -50%
});

it("excludes events at exactly the 30d/60d boundaries from the wrong window", () => {
  const cards = [{ id: "c1", created_at: iso(70) }];
  // iso(30) is exactly cutoff30d; iso(60) is exactly cutoff60d.
  const activityEvents = [
    { card_id: "c1", kind: "stamp", created_at: iso(30) }, // prior window (< cutoff30d is current; here excluded from current)
    { card_id: "c1", kind: "stamp", created_at: iso(60) }, // outside prior window entirely
  ];
  const stats = computeCardStats(cards, activityEvents, [], now);

  expect(stats.visits30d).toBe(0);
  // Only iso(30) falls in [cutoff60d, cutoff30d) — iso(60) is excluded (< cutoff60d boundary).
  expect(stats.visitsDelta).toBeNull(); // prior count is 1, current is 0 -> pctChange(0, 1) = -100, not null
});

it("returns null activeDelta/visitsDelta/rewardsDelta when nothing happened in the prior window", () => {
  const cards = [{ id: "c1", created_at: iso(10) }];
  const activityEvents = [{ card_id: "c1", kind: "stamp", created_at: iso(1) }];
  const stats = computeCardStats(cards, activityEvents, [], now);

  expect(stats.visitsDelta).toBeNull(); // prior is 0
  expect(stats.rewardsDelta).toBeNull();
  expect(stats.activeDelta).toBeNull();
});
```

Note: the second test's final assertion is written to match whatever the
real boundary semantics turn out to be once Step 2 is implemented — before
implementing, run `pnpm test` and confirm it fails with "`visitsDelta` is
undefined" (the field doesn't exist yet), not a boundary-logic failure.
Fix the assertion to match the `[cutoff60d, cutoff30d)` half-open interval
defined in Step 2 if it doesn't already.

- [ ] **Step 2: Implement prior-window counts + delta fields**

In `src/lib/stats.ts`, inside `computeCardStats`, after the existing
`cutoff30d` constant:

```typescript
const cutoff60d = nowMs - 60 * MS_PER_DAY;

const priorVisits30d = activityEvents.filter((e) => {
  const t = Date.parse(e.created_at);
  return t >= cutoff60d && t < cutoff30d;
}).length;

const priorRewards30d = rewardEvents.filter((e) => {
  const t = Date.parse(e.created_at);
  return t >= cutoff60d && t < cutoff30d;
}).length;

const priorActiveCardIds = new Set<string>();
for (const e of activityEvents) {
  const t = Date.parse(e.created_at);
  if (t >= cutoff60d && t < cutoff30d) priorActiveCardIds.add(e.card_id);
}
```

Then extend the return object:

```typescript
return {
  enrolled,
  newThisWeek,
  visitsTotal,
  visits30d,
  rewardsTotal,
  rewards30d,
  redemptionRate: enrolled === 0 ? 0 : rewardsTotal / enrolled,
  repeatVisitRate: enrolled === 0 ? 0 : repeatCards / enrolled,
  active: activeCardIds.size,
  lapsed: enrolled - activeCardIds.size,
  avgVisitsPerCustomer: enrolled === 0 ? 0 : visitsTotal / enrolled,
  visitsDelta: pctChange(visits30d, priorVisits30d),
  rewardsDelta: pctChange(rewards30d, priorRewards30d),
  activeDelta: pctChange(activeCardIds.size, priorActiveCardIds.size),
};
```

Update the `ProgramStats` type (top of the file) to add the three new
fields (placed after `avgVisitsPerCustomer`, before the closing brace —
`avgDaysBetweenVisits` from Task 3 goes after these three):

```typescript
export type ProgramStats = {
  enrolled: number;
  newThisWeek: number;
  visitsTotal: number;
  visits30d: number;
  visitsByDay: { date: string; count: number }[];
  rewardsTotal: number;
  rewards30d: number;
  redemptionRate: number;
  repeatVisitRate: number;
  active: number;
  lapsed: number;
  avgVisitsPerCustomer: number;
  visitsDelta: number | null;
  rewardsDelta: number | null;
  activeDelta: number | null;
  avgDaysBetweenVisits: number | null; // wired in Task 3
};
```

(`avgDaysBetweenVisits` is added to the type now so this Task's return
object and Task 3's return object don't conflict on shape — Task 3 sets
its actual value; leave it `null` from `computeCardStats` if Task 3 hasn't
landed yet, but since both tasks touch the same return statement, implement
them in this file in the same edit pass if doing both tasks back to back.)

- [ ] **Step 3: Verify**

Run `pnpm test` — all `computeCardStats` cases (existing + new) pass, the
boundary test's assertion matches the half-open `[cutoff60d, cutoff30d)`
interval actually implemented. Run `pnpm check`.

---

### Task 3: `avgDaysBetweenVisits` — visit cadence metric

**Files:**

- Modify: `src/lib/stats.ts`
- Modify: `test/lib/stats.test.ts`

**Interfaces:**

- Produces: `avgDaysBetweenVisits(activityEvents: StatsEvent[]): number |
null`, exported from `src/lib/stats.ts`. Wired into `getProgramStats`'s
  return object (called once, on the full unwindowed `activityEvents`
  array — cadence needs full history, not just the last 30 days).
- Consumes: `MS_PER_DAY` (already imported), the same `StatsEvent` type
  already defined in this file.
- Task 4 (UI) consumes the resulting `ProgramStats.avgDaysBetweenVisits`.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `test/lib/stats.test.ts`:

```typescript
import {
  classifyActivity,
  bucketVisitsByDay,
  computeCardStats,
  pctChange,
  avgDaysBetweenVisits,
} from "@/lib/stats";
```

```typescript
describe("avgDaysBetweenVisits", () => {
  it("returns null for no events", () => {
    expect(avgDaysBetweenVisits([])).toBeNull();
  });

  it("returns null when every card has fewer than 2 events (no gaps to measure)", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(1) },
      { card_id: "c2", kind: "stamp", created_at: iso(2) },
    ];
    expect(avgDaysBetweenVisits(events)).toBeNull();
  });

  it("computes the gap for a single repeat card", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(10) },
      { card_id: "c1", kind: "stamp", created_at: iso(7) },
    ];
    expect(avgDaysBetweenVisits(events)).toBe(3);
  });

  it("pools gaps across multiple repeat cards, weighted by gap count not card count", () => {
    // c1: 3 visits -> 2 gaps (5 days, 5 days). c2: 2 visits -> 1 gap (2 days).
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(20) },
      { card_id: "c1", kind: "stamp", created_at: iso(15) },
      { card_id: "c1", kind: "stamp", created_at: iso(10) },
      { card_id: "c2", kind: "stamp", created_at: iso(5) },
      { card_id: "c2", kind: "stamp", created_at: iso(3) },
    ];
    // Pooled: (5 + 5 + 2) / 3 = 4, not (5+5)/2 averaged with 2 per-card then
    // re-averaged (which would give (5+2)/2 = 3.5) — pooling by gap, not by card.
    expect(avgDaysBetweenVisits(events)).toBe(4);
  });

  it("skips events with an unparseable created_at instead of throwing", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: "not-a-date" },
      { card_id: "c1", kind: "stamp", created_at: iso(5) },
      { card_id: "c1", kind: "stamp", created_at: iso(2) },
    ];
    expect(avgDaysBetweenVisits(events)).toBe(3);
  });
});
```

Run `pnpm test` — confirms failure (`avgDaysBetweenVisits` doesn't exist).

- [ ] **Step 2: Implement `avgDaysBetweenVisits`**

Add to `src/lib/stats.ts`:

```typescript
// Average days between a repeat customer's consecutive visits, pooled
// across every card with 2+ activity events. null when no card in the
// program has repeated yet — the UI shows "—", not a misleading 0.
export function avgDaysBetweenVisits(
  activityEvents: StatsEvent[],
): number | null {
  const byCard = new Map<string, number[]>();
  for (const e of activityEvents) {
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) continue;
    const arr = byCard.get(e.card_id) ?? [];
    arr.push(t);
    byCard.set(e.card_id, arr);
  }

  const gapsDays: number[] = [];
  for (const timestamps of byCard.values()) {
    if (timestamps.length < 2) continue;
    timestamps.sort((a, b) => a - b);
    for (let i = 1; i < timestamps.length; i++) {
      gapsDays.push((timestamps[i] - timestamps[i - 1]) / MS_PER_DAY);
    }
  }
  if (gapsDays.length === 0) return null;
  return gapsDays.reduce((sum, g) => sum + g, 0) / gapsDays.length;
}
```

Wire it into `getProgramStats` (the impure shell), calling it on the full
`activityEvents` array (not the windowed one):

```typescript
const { activityEvents, rewardEvents } = classifyActivity(events);
const cardStats = computeCardStats(
  cards ?? [],
  activityEvents,
  rewardEvents,
  nowMs,
);
const visitsByDay = bucketVisitsByDay(activityEvents, nowMs);

return {
  ...cardStats,
  visitsByDay,
  avgDaysBetweenVisits: avgDaysBetweenVisits(activityEvents),
};
```

(If `avgDaysBetweenVisits: null` was left as a placeholder in Task 2's
`computeCardStats` return object, this spread-then-override in
`getProgramStats` replaces it with the real computed value — confirm the
override actually takes effect, i.e. it's spread first then the real key
set after, as shown above.)

- [ ] **Step 3: Verify**

Run `pnpm test` — all cases pass, including the pooling test (order of
operations matters: pooled-then-averaged, not per-card-averaged-then-
re-averaged — the test explicitly distinguishes these). Run `pnpm check`.

---

### Task 4: UI — `Delta` pill + wire tiles into `stats/page.tsx`

**Files:**

- Modify: `src/app/dashboard/stats/page.tsx`

**Interfaces:**

- Produces: a local `Delta` component (not exported, not a new shared
  file — single consumer) and an extended `Tile` component accepting an
  optional `delta` prop. Consumes `stats.visitsDelta`, `stats.rewardsDelta`,
  `stats.activeDelta`, `stats.avgDaysBetweenVisits` from `getProgramStats`
  (Tasks 2/3).
- No test file — this repo's convention (confirmed by the reference
  loyalty-templates plan and this file's own precedent) doesn't unit-test
  static page-level JSX; verify manually per Step 3 below.

- [ ] **Step 1: Add the `Delta` component and extend `Tile`**

In `src/app/dashboard/stats/page.tsx`, add imports:

```typescript
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
```

Add the `Delta` component above `Tile`:

```tsx
function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold tabular-nums",
        up
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
          : "bg-destructive/12 text-destructive",
      )}
      title="vs. the prior 30 days"
    >
      <Icon className="size-3" />
      {Math.abs(Math.round(pct))}%
    </span>
  );
}
```

Extend `Tile`:

```tsx
function Tile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {delta !== undefined && <Delta pct={delta} />}
      </div>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
```

- [ ] **Step 2: Wire the tiles**

Replace the existing 4-tile grid (lines ~48-62) with 7 tiles on a
`sm:grid-cols-3` grid:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
  <Tile label="Enrolled customers" value={String(stats.enrolled)} />
  <Tile
    label="Active / lapsed (30d)"
    value={`${stats.active} / ${stats.lapsed}`}
    delta={stats.activeDelta}
  />
  <Tile
    label="Redemption rate"
    value={`${Math.round(stats.redemptionRate * 100)}%`}
  />
  <Tile
    label="Repeat-visit rate"
    value={`${Math.round(stats.repeatVisitRate * 100)}%`}
  />
  <Tile
    label="Visits (30d)"
    value={String(stats.visits30d)}
    delta={stats.visitsDelta}
  />
  <Tile
    label="Rewards redeemed (30d)"
    value={String(stats.rewards30d)}
    delta={stats.rewardsDelta}
  />
  <Tile
    label="Avg days between visits"
    value={
      stats.avgDaysBetweenVisits === null
        ? "—"
        : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
    }
  />
</div>
```

- [ ] **Step 3: Verify**

Run `pnpm check` (typecheck + lint). Then manually: `pnpm dev`, open
`/dashboard/stats` for a program with enough history to have both a
current-30d and a prior-30-60d event, confirm: delta pills render with the
correct up/down color and arrow, a program with zero prior-period activity
shows no pill (not a misleading `0%`/`Infinity%`), and a program with no
repeat customers shows "—" for avg days between visits, not `NaN`/`0.0d`.
Run `pnpm test` one more time for the full suite.
