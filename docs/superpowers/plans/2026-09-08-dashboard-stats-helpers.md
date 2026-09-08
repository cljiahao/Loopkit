# Dashboard stats helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three pure functions to `src/lib/stats.ts` that the rebuilt Overview needs: a 90-day return rate, a "regulars gone quiet" list, and a "near reward" count.

**Architecture:** Pure functions in the existing `stats.ts` module, alongside `avgDaysBetweenVisits` / `pctChange`. No DB access, no wall clock (caller passes `now` in ms). Tested in `test/lib/stats.test.ts` with the existing `iso(daysAgo)` fixture helper. No wiring into any page or fetch function in this plan — that is Plan 3.

**Tech Stack:** TypeScript (strict), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-vendor-dashboard-redesign-design.md`

## Global Constraints

- Pin exact dependency versions (no new deps expected in this plan).
- No em dashes in code, comments, or copy. Period, comma, colon, or parentheses.
- TypeScript strict: no `any`, no `@ts-ignore`.
- Pure helpers take `now: number` (ms). Never `Date.now()` inside them.
- Skip events with an unparseable `created_at` (`!Number.isFinite(Date.parse(...))`), never throw. Mirror `avgDaysBetweenVisits`.
- `null` for "not enough data to have an opinion" (mirror `avgDaysBetweenVisits` / `pctChange`), never a misleading `0`.
- CI gate: changed-line coverage >= 80%. Every function ships its own tests.
- The PR touches `CHANGELOG.md` under `## [Unreleased]`.
- Currency SGD; not relevant to this plan (no money here).

## Context the implementer needs

- `src/lib/stats.ts` already imports `MS_PER_DAY` from `@/lib/utils` (value `86_400_000`).
- `StatsEvent` type in `src/lib/stats.ts` (near line 28): `{ card_id: string; kind: string; created_at: string; payload?: unknown }`.
- `test/lib/stats.test.ts` fixtures (top of file):
  ```typescript
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 6, 10, 4, 0, 0); // 2026-07-10 12:00 SGT
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
  ```
  and events are written inline as `{ card_id, kind, created_at: iso(n) }`.
- Run a single test: `pnpm test -- test/lib/stats.test.ts -t "returnRate90d"` (vitest `-t` filters by name).
- Run the file: `pnpm test -- test/lib/stats.test.ts`.
- Typecheck: `pnpm exec tsc --noEmit`.
- Full check before commit: `pnpm check` (prettier + eslint + tsc).

---

### Task 1: `returnRate90d`

**Files:**
- Modify: `src/lib/stats.ts` (add an exported function near `avgDaysBetweenVisits`, ~line 104)
- Test: `test/lib/stats.test.ts` (add a `describe` block, e.g. after the `avgDaysBetweenVisits` block ~line 258)

**Interfaces:**
- Consumes: `MS_PER_DAY` (already imported), `StatsEvent` type (already declared).
- Produces:
  ```typescript
  export function returnRate90d(
    activityEvents: StatsEvent[],
    nowMs: number,
  ): number | null
  ```
  Returns the fraction (0..1) of cards active in the last 90 days that have 2+ lifetime activity events. `null` when no card is 90-day-active. Definition: a card is "90-day-active" if its most recent event is `>= nowMs - 90 * MS_PER_DAY`. Denominator is 90-day-active cards only, never all-time card count.

- [ ] **Step 1: Write the failing tests**

Add to `test/lib/stats.test.ts`, importing `returnRate90d` in the existing `import { ... } from "@/lib/stats"` block:

```typescript
describe("returnRate90d", () => {
  it("returns null when no card has an event in the last 90 days", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(120) },
      { card_id: "c1", kind: "stamp", created_at: iso(100) },
    ];
    expect(returnRate90d(events, now)).toBeNull();
  });

  it("returns null for no events at all", () => {
    expect(returnRate90d([], now)).toBeNull();
  });

  it("counts a 90-day-active card with 2+ lifetime events as a returner", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(200) },
      { card_id: "c1", kind: "stamp", created_at: iso(10) },
    ];
    expect(returnRate90d(events, now)).toBe(1);
  });

  it("excludes a 90-day-active card with only one lifetime event from the numerator", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(200) },
      { card_id: "c1", kind: "stamp", created_at: iso(10) }, // returner
      { card_id: "c2", kind: "stamp", created_at: iso(5) }, // active, single visit
    ];
    expect(returnRate90d(events, now)).toBe(0.5);
  });

  it("excludes cards whose latest event is older than 90 days from the denominator", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(10) },
      { card_id: "c1", kind: "stamp", created_at: iso(5) }, // 90d-active returner
      { card_id: "c2", kind: "stamp", created_at: iso(150) },
      { card_id: "c2", kind: "stamp", created_at: iso(100) }, // repeat but stale, excluded
    ];
    expect(returnRate90d(events, now)).toBe(1);
  });

  it("treats a card whose latest event is exactly 90 days old as active (half-open at the far edge)", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(120) },
      { card_id: "c1", kind: "stamp", created_at: iso(90) },
    ];
    expect(returnRate90d(events, now)).toBe(1);
  });

  it("skips events with an unparseable created_at instead of throwing", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: "not-a-date" },
      { card_id: "c1", kind: "stamp", created_at: iso(20) },
      { card_id: "c1", kind: "stamp", created_at: iso(10) },
    ];
    expect(returnRate90d(events, now)).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/lib/stats.test.ts -t "returnRate90d"`
Expected: FAIL — `returnRate90d is not a function` / import error.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/stats.ts` after `avgDaysBetweenVisits` (before `computeCardStats`):

```typescript
// Of cards active in the last 90 days (latest activity event within the
// window), the fraction that have 2 or more lifetime activity events. This
// is the vendor-facing "% come back" headline. The denominator is
// 90-day-active cards, not all-time enrolled: a long-dead card is not
// evidence the program stopped working, so it must not drag the rate down.
// null when no card is 90-day-active (mirrors avgDaysBetweenVisits' null
// convention: no signal, not a misleading 0).
export function returnRate90d(
  activityEvents: StatsEvent[],
  nowMs: number,
): number | null {
  const cutoff90 = nowMs - 90 * MS_PER_DAY;
  const byCard = new Map<string, { total: number; latest: number }>();
  for (const e of activityEvents) {
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) continue;
    const cur = byCard.get(e.card_id) ?? { total: 0, latest: 0 };
    cur.total += 1;
    if (t > cur.latest) cur.latest = t;
    byCard.set(e.card_id, cur);
  }

  let active = 0;
  let returners = 0;
  for (const { total, latest } of byCard.values()) {
    if (latest < cutoff90) continue;
    active += 1;
    if (total >= 2) returners += 1;
  }
  return active === 0 ? null : returners / active;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/lib/stats.test.ts -t "returnRate90d"`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts test/lib/stats.test.ts
git commit -m "feat(stats): add returnRate90d helper for the Overview return-rate headline"
```

---

### Task 2: `regularsGoneQuiet`

**Files:**
- Modify: `src/lib/stats.ts` (add after `returnRate90d`)
- Test: `test/lib/stats.test.ts` (add a `describe` block after the `returnRate90d` block)

**Interfaces:**
- Consumes: `MS_PER_DAY`, `StatsEvent`.
- Produces:
  ```typescript
  export function regularsGoneQuiet(
    activityEvents: StatsEvent[],
    nowMs: number,
  ): { count: number; cardIds: string[] }
  ```
  A card qualifies when it has 3+ lifetime activity events AND its latest event is between 40 and 21 days ago: `latest >= nowMs - 40 * MS_PER_DAY` AND `latest < nowMs - 21 * MS_PER_DAY`. `cardIds` order follows first-seen order in `activityEvents`. `count === cardIds.length`.

- [ ] **Step 1: Write the failing tests**

Add to `test/lib/stats.test.ts`, adding `regularsGoneQuiet` to the `@/lib/stats` import:

```typescript
describe("regularsGoneQuiet", () => {
  it("returns an empty result for no events", () => {
    expect(regularsGoneQuiet([], now)).toEqual({ count: 0, cardIds: [] });
  });

  it("flags a card with 3+ events whose last visit is in the 21-to-40-day window", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(50) },
      { card_id: "c1", kind: "stamp", created_at: iso(45) },
      { card_id: "c1", kind: "stamp", created_at: iso(30) },
    ];
    expect(regularsGoneQuiet(events, now)).toEqual({
      count: 1,
      cardIds: ["c1"],
    });
  });

  it("excludes a card with only 2 lifetime events (not a regular)", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(45) },
      { card_id: "c1", kind: "stamp", created_at: iso(30) },
    ];
    expect(regularsGoneQuiet(events, now)).toEqual({ count: 0, cardIds: [] });
  });

  it("excludes a card last seen 20 days ago (still recent, not quiet yet)", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(60) },
      { card_id: "c1", kind: "stamp", created_at: iso(40) },
      { card_id: "c1", kind: "stamp", created_at: iso(20) },
    ];
    expect(regularsGoneQuiet(events, now)).toEqual({ count: 0, cardIds: [] });
  });

  it("excludes a card last seen 50 days ago (past the window, likely gone)", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: iso(70) },
      { card_id: "c1", kind: "stamp", created_at: iso(60) },
      { card_id: "c1", kind: "stamp", created_at: iso(50) },
    ];
    expect(regularsGoneQuiet(events, now)).toEqual({ count: 0, cardIds: [] });
  });

  it("includes a card last seen exactly 40 days ago, excludes one exactly 21 days ago", () => {
    const events = [
      { card_id: "at40", kind: "stamp", created_at: iso(80) },
      { card_id: "at40", kind: "stamp", created_at: iso(60) },
      { card_id: "at40", kind: "stamp", created_at: iso(40) },
      { card_id: "at21", kind: "stamp", created_at: iso(80) },
      { card_id: "at21", kind: "stamp", created_at: iso(60) },
      { card_id: "at21", kind: "stamp", created_at: iso(21) },
    ];
    expect(regularsGoneQuiet(events, now)).toEqual({
      count: 1,
      cardIds: ["at40"],
    });
  });

  it("skips events with an unparseable created_at", () => {
    const events = [
      { card_id: "c1", kind: "stamp", created_at: "bad" },
      { card_id: "c1", kind: "stamp", created_at: iso(50) },
      { card_id: "c1", kind: "stamp", created_at: iso(45) },
      { card_id: "c1", kind: "stamp", created_at: iso(30) },
    ];
    expect(regularsGoneQuiet(events, now)).toEqual({
      count: 1,
      cardIds: ["c1"],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/lib/stats.test.ts -t "regularsGoneQuiet"`
Expected: FAIL — not a function.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/stats.ts` after `returnRate90d`:

```typescript
// Cards worth a win-back nudge: 3 or more lifetime activity events (a real
// regular, not a one-time visitor) whose latest event is 21 to 40 days ago.
// The window is bounded on both sides: under 21 days is still recent, past
// ~45 days the customer has usually churned and the nudge is low-ROI.
// cardIds follow first-seen order in the input.
export function regularsGoneQuiet(
  activityEvents: StatsEvent[],
  nowMs: number,
): { count: number; cardIds: string[] } {
  const earliest = nowMs - 40 * MS_PER_DAY;
  const latestCutoff = nowMs - 21 * MS_PER_DAY;
  const byCard = new Map<string, { total: number; latest: number }>();
  const order: string[] = [];
  for (const e of activityEvents) {
    const t = Date.parse(e.created_at);
    if (!Number.isFinite(t)) continue;
    let cur = byCard.get(e.card_id);
    if (!cur) {
      cur = { total: 0, latest: 0 };
      byCard.set(e.card_id, cur);
      order.push(e.card_id);
    }
    cur.total += 1;
    if (t > cur.latest) cur.latest = t;
  }

  const cardIds: string[] = [];
  for (const id of order) {
    const { total, latest } = byCard.get(id)!;
    if (total >= 3 && latest >= earliest && latest < latestCutoff) {
      cardIds.push(id);
    }
  }
  return { count: cardIds.length, cardIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/lib/stats.test.ts -t "regularsGoneQuiet"`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts test/lib/stats.test.ts
git commit -m "feat(stats): add regularsGoneQuiet helper for the Overview win-back list"
```

---

### Task 3: `cardsNearReward`

**Files:**
- Modify: `src/lib/stats.ts` (add after `regularsGoneQuiet`)
- Test: `test/lib/stats.test.ts` (add a `describe` block after the `regularsGoneQuiet` block)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```typescript
  export function cardsNearReward(
    cards: { stamp_count: number }[],
    stampsRequired: number,
  ): { oneAway: number; twoAway: number }
  ```
  `oneAway` = count where `stamp_count === stampsRequired - 1`. `twoAway` = count where `stamp_count === stampsRequired - 2`. A card already at or past `stampsRequired` is neither (it is reward-ready, a separate state). A card at `stampsRequired - 3` or fewer is neither.

- [ ] **Step 1: Write the failing tests**

Add to `test/lib/stats.test.ts`, adding `cardsNearReward` to the `@/lib/stats` import:

```typescript
describe("cardsNearReward", () => {
  it("returns zeroes for no cards", () => {
    expect(cardsNearReward([], 8)).toEqual({ oneAway: 0, twoAway: 0 });
  });

  it("counts cards exactly one and exactly two stamps short", () => {
    const cards = [
      { stamp_count: 7 }, // one away
      { stamp_count: 7 }, // one away
      { stamp_count: 6 }, // two away
      { stamp_count: 5 }, // three away, neither
      { stamp_count: 8 }, // reward-ready, neither
      { stamp_count: 0 }, // fresh, neither
    ];
    expect(cardsNearReward(cards, 8)).toEqual({ oneAway: 2, twoAway: 1 });
  });

  it("does not count a card past the threshold", () => {
    expect(cardsNearReward([{ stamp_count: 9 }], 8)).toEqual({
      oneAway: 0,
      twoAway: 0,
    });
  });

  it("handles a small threshold where two-away is stamp_count 1", () => {
    const cards = [{ stamp_count: 2 }, { stamp_count: 1 }, { stamp_count: 0 }];
    expect(cardsNearReward(cards, 3)).toEqual({ oneAway: 1, twoAway: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- test/lib/stats.test.ts -t "cardsNearReward"`
Expected: FAIL — not a function.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/stats.ts` after `regularsGoneQuiet`:

```typescript
// How many cards are one or two stamps short of the reward. The one-away
// count is the hottest win the vendor has: a near-certain next visit at
// almost zero marginal cost. A card at or past the threshold is
// reward-ready, a separate state, and is not counted here.
export function cardsNearReward(
  cards: { stamp_count: number }[],
  stampsRequired: number,
): { oneAway: number; twoAway: number } {
  let oneAway = 0;
  let twoAway = 0;
  for (const c of cards) {
    if (c.stamp_count === stampsRequired - 1) oneAway += 1;
    else if (c.stamp_count === stampsRequired - 2) twoAway += 1;
  }
  return { oneAway, twoAway };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- test/lib/stats.test.ts -t "cardsNearReward"`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stats.ts test/lib/stats.test.ts
git commit -m "feat(stats): add cardsNearReward helper for the Overview near-reward count"
```

---

### Task 4: Changelog and README

**Files:**
- Modify: `CHANGELOG.md`
- Modify (only if its `stats.ts` line no longer fits): `src/lib/README.md`

**Interfaces:**
- Consumes: the three functions from Tasks 1 to 3.
- Produces: nothing importable.

- [ ] **Step 1: Add the changelog entry**

Under `## [Unreleased]`, in an `### Added` subsection (create it above `### Changed` if absent, Keep a Changelog order is Added / Changed / Deprecated / Removed / Fixed):

```markdown
### Added

- `src/lib/stats.ts` gains three pure helpers for the vendor dashboard
  Overview: `returnRate90d` (share of 90-day-active customers who are
  repeat visitors), `regularsGoneQuiet` (regulars whose last visit is 21
  to 40 days ago, worth a win-back nudge), and `cardsNearReward` (cards
  one or two stamps short of the reward).
```

- [ ] **Step 2: Check the lib README**

Run: `grep -n "stats" src/lib/README.md`

If the `stats.ts` line already describes it as vendor-facing metrics /
stats aggregation, no change is needed (the new helpers are internal to
that same responsibility). If the line is a bare filename with no real
description, update it to a one-line description of what `stats.ts` does,
matching the style of the other entries. Do not add per-function detail.

- [ ] **Step 3: Full check**

Run: `pnpm check`
Expected: prettier clean, eslint clean, tsc clean.

- [ ] **Step 4: Run the whole stats test file**

Run: `pnpm test -- test/lib/stats.test.ts`
Expected: all pass, including the pre-existing tests (no regression).

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md src/lib/README.md
git commit -m "docs(stats): note the new Overview helper functions"
```

---

## Self-Review

**Spec coverage:** This plan implements the "Metric definitions" section of
the spec (return rate, gone-quiet, near-reward) as pure functions. The
redemption-rate and new-this-month metrics named in the spec already exist
in `stats.ts` (`redemptionRate`, `newThisWeek` / a month-boundary variant
is Plan 3's concern). Wiring these three into a page or fetch function is
explicitly Plan 3, not this plan.

**Placeholders:** none. Every step has runnable commands and complete code.

**Type consistency:** `returnRate90d` and `regularsGoneQuiet` both take
`(activityEvents: StatsEvent[], nowMs: number)`. `cardsNearReward` takes
`(cards: { stamp_count: number }[], stampsRequired: number)`. Return
shapes: `number | null`, `{ count: number; cardIds: string[] }`,
`{ oneAway: number; twoAway: number }`. Used consistently in the tests and
the interface blocks.
