# Points Club Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Points Club" — a Stamp variant where each visit earns a vendor-configurable fixed amount (`points_per_visit`, not always 1), accumulating toward a single reward threshold, displayed as a number + progress bar instead of a dots grid.

**Architecture:** `type: "stamp"` + `variant: "points"` (no new `ProgramType`). Unlike Flame Club/Fill the Cup, this genuinely changes behavior: production `add_stamp` currently hardcodes `stamp_count + 1` and must read a config-driven amount instead (migration), and the TS `stampStrategy.apply()` — which the prior two features left completely untouched — must also honor `points_per_visit` so the `/setup` live preview doesn't lie about how fast the bar fills. `stamps_required` is reused as the points target, but its value range must widen far beyond Stamp/Flame Club's existing 4–20 (a DB-level `CHECK` constraint currently enforces 2–20 and would reject any points target above 20 outright — this constraint predates this plan and was undiscovered by the spec).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Supabase Postgres (SECURITY DEFINER functions), Vitest + Testing Library, Tailwind v4.

## Global Constraints

- Every task's commit leaves `pnpm check` clean, full `pnpm test` passing, and `pnpm build` clean.
- `redeem`/`defaults` in `src/lib/engine/stamp.ts` must NOT change. `apply()` DOES change (deliberately — see Architecture) to read `config.points_per_visit`, defaulting to `1`. `progress()` changes to tag the `"dots"` view with a `variant` and vary the label's unit word.
- The migration's `coalesce(..., 1)` fallback must produce byte-identical behavior to today's `add_stamp` for any program without `points_per_visit` in its config — this is the entire backward-compatibility guarantee the migration rests on. Verify concretely (trace both the "first stamp" insert path and the "existing card" update path), not just by reading the spec's claim.
- No new `ProgramType` and no new top-level `ProgressView` kind — points is a `variant` value on the existing `"dots"` kind.
- Stamp Card's and Flame Club's existing `stamps_required` range (2–20) and quick-pick chips (5/10/15) must remain completely unchanged for `variant !== "points"`. The wider Points range (2–100,000) and chips (100/500/1000) apply only when `variant === "points"`.
- `ProgressView`'s `"dots"` case's new `variant` field must be **optional** (`variant?: "dots" | "points"`), not required — `src/lib/engine/lucky.ts` independently returns a bare `{kind: "dots", filled, total}` (no `variant`) for its own pity-counter progress bar, reusing the same view kind Stamp uses. Making `variant` required would force an unrelated, unnecessary change to `lucky.ts`. Existing dots-kind consumers with no `variant` key must remain valid TypeScript and must continue rendering exactly as they do today (the plain dots grid).

---

### Task 1: Migration 0026 — points-per-visit-aware `add_stamp`, widen the `stamps_required` DB range

**Files:**

- Create: `supabase/migrations/0026_loopkit_points_per_visit.sql`
- Test: `test/db/points-per-visit-schema.test.ts`
- Modify: `docs/DEPLOY.md` (new entry after the existing `0025` entry)

**Interfaces:**

- Consumes: nothing from other tasks — pure SQL, independently testable via schema-text assertions (this repo's `test/db/*.test.ts` files never run against a live database, only `readFileSync` + regex against the migration file's raw text).
- Produces: nothing later tasks depend on programmatically. `loopkit.add_stamp` now reads `programs.config->>'points_per_visit'` (defaulting to `1`) instead of hardcoding `+1`; `programs.stamps_required`'s `CHECK` constraint permits `2..100000` instead of `2..20`. Later tasks (2–5) add the application-layer support that actually lets a vendor set `points_per_visit` and a wide `stamps_required` — they do not depend on this migration being live in any local/CI database.

**Context — two real things this migration must fix, not one:**

1. Production `add_stamp` (`supabase/migrations/0022_loopkit_stamp_carryover.sql`) hardcodes `stamp_count + 1` in two places: the initial insert value (`values (p_program, p_phone, 1)`) and the existing-card update (`set stamp_count = stamp_count + 1`). Both must read a config-driven amount instead.
2. `programs.stamps_required` has a **DB-level `CHECK (stamps_required between 2 and 20)`** constraint, added inline in `supabase/migrations/0001_loopkit_core.sql` with no explicit constraint name (Postgres auto-generates one, e.g. `programs_stamps_required_check` — but relying on a _guessed_ auto-generated name in a `drop constraint <name>` is a real risk: if the guess is wrong, `drop constraint if exists <wrong-name>` silently no-ops, and adding a new constraint with the guessed name would create a **second, redundant** constraint alongside the untouched original — Postgres enforces the intersection of all `CHECK` constraints on a column, so the effective range would silently stay `2..20` even though the migration "succeeded." Task 1 must not guess — see Step 1's `pg_constraint` lookup, which finds and drops the real constraint by inspecting its actual definition text, regardless of what it's named.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0026_loopkit_points_per_visit.sql
-- Points Club: vendors set a fixed points_per_visit amount (config field,
-- default 1) instead of Stamp's implicit +1. Unlike Flame Club/Fill the Cup
-- (pure visual reskins, config is jsonb is jsonb, no migration needed), this
-- changes real accumulation behavior — add_stamp must read the amount from
-- config, and any program without points_per_visit set falls back to 1,
-- reproducing today's exact behavior with zero retroactive change.

-- Widen the stamps_required range (currently 2..20, added in 0001 as an
-- unnamed inline check) so a Points target can be set up to 100,000. The
-- constraint's auto-generated name is not guessed here — this DO block finds
-- it by inspecting its actual definition text and drops whatever it's really
-- called, avoiding the risk of a silently-redundant second constraint if a
-- guessed name were wrong. Stamp/Flame Club stay capped at 20 by the
-- application-layer Zod schema (Task 4), not by this DB constraint — the DB
-- range is now a looser outer bound shared by every stamp-type variant.
do $$
declare
  v_constraint_name text;
begin
  select conname into v_constraint_name
  from pg_constraint
  where conrelid = 'loopkit.programs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%stamps_required%';

  if v_constraint_name is not null then
    execute format('alter table loopkit.programs drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table loopkit.programs
  add constraint programs_stamps_required_check
  check (stamps_required between 2 and 100000);

-- add_stamp: stamp_count now increments by the program's configured
-- points_per_visit (jsonb config field, coalesced to 1 when absent) instead
-- of a hardcoded 1. Both the "first stamp for this phone" insert and the
-- "existing card" update read the same coalesced amount.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
  v_config jsonb;
  v_amount int;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select config into v_config from loopkit.programs where id = p_program;
  v_amount := coalesce((v_config->>'points_per_visit')::int, 1);

  -- First stamp for this phone: create the card and log it.
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, v_amount)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  -- Existing card: always increment by v_amount, no ceiling.
  update loopkit.cards
    set stamp_count = stamp_count + v_amount, updated_at = now()
    where program_id = p_program and phone = p_phone
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  return v_card;
end;
$$;
```

- [ ] **Step 2: Write the schema test**

```ts
// test/db/points-per-visit-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0026_loopkit_points_per_visit.sql",
  "utf8",
);

describe("0026 points-per-visit migration", () => {
  it("widens the stamps_required range to 100,000 via a dynamic constraint lookup, not a guessed name", () => {
    expect(sql).toMatch(/select conname into v_constraint_name/i);
    expect(sql).toMatch(/from pg_constraint/i);
    expect(sql).toMatch(
      /add constraint programs_stamps_required_check\s+check \(stamps_required between 2 and 100000\)/i,
    );
  });

  it("recreates add_stamp reading points_per_visit from config with a coalesce(...,1) fallback", () => {
    expect(sql).toMatch(/create or replace function loopkit\.add_stamp/i);
    expect(sql).toMatch(
      /coalesce\(\(v_config->>'points_per_visit'\)::int,\s*1\)/i,
    );
  });

  it("applies v_amount to both the first-stamp insert and the existing-card update", () => {
    expect(sql).toMatch(/values \(p_program, p_phone, v_amount\)/i);
    expect(sql).toMatch(/set stamp_count = stamp_count \+ v_amount/i);
  });

  it("fallback reproduces today's exact +1 behavior for programs without points_per_visit", () => {
    // The coalesce(...,1) means: no points_per_visit key in config -> v_amount = 1,
    // identical to migration 0022's hardcoded +1 on both write paths. This test
    // asserts the SQL shape that guarantees that equivalence (both paths use the
    // same v_amount, and v_amount's only fallback value is 1).
    expect(sql).toMatch(/v_amount int/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run test/db/points-per-visit-schema.test.ts`
Expected: FAIL — `ENOENT: no such file or directory` (the migration file doesn't exist yet).

- [ ] **Step 4: Create the migration file with the exact content from Step 1, then run the test again**

Run: `pnpm vitest run test/db/points-per-visit-schema.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 5: Add the DEPLOY.md entry**

Open `docs/DEPLOY.md` and find the existing `0025_loopkit_remove_streak_type.sql` entry (search for that filename). Immediately after its closing `re-run.` line and blank line, insert:

```markdown
- apply `0026_loopkit_points_per_visit.sql` — adds Points Club, a Stamp
  variant where each visit earns a vendor-configured `points_per_visit`
  amount instead of an implicit 1. Recreates `add_stamp` to read the
  amount from `programs.config` (falling back to 1 for every existing
  program, reproducing today's exact behavior). Widens the
  `stamps_required` column's `CHECK` constraint from `2..20` to
  `2..100000` so a Points target can be set in the hundreds or
  thousands — Stamp/Flame Club stay capped at 20 by the application
  layer, not this constraint. Safe to re-run.
```

- [ ] **Step 6: Run the full suite and pnpm check**

Run: `pnpm check && pnpm test`
Expected: `pnpm check` clean; full test suite passes (this migration and its test don't touch anything else, so no other test should be affected).

- [ ] **Step 7: Run pnpm build**

Run: `pnpm build`
Expected: clean build (this task touches no TypeScript, so this is a sanity check, not expected to surface anything).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0026_loopkit_points_per_visit.sql test/db/points-per-visit-schema.test.ts docs/DEPLOY.md
git commit -m "feat: migration 0026 - points-per-visit add_stamp, widen stamps_required range"
```

---

### Task 2: Engine layer — `points_per_visit`-aware `apply()`, variant-tagged `progress()`, `PointsBar` component

**Files:**

- Modify: `src/lib/engine/stamp.ts`
- Modify: `src/lib/engine/types.ts`
- Create: `src/components/points-bar.tsx`
- Test: `test/lib/engine/stamp.test.ts` (new points-variant cases + fix 2 pre-existing assertions that will break)
- Test: `test/components/points-bar.test.tsx`

**Interfaces:**

- Consumes: nothing from Task 1 (this is the TS engine layer; the migration is a separate, independently-testable SQL change).
- Produces: `StampConfig.points_per_visit?: number` and `StampConfig.variant` widened to `"dots" | "flame" | "points"` — Task 4 (save-path) sets these when building a program's config. `ProgressView`'s `"dots"` case gains `variant?: "dots" | "points"` — Task 3 (render sites) dispatches on it. `PointsBar({filled, total, className?})` — Task 3 renders it.

**Why `apply()` changes here (unlike Flame Club/Fill the Cup's Task 2, which left `apply()` untouched):** those two features kept the underlying mechanic byte-identical to what they reskinned — only the display differed. Points' entire point is a different increment. If `apply()` stayed hardcoded at `+1`, the `/setup` live preview (which calls `applyVisit` → `stampStrategy.apply` on every 3-second tick) would show the bar filling by 1 per tick regardless of the vendor's configured `points_per_visit`, silently misrepresenting what a real customer would experience. This is a deliberate, spec-approved exception — do not "restore" `apply()` to a hardcoded `+1`.

- [ ] **Step 1: Write the failing tests — fix the 2 pre-existing assertions first**

`test/lib/engine/stamp.test.ts`'s existing `"progress renders a dot view"` test (line ~45) and `"dots variant (default, no variant field) is unaffected"` test (line ~125, inside the `"stampStrategy flame variant"` describe block) both use `.toEqual({ kind: "dots", filled: X, total: Y })` — an **exact** match with no `variant` key. Once `progress()` starts setting `variant: "dots"` explicitly on every non-flame return, these exact-match assertions will fail (not because behavior broke, but because the fixture is now incomplete). Update both to include `variant: "dots"`:

```ts
// test/lib/engine/stamp.test.ts — update these two existing assertions:

it("progress renders a dot view", () => {
  expect(
    stampStrategy.progress({ stamp_count: 3, reward_count: 0 }, cfg, now).view,
  ).toEqual({ kind: "dots", filled: 3, total: 5, variant: "dots" });
});
```

```ts
it("dots variant (default, no variant field) is unaffected", () => {
  const p = stampStrategy.progress(
    { stamp_count: 3, reward_count: 0 },
    cfg,
    now,
  );
  expect(p.view).toEqual({
    kind: "dots",
    filled: 3,
    total: 5,
    variant: "dots",
  });
});
```

Then append new points-variant test cases to the same file:

```ts
describe("stampStrategy points variant", () => {
  const pointsCfg = {
    stamps_required: 100,
    reward_text: "free kopi",
    variant: "points" as const,
    points_per_visit: 10,
  };

  it("apply() increments by points_per_visit instead of 1", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 40, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(r.state.stamp_count).toBe(50);
  });

  it("apply() caps at stamps_required even when points_per_visit overshoots", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 95, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(r.state.stamp_count).toBe(100);
    expect(r.rewardUnlocked).toBe(true);
  });

  it("apply() defaults to +1 when points_per_visit is absent, even with variant points", () => {
    const cfgNoAmount = {
      stamps_required: 100,
      reward_text: "free kopi",
      variant: "points" as const,
    };
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 40, reward_count: 0 },
      cfgNoAmount,
      now,
    );
    expect(r.state.stamp_count).toBe(41);
  });

  it("progress() tags the dots view with variant: points and uses a points-worded label", () => {
    const p = stampStrategy.progress(
      { stamp_count: 40, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 40,
      total: 100,
      variant: "points",
    });
    expect(p.label).toBe("40/100 points");
  });

  it("redeem() is unaffected by points_per_visit — still resets to 0 and increments reward_count", () => {
    expect(
      stampStrategy.redeem({ stamp_count: 100, reward_count: 1 }, pointsCfg),
    ).toEqual({ stamp_count: 0, reward_count: 2 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/engine/stamp.test.ts`
Expected: the two updated `toEqual` assertions FAIL (actual value still lacks `variant`); the new `describe("stampStrategy points variant", ...)` block FAILS (`points_per_visit`/`variant: "points"` not read by `apply()`/`progress()` yet).

- [ ] **Step 3: Update `src/lib/engine/stamp.ts`**

```ts
import type { Strategy } from "@/lib/engine/types";

export type StampConfig = {
  stamps_required: number;
  reward_text: string;
  variant?: "dots" | "flame" | "points";
  points_per_visit?: number;
};
export type StampState = { stamp_count: number; reward_count: number };

const FLAME_STAGE_NAMES = ["Spark", "Inner Flame", "Full Blaze"] as const;

function flameStageFor(filled: number, total: number): number {
  if (filled >= total) return 2;
  if (filled >= Math.round(total * 0.5)) return 1;
  return 0;
}

export const stampStrategy: Strategy<StampConfig, StampState> = {
  defaults() {
    return { stamp_count: 0, reward_count: 0 };
  },
  progress(state, config) {
    const filled = Math.min(state.stamp_count, config.stamps_required);
    const total = config.stamps_required;
    const rewardReady = state.stamp_count >= total;
    if (config.variant === "flame") {
      const stage = flameStageFor(filled, total);
      const stageName = FLAME_STAGE_NAMES[stage];
      return {
        stage: rewardReady ? "ready" : "collecting",
        label: `${stageName} — ${filled}/${total}`,
        view: {
          kind: "flame",
          filled,
          total,
          stage,
          stageName,
          totalStages: 3,
        },
        rewardReady,
      };
    }
    const isPoints = config.variant === "points";
    const unitLabel = isPoints ? "points" : "stamps";
    return {
      stage: rewardReady ? "ready" : "collecting",
      label: `${filled}/${total} ${unitLabel}`,
      view: {
        kind: "dots",
        filled,
        total,
        variant: isPoints ? "points" : "dots",
      },
      rewardReady,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const inc = config.points_per_visit ?? 1;
    const next = Math.min(state.stamp_count + inc, config.stamps_required);
    return {
      state: { ...state, stamp_count: next },
      rewardUnlocked:
        state.stamp_count < config.stamps_required &&
        next >= config.stamps_required,
    };
  },
  redeem(state) {
    return { stamp_count: 0, reward_count: state.reward_count + 1 };
  },
};
```

- [ ] **Step 4: Update `src/lib/engine/types.ts`'s `ProgressView` union**

Change the `"dots"` case from:

```ts
  | { kind: "dots"; filled: number; total: number }
```

to:

```ts
  | { kind: "dots"; filled: number; total: number; variant?: "dots" | "points" }
```

Every other case in the union is unchanged.

- [ ] **Step 5: Run the stamp tests again to verify they pass**

Run: `pnpm vitest run test/lib/engine/stamp.test.ts`
Expected: PASS (all cases, including the 2 fixed and 5 new).

- [ ] **Step 6: Check for other pre-existing `toEqual`/exact-match breaks**

`src/lib/engine/types.ts`'s `variant` field is optional, so most existing consumers of the `"dots"` kind (including `src/lib/engine/lucky.ts`, which independently returns a bare `{kind: "dots", filled, total}` with no `variant` key) remain valid TypeScript with no change needed — do not touch `lucky.ts`. However, `progress()`'s dots branch above now _always_ sets `variant` explicitly (`"dots"` or `"points"`), so any OTHER test file asserting an exact `{kind:"dots", filled, total}` shape against a value that came from `stampStrategy.progress()` (not from `lucky.ts`) will also break. Run the full suite and inspect any failures:

Run: `pnpm test`

If any test file (other than `test/lib/engine/stamp.test.ts`, already fixed above) fails with a `toEqual` mismatch showing an unexpected extra `variant: "dots"` key on a dots-kind object that came from `stampStrategy.progress()`, add `variant: "dots"` to that fixture's expected value — the same minimal, one-key fix applied in Step 1. Do not touch fixtures whose dots-kind object came from `lucky.ts` (those correctly have no `variant` key and must stay that way).

- [ ] **Step 7: Write the failing test for `PointsBar`**

```ts
// test/components/points-bar.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PointsBar } from "@/components/points-bar";

describe("PointsBar", () => {
  it("renders the filled/total count as a formatted number", () => {
    render(<PointsBar filled={740} total={1000} />);
    expect(screen.getByText("740 / 1,000 points")).toBeInTheDocument();
  });

  it("fill bar width matches the filled/total ratio", () => {
    const { container } = render(<PointsBar filled={25} total={100} />);
    const bar = container.querySelector('[data-testid="points-bar-fill"]');
    expect(bar).toHaveStyle({ width: "25%" });
  });

  it("clamps fill width at 100% when filled exceeds total (carryover case)", () => {
    const { container } = render(<PointsBar filled={150} total={100} />);
    const bar = container.querySelector('[data-testid="points-bar-fill"]');
    expect(bar).toHaveStyle({ width: "100%" });
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm vitest run test/components/points-bar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/points-bar'`.

- [ ] **Step 9: Create `src/components/points-bar.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function PointsBar({
  filled,
  total,
  className,
}: {
  filled: number;
  total: number;
  className?: string;
}) {
  const pct = Math.min(Math.max((filled / total) * 100, 0), 100);
  return (
    <div className={cn("flex w-full max-w-xs flex-col gap-1.5", className)}>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {filled.toLocaleString()} / {total.toLocaleString()} points
      </p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          data-testid="points-bar-fill"
          className="h-full rounded-full bg-gold transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm vitest run test/components/points-bar.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 11: Run the full suite, check, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all clean.

- [ ] **Step 12: Commit**

```bash
git add src/lib/engine/stamp.ts src/lib/engine/types.ts src/components/points-bar.tsx test/lib/engine/stamp.test.ts test/components/points-bar.test.tsx
git commit -m "feat: points_per_visit-aware Stamp apply/progress, PointsBar component"
```

---

### Task 3: Render-site wiring — `PointsBar` into `program-card-status.tsx` and `preview-card.tsx`

**Files:**

- Modify: `src/app/c/program-card-status.tsx`
- Modify: `src/app/setup/preview-card.tsx`
- Test: `src/app/c/program-card-status.dom.test.tsx` (or wherever this file's existing DOM tests live — confirm the exact path by locating the existing test for the `"dots"`/`"flame"` branches before adding to it)
- Test: `src/app/setup/preview-card.dom.test.tsx`

**Interfaces:**

- Consumes: `PointsBar` from Task 2 (`src/components/points-bar.tsx`), `ProgressView`'s `"dots"` case's `variant` field from Task 2.
- Produces: nothing later tasks depend on programmatically — this is the last piece of the customer/vendor-facing rendering surface. Task 4 (save-path/`/setup` UI) and Task 5 (live-preview data threading) both rely on this task's render sites existing so a `variant: "points"` selection actually shows `PointsBar`, not `StampDots`.

**Important — `src/app/dashboard/serve-customer.tsx` is deliberately NOT touched by this task.** Flame Club's Task 3 confirmed this file's `mode === "stamp"` result panel is text-only (`"{stamp_count} / {stampsRequired} stamps"`, no visual component at all) — it never dispatches on `view.kind`/`view.variant` for stamp-type programs. Points Club, being `type: "stamp"`, automatically flows through this same text-only panel with no code change needed there. Do not add a `PointsBar` branch to `serve-customer.tsx` — if you find yourself wanting to, re-read Flame Club's plan (`docs/superpowers/plans/2026-07-15-flame-club-redesign.md`, Task 3) to confirm this precedent, since it directly contradicts what you might otherwise assume from Fill the Cup's Task 2 (which DID add a real `<Cup>` branch there, because Plant's result panel is genuinely visual, unlike Stamp's).

- [ ] **Step 1: Write the failing test for `program-card-status.tsx`**

`src/app/c/program-card-status.dom.test.tsx` already has a `baseCard(overrides)` fixture helper (its default `view` is a `"plant"`-kind object) — reuse that exact helper, only overriding `view`. Add a new `describe` block:

```tsx
describe("ProgramCardStatus points variant", () => {
  it("renders PointsBar when view.variant is points", () => {
    const { getByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 40, total: 100, variant: "points" },
        })}
        phone="+6591234567"
      />,
    );
    expect(getByText("40 / 100 points")).toBeInTheDocument();
  });

  it("still renders StampDots (not PointsBar) when view.variant is dots", () => {
    const { container, queryByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 3, total: 5, variant: "dots" },
        })}
        phone="+6591234567"
      />,
    );
    expect(queryByText(/points$/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("span[aria-hidden]").length).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/c/program-card-status.dom.test.tsx`
Expected: FAIL — either a missing import error or the plain-dots grid renders instead of the points text.

- [ ] **Step 3: Update `src/app/c/program-card-status.tsx`**

Add the import:

```tsx
import { PointsBar } from "@/components/points-bar";
```

Find the existing `view?.kind === "dots" ? (<StampDots filled={view.filled} total={view.total} />)` branch and change it to:

```tsx
      ) : view?.kind === "dots" ? (
        view.variant === "points" ? (
          <PointsBar filled={view.filled} total={view.total} />
        ) : (
          <StampDots filled={view.filled} total={view.total} />
        )
      ) : null}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/app/c/program-card-status.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Repeat for `src/app/setup/preview-card.tsx`**

Same import, same `view.kind === "dots"` branch structure (this file mirrors `program-card-status.tsx`'s switch exactly, per its own header comment — "Mirrors ProgramCardStatus's view-kind switch"). `src/app/setup/preview-card.dom.test.tsx` takes a `progress: Progress` prop directly (not a `card`/`CardStatus` fixture) — check that file's existing tests for its exact prop-passing style (likely `render(<PreviewCard progress={{stage, label, view, rewardReady}} name="..." rewardText="..." />)`) and add an equivalent `variant: "points"` case following that same shape:

```tsx
it("renders PointsBar when view.variant is points", () => {
  render(
    <PreviewCard
      progress={{
        stage: "collecting",
        label: "40/100 points",
        rewardReady: false,
        view: { kind: "dots", filled: 40, total: 100, variant: "points" },
      }}
      name="Coffee Points"
      rewardText="Free drink"
    />,
  );
  expect(screen.getByText("40 / 100 points")).toBeInTheDocument();
});
```

Run it failing, apply the same conditional wrap from Step 3 to `preview-card.tsx`'s dots branch, run it passing.

- [ ] **Step 6: Run the full suite, check, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/c/program-card-status.tsx src/app/setup/preview-card.tsx <the two test files>
git commit -m "feat: wire PointsBar into program-card-status.tsx and preview-card.tsx"
```

---

### Task 4: Save-path wiring + `/setup` UI — Points Club as a 9th tile

**Files:**

- Modify: `src/lib/program.ts`
- Modify: `src/app/setup/setup-form.tsx`
- Test: `test/lib/save-program-schema.test.ts`
- Test: `test/lib/build-program-fields.test.ts`
- Test: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: nothing programmatically from Tasks 2–3 (this task's tests exercise the schema/form layer directly, not through the engine).
- Produces: a vendor picking "Points Club" in `/setup` now saves `type: "stamp"`, `config.variant: "points"`, `config.points_per_visit: <vendor value>`, `stamps_required: <vendor value, 2–100,000>`. Task 5 (live preview) consumes the same `variant`/`points_per_visit` values already threaded through `usePreviewAnimation`'s existing call in `setup-form.tsx` (this task adds the field to that call's argument object; Task 5 makes `preview-state.ts` actually use it).

- [ ] **Step 1: Write the failing schema tests**

Append to `test/lib/save-program-schema.test.ts` (match the file's existing style — locate the stamp-variant `describe` block and add alongside it):

```ts
describe("saveProgramSchema — points variant", () => {
  const base = {
    type: "stamp",
    name: "Coffee Points",
    reward_text: "Free drink",
    head_start: "false",
  };

  it("accepts a wide stamps_required (up to 100,000) when variant is points", () => {
    const result = saveProgramSchema.safeParse({
      ...base,
      stamps_required: "1000",
      variant: "points",
      points_per_visit: "10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects stamps_required over 20 when variant is dots (unchanged existing behavior)", () => {
    const result = saveProgramSchema.safeParse({
      ...base,
      stamps_required: "1000",
      variant: "dots",
    });
    expect(result.success).toBe(false);
  });

  it("rejects stamps_required over 20 when variant is absent (Stamp Card default, unchanged)", () => {
    const result = saveProgramSchema.safeParse({
      ...base,
      stamps_required: "1000",
    });
    expect(result.success).toBe(false);
  });

  it("still rejects stamps_required over 100,000 even for points", () => {
    const result = saveProgramSchema.safeParse({
      ...base,
      stamps_required: "200000",
      variant: "points",
      points_per_visit: "10",
    });
    expect(result.success).toBe(false);
  });

  it("points_per_visit defaults to undefined (later defaulted to 1) when absent", () => {
    const result = saveProgramSchema.safeParse({
      ...base,
      stamps_required: "100",
      variant: "points",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.points_per_visit).toBeUndefined();
    }
  });

  it("rejects points_per_visit over 1000", () => {
    const result = saveProgramSchema.safeParse({
      ...base,
      stamps_required: "1000",
      variant: "points",
      points_per_visit: "5000",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/save-program-schema.test.ts`
Expected: several FAIL — `variant: "points"` isn't a valid enum member yet, `points_per_visit` field doesn't exist, and the 1000-cap `superRefine` doesn't exist.

- [ ] **Step 3: Update `src/lib/program.ts`'s stamp schema branch**

Find the `z.object({ type: z.literal("stamp"), ... })` member inside `saveProgramSchema`'s `z.discriminatedUnion("type", [...])` array and replace it with:

```ts
  z.object({
    type: z.literal("stamp"),
    name: z.string().trim().min(1).max(60),
    stamps_required: z.coerce.number().int().min(2).max(100000),
    reward_text: z.string().trim().min(1).max(80),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    head_start_percent: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(5).max(50).optional(),
    ),
    variant: z.preprocess(
      emptyToUndefined,
      z.enum(["dots", "flame", "points"]).optional(),
    ),
    points_per_visit: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(1).max(1000).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
```

Then, immediately after the closing `]);` of the `z.discriminatedUnion(...)` call (the line currently reading exactly `]);` before `export type SaveProgramInput = ...`), chain a `.superRefine(...)` onto the whole union — this is necessary because `z.discriminatedUnion` requires each member to be a plain `z.object`, not a `z.object(...).superRefine(...)` (which produces a `ZodEffects`, not accepted as a union member) — so the conditional range check must live on the assembled union instead:

```ts
export const saveProgramSchema = z
  .discriminatedUnion("type", [
    // ...the 5 existing members, stamp branch updated per Step 3 above...
  ])
  .superRefine((data, ctx) => {
    if (
      data.type === "stamp" &&
      data.variant !== "points" &&
      data.stamps_required > 20
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stamps_required"],
        message:
          "Stamps required must be between 2 and 20 for this card style.",
      });
    }
  });
```

(Keep every other array member — lucky/plant/wheel/scratch — exactly as they are today; only the `stamp` member's body and the trailing `.superRefine` are new.)

- [ ] **Step 4: Run the schema tests again to verify they pass**

Run: `pnpm vitest run test/lib/save-program-schema.test.ts`
Expected: PASS (all cases, including pre-existing ones — re-run the whole file, not just the new `describe` block, to confirm nothing regressed).

- [ ] **Step 5: Write the failing `buildProgramFields` test**

Append to `test/lib/build-program-fields.test.ts`:

```ts
it("threads points_per_visit into the stamp config, defaulting to 1", () => {
  const fields = buildProgramFields({
    type: "stamp",
    name: "Coffee Points",
    stamps_required: 1000,
    reward_text: "Free drink",
    head_start: false,
    variant: "points",
    points_per_visit: 25,
    expiry_days: undefined,
  });
  expect(fields.config).toMatchObject({
    points_per_visit: 25,
    variant: "points",
  });
});

it("defaults points_per_visit to 1 when absent, even for the points variant", () => {
  const fields = buildProgramFields({
    type: "stamp",
    name: "Coffee Points",
    stamps_required: 1000,
    reward_text: "Free drink",
    head_start: false,
    variant: "points",
    expiry_days: undefined,
  });
  expect(fields.config).toMatchObject({ points_per_visit: 1 });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm vitest run test/lib/build-program-fields.test.ts`
Expected: FAIL — `points_per_visit` not present in the returned config.

- [ ] **Step 7: Update `buildProgramFields`'s stamp branch in `src/lib/program.ts`**

```ts
if (data.type === "stamp") {
  return {
    type: "stamp",
    stampsRequired: data.stamps_required,
    headStart: data.head_start,
    headStartPercent: data.head_start_percent ?? 20,
    config: {
      stamps_required: data.stamps_required,
      reward_text: data.reward_text,
      variant: data.variant ?? "dots",
      points_per_visit: data.points_per_visit ?? 1,
    },
  };
}
```

- [ ] **Step 8: Run the test again to verify it passes**

Run: `pnpm vitest run test/lib/build-program-fields.test.ts`
Expected: PASS.

- [ ] **Step 9: Write the failing `setup-form.dom.test.tsx` test**

This file mocks `saveProgramAction` as `saveMock` and asserts against the `FormData` it was called with (see the existing `"Flame Club tile saves..."` test for the exact pattern this copies):

```tsx
it("Points Club tile saves type=stamp with variant=points, wider range, and points_per_visit", async () => {
  const user = userEvent.setup();
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Points Club" }));
  expect(screen.getByText("Points required")).toBeInTheDocument();
  expect(screen.getByLabelText("Points per visit")).toBeInTheDocument();

  const stampsInput = screen.getByLabelText("Points required");
  await user.clear(stampsInput);
  await user.type(stampsInput, "500");

  const perVisitInput = screen.getByLabelText("Points per visit");
  await user.clear(perVisitInput);
  await user.type(perVisitInput, "20");

  await user.type(screen.getByLabelText("Card name"), "Coffee Points");
  await user.type(screen.getByLabelText("Reward"), "Free drink");
  await user.click(screen.getByRole("button", { name: "Create card" }));

  expect(saveMock).toHaveBeenCalled();
  const submitted = saveMock.mock.calls[0][1] as FormData;
  expect(submitted.get("type")).toBe("stamp");
  expect(submitted.get("variant")).toBe("points");
  expect(submitted.get("stamps_required")).toBe("500");
  expect(submitted.get("points_per_visit")).toBe("20");
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — no "Points Club" tile exists yet.

- [ ] **Step 11: Update `src/app/setup/setup-form.tsx`**

Widen the `TypeOptionValue` type and `typeLabels`:

```ts
type TypeOptionValue =
  | "stamp"
  | "flame"
  | "points"
  | "lucky"
  | "plant"
  | "cup"
  | "wheel"
  | "scratch";

const typeLabels: Record<TypeOptionValue, string> = {
  stamp: "Stamp card",
  flame: "Flame Club",
  points: "Points Club",
  lucky: "Lucky Tap",
  plant: "Sprout",
  cup: "Fill the Cup",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};
```

Add a new entry to `TYPE_OPTIONS` (insert it right after the existing `flame` entry, before `lucky`):

```ts
  {
    value: "points",
    label: "Points Club",
    description: "Earn a set number of points every visit",
  },
```

Widen the `variant` state type:

```ts
const [variant, setVariant] = useState<
  "dots" | "flame" | "points" | "plant" | "cup"
>(() => {
  if (config.variant === "flame") return "flame";
  if (config.variant === "points") return "points";
  if (config.variant === "cup") return "cup";
  return initialType === "plant" ? "plant" : "dots";
});
```

Add a `pointsPerVisit` controlled state, near the existing `stampsRequired`/`visitsToBloom` declarations:

```ts
const [pointsPerVisit, setPointsPerVisit] = useState(
  (config as { points_per_visit?: number }).points_per_visit ?? 10,
);
```

Update `selectedOptionKey` to recognize the points tile:

```ts
const selectedOptionKey: TypeOptionValue =
  type === "stamp" && variant === "flame"
    ? "flame"
    : type === "stamp" && variant === "points"
      ? "points"
      : type === "plant" && variant === "cup"
        ? "cup"
        : (type as TypeOptionValue);
```

Update `pickType` to handle `"points"` (sets `type: "stamp"`, `variant: "points"`, and a meaningfully larger default `stampsRequired` since 10 reads as a trivial points target):

```ts
function pickType(value: TypeOptionValue) {
  setType(
    value === "flame" || value === "points"
      ? "stamp"
      : value === "cup"
        ? "plant"
        : value,
  );
  setVariant(
    value === "flame"
      ? "flame"
      : value === "points"
        ? "points"
        : value === "cup"
          ? "cup"
          : value === "stamp"
            ? "dots"
            : value === "plant"
              ? "plant"
              : "dots",
  );
  setName("");
  setRewardText("");
  setStampsRequired(value === "points" ? 500 : 10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setHeadStartPercent(20);
  setPointsPerVisit(10);
}
```

Add `pointsPerVisit` to the `usePreviewAnimation` call's argument object:

```ts
const { progress: previewProgress, celebrating } = usePreviewAnimation({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
});
```

(Task 5 will add `pointsPerVisit` to `PreviewInput` so this compiles cleanly — until Task 5 lands, `pnpm check` will show a TS error here, which is expected mid-task; both tasks together leave the tree clean, matching the plan's task-boundary convention.)

In the JSX, find the `stamps_required` `<Label>`/`<Input>`/chips block (currently reads `variant === "flame" ? "Visits for full blaze" : "Stamps required"`, `min={2} max={20}`, chips `[5, 10, 15]`) and make it fully variant-aware:

```tsx
<div className="space-y-2">
  <Label htmlFor="stamps_required" className={labelClass}>
    {variant === "flame"
      ? "Visits for full blaze"
      : variant === "points"
        ? "Points required"
        : "Stamps required"}
  </Label>
  <Input
    id="stamps_required"
    name="stamps_required"
    type="number"
    required
    min={2}
    max={variant === "points" ? 100000 : 20}
    placeholder={variant === "points" ? "500" : "10"}
    value={stampsRequired}
    onChange={(e) => setStampsRequired(Number(e.target.value))}
    className="h-11 rounded-xl"
  />
  <div className="flex gap-1.5">
    {(variant === "points" ? [100, 500, 1000] : [5, 10, 15]).map((n) => (
      <button
        key={n}
        type="button"
        onClick={() => setStampsRequired(n)}
        className={cn(
          "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
          stampsRequired === n
            ? "border-primary bg-primary/10 text-primary"
            : "bg-card text-muted-foreground hover:bg-muted/50",
        )}
      >
        {n}
      </button>
    ))}
  </div>
</div>
```

Immediately after that `</div>` (still inside the `type === "stamp"` branch's `grid grid-cols-1 gap-4 sm:grid-cols-2` wrapper), add a new conditional field for `points_per_visit`:

```tsx
{
  variant === "points" && (
    <div className="space-y-2">
      <Label htmlFor="points_per_visit" className={labelClass}>
        Points per visit
      </Label>
      <Input
        id="points_per_visit"
        name="points_per_visit"
        type="number"
        required
        min={1}
        max={1000}
        placeholder="10"
        value={pointsPerVisit}
        onChange={(e) => setPointsPerVisit(Number(e.target.value))}
        className="h-11 rounded-xl"
      />
    </div>
  );
}
```

Finally, near the existing hidden `variant` mirror input (`<input type="hidden" name="variant" value={variant} />`, currently rendered when `type === "stamp" || type === "plant"`), add a hidden mirror for `points_per_visit`, submitted only when relevant:

```tsx
{
  variant === "points" && (
    <input type="hidden" name="points_per_visit" value={pointsPerVisit} />
  );
}
```

- [ ] **Step 12: Run the DOM test to verify it passes**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS (the new Points Club test; note `pnpm check`'s `tsc` may still flag `pointsPerVisit` as missing from `PreviewInput` until Task 5 — this is expected and resolved by Task 5, per the note in Step 11).

- [ ] **Step 13: Run the full suite and check**

Run: `pnpm test`
Expected: PASS. `pnpm check` may show one `tsc` error at this point (the `PreviewInput` shape gap noted above) — this is the ONE deliberate exception to the "every task's commit is independently clean" rule in this plan, mirroring how Fill the Cup's Task 3→Task 4 boundary worked (a documented, single-task-spanning gap, closed immediately by the very next task). If your task-runner or review process requires a fully clean `pnpm check` before committing, pull `pointsPerVisit: number;` into `PreviewInput` in `src/app/setup/preview-state.ts` right now (a one-line type addition, no behavior change) — either approach is acceptable; document which one you took in your report.

- [ ] **Step 14: Commit**

```bash
git add src/lib/program.ts src/app/setup/setup-form.tsx test/lib/save-program-schema.test.ts test/lib/build-program-fields.test.ts src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: Points Club tile in /setup, save-path variant + points_per_visit wiring"
```

---

### Task 5: Preview wiring + final verification sweep

**Files:**

- Modify: `src/app/setup/preview-state.ts`
- Modify: `src/app/setup/preview-animation.ts`
- Modify: `README.md`
- Test: `test/app/preview-state.test.ts`

**Interfaces:**

- Consumes: `pointsPerVisit` already passed into `usePreviewAnimation`'s call from Task 4's `setup-form.tsx` change.
- Produces: nothing later — this is the final task. The `/setup` live preview genuinely shows `PointsBar` filling by `pointsPerVisit` per tick when Points Club is selected, matching what a real customer scan would do.

- [ ] **Step 1: Write the failing test**

Append to `test/app/preview-state.test.ts` (locate the existing stamp-branch `describe` block and add alongside its flame-variant case):

```ts
it("points variant threads points_per_visit into the built stamp config", () => {
  const program = buildPreviewProgram({
    type: "stamp",
    name: "Coffee Points",
    rewardText: "Free drink",
    stampsRequired: 500,
    visitsToBloom: 6,
    winPercent: 20,
    pityCeiling: undefined,
    segments: [],
    variant: "points",
    pointsPerVisit: 25,
  });
  expect(program.config).toMatchObject({
    points_per_visit: 25,
    variant: "points",
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: FAIL — `pointsPerVisit` doesn't exist on `PreviewInput` yet (or `points_per_visit` isn't in the built config).

- [ ] **Step 3: Update `src/app/setup/preview-state.ts`**

Widen `PreviewInput`'s `variant` field and add `pointsPerVisit` (skip this if you already added `pointsPerVisit: number;` to `PreviewInput` during Task 4's Step 13 — in that case only the `buildPreviewProgram` change below is new):

```ts
export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
  headStartPercent: number;
  variant: "dots" | "flame" | "points" | "plant" | "cup";
  pointsPerVisit: number;
};
```

Update `buildPreviewProgram`'s stamp branch to thread `points_per_visit` through:

```ts
if (input.type === "stamp") {
  return {
    type: "stamp",
    stamps_required: input.stampsRequired,
    reward_text: input.rewardText,
    config: {
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      variant: input.variant,
      points_per_visit: input.pointsPerVisit,
    },
  };
}
```

`buildInitialCard`'s head-start seeding for `type === "stamp"` is unaffected — `headStartStampSeed` already operates purely on `stampsRequired`/`headStartPercent`, agnostic to what unit `stampsRequired` numerically represents (stamps or points), exactly as it already was for Fill the Cup's `visits_to_bloom`. No change needed there.

- [ ] **Step 4: Run the test again to verify it passes**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `src/app/setup/preview-animation.ts`**

Add `pointsPerVisit` to the destructuring and to `recipeKey`'s array (both, in the same position — after `variant` — so a `points_per_visit` edit correctly restarts the preview loop):

```ts
const {
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
} = input;

const recipeKey = JSON.stringify([
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
]);
```

- [ ] **Step 6: Run the full suite, check, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all clean — this is the task that closes any gap left open by Task 4's Step 13.

- [ ] **Step 7: Update the README**

Find the `src/components/` file-layout line (the same short enumeration Fill the Cup's Task 4 added `cup` to) and add `points-bar`:

```
— wheel, scratch-card, flame-layers, cup, points-bar, stamp-dots, etc.
```

- [ ] **Step 8: Final repo-wide verification sweep**

Run each of the following and confirm the stated result — this is the plan's final correctness gate, mirroring Flame Club's Task 7 and Fill the Cup's Task 4:

```bash
grep -n 'kind: "cup"' src/lib/engine/types.ts    # expect: no output (no new kind for cup, pre-existing check)
grep -rn 'ProgramType =' src/lib/program-config.ts  # expect: still "stamp" | "lucky" | "plant" | "wheel" | "scratch" — no "points" added
grep -n 'kind: "points"' src/lib/engine/types.ts  # expect: no output — points is a variant, not a new ProgressView kind
grep -n 'stamp_count + 1' supabase/migrations/0026_loopkit_points_per_visit.sql  # expect: no output — should read '+ v_amount' now
```

Also confirm by direct reading that `redeem()` and `defaults()` in `src/lib/engine/stamp.ts` are unchanged from their pre-Task-2 form (compare against `git show 50052ca:src/lib/engine/stamp.ts` — the commit immediately before this plan's Task 1 began) — only `apply()` and `progress()` should differ.

- [ ] **Step 9: Commit**

```bash
git add src/app/setup/preview-state.ts src/app/setup/preview-animation.ts README.md test/app/preview-state.test.ts
git commit -m "feat: thread points_per_visit through the /setup live preview, final verification sweep"
```
