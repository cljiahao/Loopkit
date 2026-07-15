# Flame Club (Streak Club Redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Streak Club's period-window mechanic with Flame Club, a visual variant of Stamp (no decay, uncapped accumulation, carries over) — reusing Stamp's engine entirely via a new `variant` config field, with zero database migration for the new mechanic and a full removal of the old Streak Club type (app code + DB constraint + SQL branch), since no vendor has been onboarded yet.

**Architecture:** `StampConfig` gains an optional `variant: "dots" | "flame"` (default `"dots"`); `stampStrategy.progress()` branches on it to produce a new `flame` `ProgressView` (3 fixed stages: Spark/Inner Flame/Full Blaze) alongside the existing `dots` view — `apply`/`redeem`/`defaults` are untouched. A new `FlameLayers` component mirrors `StampDots`'s role. Flame Club appears in `/setup`'s type picker as its own tile but saves `type: "stamp"` + `variant: "flame"` — never a new `ProgramType`. Streak Club (engine, config builder, UI, render sites, redeem action, and the DB's `programs_type_check`/`enroll_card` streak branch) is deleted outright.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Supabase Postgres (SECURITY DEFINER functions), Vitest + Testing Library, Tailwind v4, lucide-react.

## Global Constraints

- Every task's commit leaves `pnpm check` clean, full `pnpm test` passing, and `pnpm build` clean — this codebase has a documented history of Next.js Client/Server bundle-boundary errors that only surface in `pnpm build`, never in check/test.
- `stampStrategy.apply`/`redeem`/`defaults` in `src/lib/engine/stamp.ts` must NOT change at all — only `progress()` gains variant branching.
- The 3 flame stage thresholds are fixed literals (0%, 50%, 100% of `stamps_required`) — never vendor-configurable.
- Migration `0025_loopkit_remove_streak_type.sql` is a genuine constraint SHRINK (removing `'streak'` from `programs_type_check`'s allowed values) and a real DELETION of `enroll_card`'s streak branch. This is a **deliberate, user-confirmed exception** to this repo's usual purely-additive/never-remove migration convention, justified by zero live vendors existing yet in production. Do not second-guess this against the codebase's own stated convention — it is intentional and approved.
- Migrations 0011/0014/0024 are historical and are never edited retroactively — only migration 0025 (new) touches the streak-related SQL.
- After all tasks, a full repo-wide grep for `streak`/`Streak` (case-insensitive) must return zero hits outside of: historical migration files 0011/0014/0024, the plan/spec docs themselves (this file and `docs/superpowers/specs/2026-07-15-flame-club-redesign-design.md`), and `.superpowers/sdd/progress.md`'s historical entries. This check is the last step of Task 7.
- **Task ordering is deliberate and must not be reshuffled**: Task 2 only _adds_ the flame variant (Stamp/types.ts/FlameLayers) — it does not touch `streak.ts`, `engine/index.ts`'s streak switch cases, or `program-config.ts`'s `ProgramType`/`buildStreakConfig`. Tasks 3-5 delete every _consumer_ of Streak Club (render sites, the redeem action, the `/setup` UI and save-path, the live preview). Only once all consumers are gone does Task 6 delete `streak.ts` itself and shrink the shared `ProgressView`/`ProgramType` unions. This ordering exists specifically so every single task's commit is independently `pnpm check`/`test`/`build`-clean — deleting `streak.ts` (or shrinking either union) any earlier would break compilation in files a not-yet-run task still owns.

---

### Task 1: Migration 0025 — remove Streak Club from the database

**Files:**

- Create: `supabase/migrations/0025_loopkit_remove_streak_type.sql`
- Test: `test/db/remove-streak-type-schema.test.ts`

**Interfaces:**

- Consumes: nothing from other tasks — pure SQL, independently testable.
- Produces: nothing later tasks depend on programmatically. `programs.type` can no longer be `'streak'`; `enroll_card` no longer has a streak branch. Later tasks (2-7) delete the _application_ code that referenced `'streak'` — they do not depend on this migration being live in any local/CI database, since schema tests only read the migration file's raw text.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0025_loopkit_remove_streak_type.sql
-- Removes the Streak Club program type entirely — replaced by Flame Club, a
-- visual variant of Stamp (see docs/superpowers/specs/2026-07-15-flame-club-
-- redesign-design.md). No vendors have been onboarded yet (zero live rows of
-- any program type), so this migration deliberately breaks from this
-- codebase's usual purely-additive/never-remove convention: there is no
-- live-data risk to weigh against a full removal.

alter table loopkit.programs drop constraint if exists programs_type_check;
alter table loopkit.programs
  add constraint programs_type_check
  check (type in ('stamp','lucky','plant','wheel','scratch'));

-- enroll_card: drop the `elsif v_program.type = 'streak'` branch (migration
-- 0024) — recreated in full per this file's SECURITY DEFINER convention.
-- Stamp/plant seeding is byte-identical to 0024.
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_program loopkit.programs%rowtype;
  v_seed_stamp_count int := 0;
  v_seed_state jsonb := '{}'::jsonb;
  v_seed int;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    return null;
  end if;

  select * into v_program from loopkit.programs where id = p_program and active;
  if not found then
    return null;
  end if;

  if v_program.head_start then
    v_seed := greatest(1, round(v_program.stamps_required * v_program.head_start_percent / 100.0)::int);
    if v_program.type = 'stamp' then
      v_seed_stamp_count := least(v_seed, v_program.stamps_required - 1);
    elsif v_program.type = 'plant' then
      v_seed_state := jsonb_build_object(
        'growth', least(
          greatest(v_seed, round(v_program.stamps_required * 0.25)::int),
          v_program.stamps_required - 1
        ),
        'last_visit_at', now(),
        'blooms', 0,
        'bloomed', false
      );
    end if;
  end if;

  insert into loopkit.cards (program_id, phone, stamp_count, state)
    values (p_program, p_phone, v_seed_stamp_count, v_seed_state)
  on conflict (program_id, phone) do nothing;

  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;
```

Note: `create_program` is **not** recreated in this migration — nothing in its body references `'streak'` by name (the type value is just data it inserts, not a branch), so it needs no change.

- [ ] **Step 2: Write the schema test**

```ts
// test/db/remove-streak-type-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0025_loopkit_remove_streak_type.sql",
  "utf8",
);

describe("0025 remove streak type migration", () => {
  it("drops the old programs.type check constraint", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs drop constraint if exists programs_type_check/i,
    );
  });

  it("narrows programs.type to exclude streak", () => {
    expect(sql).toMatch(/add constraint programs_type_check/i);
    expect(sql).toMatch(
      /check \(type in \('stamp','lucky','plant','wheel','scratch'\)\)/i,
    );
    expect(sql).not.toMatch(/'streak'/);
  });

  it("recreates enroll_card without a streak branch", () => {
    expect(sql).toMatch(/create or replace function loopkit\.enroll_card/i);
    expect(sql).not.toMatch(/v_program\.type = 'streak'/);
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm vitest run test/db/remove-streak-type-schema.test.ts`
Expected: PASS (3/3)

- [ ] **Step 4: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all clean/passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0025_loopkit_remove_streak_type.sql test/db/remove-streak-type-schema.test.ts
git commit -m "feat: migration 0025 - remove Streak Club from the database (no live vendors yet)"
```

---

### Task 2: Engine layer, additive — Stamp's flame variant, FlameLayers component

**This task is purely additive.** It does not touch `src/lib/engine/streak.ts`, `src/lib/engine/index.ts`'s streak switch cases, or `src/lib/program-config.ts`'s `ProgramType`/`buildStreakConfig` — those are deleted later, in Task 6, once Tasks 3-5 have removed every consumer. See the Global Constraints note on task ordering.

**Files:**

- Modify: `src/lib/engine/stamp.ts`
- Modify: `src/lib/engine/types.ts`
- Create: `src/components/flame-layers.tsx`
- Test: `test/lib/engine/stamp.test.ts` (extend)
- Test: `src/components/flame-layers.dom.test.tsx` (new)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `StampConfig.variant?: "dots" | "flame"`; `ProgressView` gains a new member `{ kind: "flame"; filled: number; total: number; stage: number; stageName: string; totalStages: number }` (its existing `streak` member is untouched — removed later, in Task 6); `FlameLayers({ filled, total, stage, stageName, className? })` component. `ProgramType` is unaffected by this task — still 6 values (streak included) until Task 6. Tasks 3-5 consume the `flame` view kind and `FlameLayers`.

- [ ] **Step 1: Write the failing test for Stamp's flame variant**

Append to `test/lib/engine/stamp.test.ts`:

```ts
describe("stampStrategy flame variant", () => {
  const flameCfg = {
    stamps_required: 8,
    reward_text: "free kopi",
    variant: "flame" as const,
  };

  it("stage 0 (Spark) below the 50% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 2,
      total: 8,
      stage: 0,
      stageName: "Spark",
      totalStages: 3,
    });
  });

  it("stage 1 (Inner Flame) at exactly the 50% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 4, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 4,
      total: 8,
      stage: 1,
      stageName: "Inner Flame",
      totalStages: 3,
    });
  });

  it("stage 2 (Full Blaze) at 100%", () => {
    const p = stampStrategy.progress(
      { stamp_count: 8, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 8,
      total: 8,
      stage: 2,
      stageName: "Full Blaze",
      totalStages: 3,
    });
  });

  it("rounds the 50% threshold sensibly for an odd stamps_required", () => {
    const oddCfg = { ...flameCfg, stamps_required: 7 };
    // round(7 * 0.5) = 4
    const below = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(below.view).toMatchObject({ stage: 0 });
    const at = stampStrategy.progress(
      { stamp_count: 4, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(at.view).toMatchObject({ stage: 1 });
  });

  it("dots variant (default, no variant field) is unaffected", () => {
    const p = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({ kind: "dots", filled: 3, total: 5 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/lib/engine/stamp.test.ts`
Expected: FAIL — `config.variant` doesn't exist yet / view kind mismatch.

- [ ] **Step 3: Update `src/lib/engine/stamp.ts`**

Replace the full file:

```ts
import type { Strategy } from "@/lib/engine/types";

export type StampConfig = {
  stamps_required: number;
  reward_text: string;
  variant?: "dots" | "flame";
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
    return {
      stage: rewardReady ? "ready" : "collecting",
      label: `${filled}/${total} stamps`,
      view: { kind: "dots", filled, total },
      rewardReady,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const next = Math.min(state.stamp_count + 1, config.stamps_required);
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

`apply`/`redeem`/`defaults` bodies are byte-identical to before — only `progress()` changed.

- [ ] **Step 4: Update `src/lib/engine/types.ts`**

Add the `flame` member to the `ProgressView` union — **keep the existing `streak` member** (it's removed later, in Task 6, once every consumer of it is gone):

```ts
export type ProgressView =
  | { kind: "dots"; filled: number; total: number }
  | {
      kind: "flame";
      filled: number;
      total: number;
      stage: number;
      stageName: string;
      totalStages: number;
    }
  | {
      kind: "plant";
      stage: number;
      stageName: string;
      totalStages: number;
      wilting: boolean;
    }
  | {
      kind: "chance";
      variant: "wheel" | "scratch";
      segments: { id: string; label: string; reward: boolean }[];
      landedId: string | null;
    }
  | {
      kind: "streak";
      current: number;
      target: number;
      status: "active" | "grace" | "broken" | "none";
    };
```

The rest of the file (`Progress`, `Strategy`, `EngineEvent`) is unchanged. Do not touch `src/lib/engine/index.ts`, `src/lib/engine/streak.ts`, or `src/lib/program-config.ts` in this task.

- [ ] **Step 5: Write the FlameLayers component and its test**

`src/components/flame-layers.tsx` (new file):

```tsx
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function FlameLayers({
  filled,
  total,
  stage,
  stageName,
  className,
}: {
  filled: number;
  total: number;
  stage: number;
  stageName: string;
  className?: string;
}) {
  const innerLit = stage >= 1;
  const outerLit = stage >= 2;
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative flex size-16 items-center justify-center">
        <Flame
          className={cn(
            "absolute size-16 text-amber-500/40 transition-opacity",
            outerLit ? "opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        />
        <Flame
          className={cn(
            "relative size-10 transition-colors",
            innerLit ? "text-gold-accent" : "text-muted-foreground opacity-50",
          )}
          aria-hidden="true"
        />
      </div>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {stageName} — {filled}/{total}
      </p>
    </div>
  );
}
```

`src/components/flame-layers.dom.test.tsx` (new file):

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlameLayers } from "@/components/flame-layers";

describe("FlameLayers", () => {
  it("renders the Spark stage label and count", () => {
    render(<FlameLayers filled={2} total={8} stage={0} stageName="Spark" />);
    expect(screen.getByText("Spark — 2/8")).toBeInTheDocument();
  });

  it("renders the Inner Flame stage label and count", () => {
    render(
      <FlameLayers filled={4} total={8} stage={1} stageName="Inner Flame" />,
    );
    expect(screen.getByText("Inner Flame — 4/8")).toBeInTheDocument();
  });

  it("renders the Full Blaze stage label and count", () => {
    render(
      <FlameLayers filled={8} total={8} stage={2} stageName="Full Blaze" />,
    );
    expect(screen.getByText("Full Blaze — 8/8")).toBeInTheDocument();
  });

  it("renders two flame icons (inner + outer layers)", () => {
    const { container } = render(
      <FlameLayers filled={8} total={8} stage={2} stageName="Full Blaze" />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/engine/stamp.test.ts src/components/flame-layers.dom.test.tsx`
Expected: PASS, all tests.

- [ ] **Step 7: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all clean/passing — this task is purely additive (nothing deleted, nothing else in the repo references the new `flame` view kind yet), so there is no legitimate reason for any of these to fail. If something fails, it's a real problem with this task's own changes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine/stamp.ts src/lib/engine/types.ts src/components/flame-layers.tsx src/components/flame-layers.dom.test.tsx test/lib/engine/stamp.test.ts
git commit -m "feat: Stamp's flame variant and FlameLayers component (additive, Streak Club untouched)"
```

---

### Task 3: Render sites, redeem action, and dashboard display — delete Streak Club, add Flame Club

**Files:**

- Modify: `src/app/c/program-card-status.tsx`
- Modify: `src/app/setup/preview-card.tsx`
- Modify: `src/app/setup/preview-card.dom.test.tsx`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Modify: `src/app/dashboard/actions.ts`
- Modify: `src/app/dashboard/program-display.ts`
- Modify: `src/app/dashboard/program-display.test.ts`
- Modify: `test/app/dashboard-actions.test.ts`
- Modify: `test/app/check-status-action.test.ts`
- Modify: `src/app/dashboard/counter/counter-page.dom.test.tsx`
- Delete: `src/components/streak-flame.tsx`

**Interfaces:**

- Consumes: `ProgressView`'s `flame` member and `FlameLayers` from Task 2.
- Produces: nothing later tasks depend on programmatically. This task only touches render sites and the streak-specific redeem action — it does not touch `program.ts`, `setup-form.tsx`, or `preview-state.ts`/`preview-animation.ts` (Tasks 4 and 5).

**Note (correction to the approved spec):** the spec's Section D said `serve-customer.tsx`'s "result panel's per-kind switch gains the same [flame] branch." This is **not accurate** — `serve-customer.tsx`'s `mode: "stamp"` result (`StampCard = { id, phone, stamp_count }`) renders a plain text line (`{result.card.stamp_count} / {stampsRequired} stamps`), not a `view`-kind switch at all. Flame Club (type `"stamp"`) flows through this exact same text-only "stamp" mode automatically — no new branch is needed here. This task therefore only **deletes** streak-specific code from this file; it adds nothing.

- [ ] **Step 1: Update `src/app/c/program-card-status.tsx`**

Remove the `StreakFlame` import:

```ts
import { StreakFlame } from "@/components/streak-flame";
```

Add the `FlameLayers` import (alongside the existing component imports):

```ts
import { FlameLayers } from "@/components/flame-layers";
```

In the view-kind switch, replace the `view?.kind === "streak"` branch with a `view?.kind === "flame"` branch:

```tsx
{view?.kind === "plant" ? (
  <div className="flex flex-col items-center gap-2">
    <Plant
      stage={view.stage}
      totalStages={view.totalStages}
      wilting={view.wilting}
    />
  </div>
) : view?.kind === "flame" ? (
  <div className="flex flex-col items-center gap-2">
    <FlameLayers
      filled={view.filled}
      total={view.total}
      stage={view.stage}
      stageName={view.stageName}
    />
  </div>
) : view?.kind === "chance" ? (
```

(the `chance`/`dots` branches below are unchanged)

- [ ] **Step 2: Update `src/app/setup/preview-card.tsx`**

Replace the full file:

```tsx
import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";

// Mirrors ProgramCardStatus's view-kind switch (src/app/c/program-card-status.tsx)
// — same components, same props — so the /setup preview can never visually
// drift from a real customer card. No redeem/regenerate interactivity —
// this is a static snapshot of the current form values, not a live card.
//
// Unlike ProgramCardStatus, every visual sits in one fixed-height, centered
// box (h-36) here: switching card type in /setup shouldn't make the preview
// panel jump around in height between a wide stamp grid, a square plant/
// wheel, or a compact flame layer.
export function PreviewCard({
  progress,
  name,
  rewardText,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
}) {
  const view = progress.view;
  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer preview
      </p>
      <p className="text-sm font-semibold">{name || "Your card"}</p>
      <div className="flex h-36 items-center justify-center">
        {view.kind === "plant" ? (
          <Plant
            stage={view.stage}
            totalStages={view.totalStages}
            wilting={view.wilting}
          />
        ) : view.kind === "flame" ? (
          <FlameLayers
            filled={view.filled}
            total={view.total}
            stage={view.stage}
            stageName={view.stageName}
          />
        ) : view.kind === "chance" ? (
          view.variant === "wheel" ? (
            <Wheel segments={view.segments} landedId={view.landedId} />
          ) : (
            <ScratchCard revealed={false} label="" reward={false} />
          )
        ) : view.kind === "dots" ? (
          <StampDots filled={view.filled} total={view.total} />
        ) : null}
      </div>
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Update `src/app/setup/preview-card.dom.test.tsx`**

Replace the `"renders the streak flame for a streak view"` test with a flame-layers test:

```tsx
it("renders the flame layers for a flame view", () => {
  const progress: Progress = {
    stage: "collecting",
    label: "Inner Flame — 4/8",
    view: {
      kind: "flame",
      filled: 4,
      total: 8,
      stage: 1,
      stageName: "Inner Flame",
      totalStages: 3,
    },
    rewardReady: false,
  };
  render(
    <PreviewCard
      progress={progress}
      name="Weekly regular"
      rewardText="Free item"
    />,
  );
  expect(screen.getByText("Inner Flame — 4/8")).toBeInTheDocument();
});
```

- [ ] **Step 4: Delete `src/components/streak-flame.tsx`**

```bash
git rm src/components/streak-flame.tsx
```

- [ ] **Step 5: Update `src/app/dashboard/serve-customer.tsx`**

Remove the `StreakFlame` import and the `redeemStreakAction` import:

```ts
import { StreakFlame } from "@/components/streak-flame";
```

```ts
import {
  stampAction,
  recordVisitAction,
  lookupAction,
  redeemPlantAction,
  redeemStreakAction,
  regenerateCardAction,
} from "@/app/dashboard/actions";
```

becomes:

```ts
import {
  stampAction,
  recordVisitAction,
  lookupAction,
  redeemPlantAction,
  regenerateCardAction,
} from "@/app/dashboard/actions";
```

Remove the `StreakView` type and the `"streak"` variant from `ServeResult`:

```ts
type PlantView = {
  kind: "plant";
  stage: number;
  stageName: string;
  totalStages: number;
  wilting: boolean;
};

type ChanceView = {
  kind: "chance";
  variant: "wheel" | "scratch";
  segments: { id: string; label: string; reward: boolean }[];
  landedId: string | null;
};

type ServeResult =
  | { mode: "stamp"; phone: string; card: StampCard; rewardReady: boolean }
  | {
      mode: "lucky";
      phone: string;
      played: boolean;
      won: boolean;
      label: string;
    }
  | {
      mode: "plant";
      phone: string;
      view: PlantView;
      label: string;
      rewardReady: boolean;
      rewardUnlocked: boolean;
    }
  | {
      mode: "chance";
      phone: string;
      view: ChanceView;
      label: string;
      wonThisTime: boolean;
      rewardText: string;
    };
```

Remove the `streak` entry from `ACTION_COPY`:

```ts
const ACTION_COPY: Record<string, { idle: string; pending: string }> = {
  lucky: { idle: "Play", pending: "Playing…" },
  plant: { idle: "Water", pending: "Watering…" },
  stamp: { idle: "Add stamp", pending: "Stamping…" },
  wheel: { idle: "Spin", pending: "Spinning…" },
  scratch: { idle: "Scratch", pending: "Scratching…" },
};
```

In `onPrimary`, remove the `else if (type === "streak") { ... }` block entirely (it sits between the `plant` block and the `wheel`/`scratch` block) — the `plant` block's closing `}` connects straight to `} else if (type === "wheel" || type === "scratch") {`.

In `onLookup`, remove the `else if (type === "streak") { ... }` block entirely (it sits between the `wheel`/`scratch` block and the final `else` stamp fallback) — the `wheel`/`scratch` block's closing `}` connects straight to `} else {`.

Remove the `confirmRedeemStreak` function entirely.

Remove the `{result?.mode === "streak" && ( ... )}` JSX block entirely (the whole block including its nested `AlertDialog` for redeeming, roughly 55 lines).

- [ ] **Step 6: Update `src/app/dashboard/actions.ts`**

Remove the `resolveStreakState` import and the `streakStrategy`/`StreakConfig` import:

```ts
import {
  applyVisit,
  getProgress,
  resolvePlantState,
  resolveStreakState,
} from "@/lib/engine";
import { plantStrategy, type PlantConfig } from "@/lib/engine/plant";
import { streakStrategy, type StreakConfig } from "@/lib/engine/streak";
```

becomes:

```ts
import { applyVisit, getProgress, resolvePlantState } from "@/lib/engine";
import { plantStrategy, type PlantConfig } from "@/lib/engine/plant";
```

Remove the `redeemStreakAction` function entirely (from its doc comment through its closing `}`, ending just before the next export in the file).

- [ ] **Step 7: Update `src/app/dashboard/program-display.ts`**

Remove the `streak` entry from `PROGRAM_TYPE_BADGE`:

```ts
export const PROGRAM_TYPE_BADGE: Record<
  string,
  { label: string; variant: "default" | "gold" }
> = {
  stamp: { label: "Stamp", variant: "default" },
  lucky: { label: "Lucky Tap", variant: "default" },
  plant: { label: "Sprout", variant: "gold" },
  wheel: { label: "Wheel", variant: "default" },
  scratch: { label: "Scratch", variant: "default" },
};
```

Remove the `if (type === "streak") { ... }` branch from `describeProgram` (Flame Club falls through to the existing default `return \`Buy ${stamps_required}, get 1 ${reward_text}\`;` — this is out of scope for this plan; a Flame-Club-specific description string is a future polish item, not required by the approved spec).

- [ ] **Step 8: Update `src/app/dashboard/program-display.test.ts`**

Remove `"streak"` from the `PROGRAM_TYPE_BADGE` type list test:

```ts
describe("PROGRAM_TYPE_BADGE", () => {
  it("has an entry for every program type", () => {
    for (const type of ["stamp", "lucky", "plant", "wheel", "scratch"]) {
      expect(PROGRAM_TYPE_BADGE[type]).toBeDefined();
    }
  });
});
```

Remove the `"describes a streak program"` test case entirely from the `describeProgram` describe block.

- [ ] **Step 9: Update `test/app/dashboard-actions.test.ts`**

Remove `redeemStreakAction` from the import:

```ts
import {
  stampAction,
  lookupAction,
  redeemPlantAction,
  redeemStreakAction,
} from "@/app/dashboard/actions";
import { buildPlantConfig, buildStreakConfig } from "@/lib/program";
```

becomes:

```ts
import {
  stampAction,
  lookupAction,
  redeemPlantAction,
} from "@/app/dashboard/actions";
import { buildPlantConfig } from "@/lib/program";
```

Remove the entire `describe("redeemStreakAction returns fresh progress", () => { ... })` block.

- [ ] **Step 10: Update `test/app/check-status-action.test.ts`**

In the `"returns multiple cards when the phone has more than one program at this vendor"` test, replace the second fixture card (currently `type: "streak"`) with a `type: "plant"` fixture so the test still exercises two genuinely different program types:

```ts
      {
        program_id: "p2",
        name: "Grow-a-kopi",
        type: "plant",
        config: {
          stages: [
            { name: "Seed", threshold: 0 },
            { name: "Sprout", threshold: 1 },
            { name: "Leafing", threshold: 2 },
            { name: "Budding", threshold: 3 },
            { name: "Bloom", threshold: 4 },
          ],
          growth_per_visit: 1,
          grace_days: 5,
          decay_rate: 0.5,
          floor_growth: 1,
          reward_text: "Free set",
        },
        state: {
          growth: 1,
          last_visit_at: "2026-07-01T00:00:00Z",
          blooms: 0,
          bloomed: false,
        },
        stamp_count: 0,
        card_token: "tok_2",
        reward_text: "Free set",
        stamps_required: 4,
        expiry_days: null,
        cycle_started_at: null,
        active: true,
      },
```

- [ ] **Step 11: Update `src/app/dashboard/counter/counter-page.dom.test.tsx`**

Remove the `redeemStreakAction: vi.fn(),` line from the `@/app/dashboard/actions` mock.

- [ ] **Step 12: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all passing (streak-specific tests removed, new flame-layers/flame-view tests passing).

- [ ] **Step 13: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: fully clean. This task deletes only _consumers_ of `streak.ts`/`ProgressView`'s `streak` member — it never touches `streak.ts`, `engine/index.ts`, `program-config.ts`, or `ProgressView` itself (those stay untouched until Task 6), so nothing here should be broken by files Tasks 4-5 haven't reached yet.

- [ ] **Step 14: Commit**

```bash
git add src/app/c/program-card-status.tsx src/app/setup/preview-card.tsx src/app/setup/preview-card.dom.test.tsx src/app/dashboard/serve-customer.tsx src/app/dashboard/actions.ts src/app/dashboard/program-display.ts src/app/dashboard/program-display.test.ts test/app/dashboard-actions.test.ts test/app/check-status-action.test.ts src/app/dashboard/counter/counter-page.dom.test.tsx
git rm src/components/streak-flame.tsx
git commit -m "feat: wire FlameLayers into render sites, delete Streak Club's redeem action and display copy"
```

---

### Task 4: Save-path wiring and `/setup` UI — Flame Club tile, delete Streak Club fields

**Files:**

- Modify: `src/lib/program.ts`
- Modify: `src/app/setup/actions.ts`
- Modify: `src/app/setup/page.tsx`
- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/setup-form.dom.test.tsx`
- Modify: `test/lib/save-program-schema.test.ts`
- Modify: `test/lib/build-program-fields.test.ts`

**Interfaces:**

- Consumes: `ProgramType` from `program-config.ts` (still 6 values, streak included, until Task 6 — this task doesn't need it shrunk, since it only deletes streak's _usages_, not the type itself).
- Produces: `saveProgramSchema`'s stamp variant accepts an optional `variant: "dots" | "flame"`; `buildProgramFields`'s stamp branch's config includes `variant`. Task 5 (preview wiring) consumes the same `variant` concept via `PreviewInput`, independently — it does not import anything from this task.

- [ ] **Step 1: Update `src/lib/program.ts`**

Remove the `StreakConfig`/`buildStreakConfig` import and re-export:

```ts
import { z } from "zod";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";
import {
  buildChanceConfig,
  buildPlantConfig,
  segmentInputSchema,
  type ProgramType,
  type SegmentInput,
} from "@/lib/program-config";

export type { ProgramType, SegmentInput };
export { buildChanceConfig, buildPlantConfig };
```

In `saveProgramSchema`, add an optional `variant` field to the stamp variant and delete the streak variant entirely:

```ts
export const saveProgramSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stamp"),
    name: z.string().trim().min(1).max(60),
    stamps_required: z.coerce.number().int().min(2).max(20),
    reward_text: z.string().trim().min(1).max(80),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    head_start_percent: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(5).max(50).optional(),
    ),
    variant: z.enum(["dots", "flame"]).optional(),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("lucky"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    win_percent: z.coerce.number().int().min(2).max(100),
    pity_ceiling: z.coerce.number().int().min(2).max(20),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("plant"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    visits_to_bloom: z.coerce.number().int().min(4).max(20),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    head_start_percent: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(5).max(50).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("wheel"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    segments: z.preprocess(
      parseSegments,
      z.array(segmentInputSchema).min(2).max(6),
    ),
    pity_ceiling: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(2).max(20).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
  z.object({
    type: z.literal("scratch"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    segments: z.preprocess(
      parseSegments,
      z.array(segmentInputSchema).min(2).max(6),
    ),
    pity_ceiling: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(2).max(20).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
]);
```

In `buildProgramFields`, add `variant` to the stamp branch's config and delete the streak branch entirely:

```ts
export function buildProgramFields(data: SaveProgramInput): {
  type: string;
  stampsRequired: number;
  config: Json;
  headStart: boolean;
  headStartPercent: number;
} {
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
      },
    };
  }
  if (data.type === "lucky") {
    return {
      type: "lucky",
      stampsRequired: data.pity_ceiling,
      headStart: false,
      headStartPercent: 20,
      config: {
        win_probability: data.win_percent / 100,
        pity_ceiling: data.pity_ceiling,
        cooldown_visits: 0,
        reward_text: data.reward_text,
      },
    };
  }
  if (data.type === "plant") {
    return {
      type: "plant",
      stampsRequired: data.visits_to_bloom,
      headStart: data.head_start,
      headStartPercent: data.head_start_percent ?? 20,
      config: buildPlantConfig(data.visits_to_bloom, data.reward_text) as Json,
    };
  }
  return {
    type: data.type,
    stampsRequired: data.pity_ceiling ?? 10,
    headStart: false,
    headStartPercent: 20,
    config: buildChanceConfig(
      data.type,
      data.segments,
      data.pity_ceiling,
      data.reward_text,
    ) as Json,
  };
}
```

Everything else in the file (`Program`, `PROGRAM_COLUMNS`, `listPrograms`, `getProgramById`, `currentProgram`, `Entitlement`, `applyDueCutovers`, `getProgram`) is unchanged.

- [ ] **Step 2: Update `src/app/setup/actions.ts`**

In all 3 `saveProgramSchema.safeParse({...})` calls (`saveProgramAction`, `changeTypeAction`, `prepProgramAction`), remove the `period_days`/`target_streak` reads and add a `variant` read:

```ts
const parsed = saveProgramSchema.safeParse({
  type: isEdit ? lockedType : formData.get("type"),
  name: formData.get("name"),
  stamps_required: formData.get("stamps_required"),
  reward_text: formData.get("reward_text"),
  win_percent: formData.get("win_percent"),
  pity_ceiling: formData.get("pity_ceiling"),
  visits_to_bloom: formData.get("visits_to_bloom"),
  segments: formData.get("segments"),
  expiry_days: formData.get("expiry_days"),
  head_start: formData.get("head_start"),
  head_start_percent: formData.get("head_start_percent"),
  variant: formData.get("variant"),
});
```

Apply this exact same change to `changeTypeAction`'s and `prepProgramAction`'s `safeParse` calls (only the `type:` line differs between the three — `isEdit ? lockedType : formData.get("type")` in `saveProgramAction`, `formData.get("type")` in the other two — everything else in the object is identical across all three). Do not change anything else in `actions.ts` — `activateProgramAction` and `scheduleRetirementAction` don't touch `saveProgramSchema` at all.

- [ ] **Step 3: Update `src/app/setup/page.tsx`**

Remove the `streak` entry from the local type-label map:

```ts
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};
```

(drops the `streak: "Streak Club",` line — if this map is also used for a Flame Club label elsewhere on this page, check the surrounding code; if it's only used for the locked-type display on `/setup?edit=`, no `flame` entry is needed here since edit mode always shows `type: "stamp"` regardless of variant, using the existing `stamp: "Stamp card"` entry — do NOT add a flame-specific entry to this particular map unless you find it's also driving something variant-aware; read the full file first to confirm its actual usage before editing.)

- [ ] **Step 4: Update `src/app/setup/setup-form.tsx`**

Add a `TypeOptionValue` type and update `typeLabels`/`TYPE_OPTIONS`:

```ts
type TypeOptionValue =
  "stamp" | "flame" | "lucky" | "plant" | "wheel" | "scratch";

const typeLabels: Record<TypeOptionValue, string> = {
  stamp: "Stamp card",
  flame: "Flame Club",
  lucky: "Lucky Tap",
  plant: "Sprout",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};

const TYPE_OPTIONS = [
  {
    value: "stamp",
    label: "Stamp card",
    description: "Collect stamps toward a reward",
  },
  {
    value: "flame",
    label: "Flame Club",
    description: "Build a flame with every visit",
  },
  {
    value: "lucky",
    label: "Lucky Tap",
    description: "A chance to win on every visit",
  },
  {
    value: "plant",
    label: "Sprout",
    description: "Grow a plant with every visit",
  },
  {
    value: "wheel",
    label: "Spin the Wheel",
    description: "Spin for a prize on every visit",
  },
  {
    value: "scratch",
    label: "Scratch Card",
    description: "Scratch for a prize on every visit",
  },
] as const;
```

Update `initialType` (drop the streak clause):

```ts
const initialType: ProgramType =
  program?.type === "lucky" ||
  program?.type === "plant" ||
  program?.type === "wheel" ||
  program?.type === "scratch"
    ? program.type
    : "stamp";
const [type, setType] = useState<ProgramType>(initialType);
```

Add `variant` state right after it, and a computed `selectedOptionKey` for tile highlighting/edit-mode label lookup:

```ts
const config = (program?.config ?? {}) as {
  win_probability?: number;
  pity_ceiling?: number;
  reward_text?: string;
  stages?: { threshold: number }[];
  segments?: { label: string; weight: number; reward_text?: string }[];
  variant?: string;
};

const [variant, setVariant] = useState<"dots" | "flame">(
  config.variant === "flame" ? "flame" : "dots",
);
const selectedOptionKey: TypeOptionValue =
  type === "stamp" && variant === "flame" ? "flame" : (type as TypeOptionValue);
```

(the `config` object's type loses `period_days?: number; target_streak?: number;` and gains `variant?: string;` — place the `variant`/`selectedOptionKey` declarations directly after the existing `type`/`config` declarations, before the other `useState` calls)

Remove the `periodDays`/`targetStreak` state entirely:

```ts
const [periodDays, setPeriodDays] = useState(config.period_days ?? 7);
const [targetStreak, setTargetStreak] = useState(config.target_streak ?? 4);
```

Update the `usePreviewAnimation` call — drop `periodDays, targetStreak,` and add `variant,`:

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
});
```

Update `pickType` to accept `TypeOptionValue`, map `"flame"` to `type: "stamp"` + `variant: "flame"`, and drop the `periodDays`/`targetStreak` resets:

```ts
function pickType(value: TypeOptionValue) {
  setType(value === "flame" ? "stamp" : value);
  setVariant(value === "flame" ? "flame" : "dots");
  setName("");
  setRewardText("");
  setStampsRequired(10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setHeadStartPercent(20);
}
```

In the edit-mode locked label and the type-picker grid, swap `type` for `selectedOptionKey`:

```tsx
{
  isEdit ? (
    <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
      {typeLabels[selectedOptionKey]}
    </p>
  ) : (
    <div className="grid grid-cols-2 gap-2">
      {TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.label}
          onClick={() => pickType(option.value)}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
            selectedOptionKey === option.value
              ? "border-primary bg-primary/10"
              : "bg-card hover:bg-muted/50",
          )}
        >
          <span className="text-sm font-semibold">{option.label}</span>
          <span className="text-xs text-muted-foreground">
            {option.description}
          </span>
        </button>
      ))}
    </div>
  );
}
```

Add a hidden `variant` input, gated on `type === "stamp"` (right after the existing hidden `type` input):

```tsx
<input type="hidden" name="type" value={type} />;
{
  type === "stamp" ? (
    <input type="hidden" name="variant" value={variant} />
  ) : null;
}
```

Update the `stamps_required` field's label to be variant-aware:

```tsx
                <div className="space-y-2">
                  <Label htmlFor="stamps_required" className={labelClass}>
                    {variant === "flame" ? "Visits for full blaze" : "Stamps required"}
                  </Label>
```

(the `<Input>`, quick-pick chips, and everything else in the stamp field block below it are unchanged — Flame Club renders through this exact same block since its `type` is `"stamp"`)

Remove the `type === "streak" ? ( ... ) :` branch from the field-details ternary (the block with "Days per streak window"/"Streak length to earn reward" inputs). The ternary chain:

```tsx
                {type === "streak" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* period_days / target_streak inputs */}
                  </div>
                ) : type === "wheel" || type === "scratch" ? (
```

becomes:

```tsx
                {type === "wheel" || type === "scratch" ? (
```

(with its existing wheel/scratch body unchanged, and the final `else` branch — lucky's win_percent/pity_ceiling fields — unchanged in content, but now only ever renders for `type === "lucky"` since stamp/plant have their own top-level branches and wheel/scratch/streak are the other cases)

Update the card-name placeholder ternary (streak's `"Weekly regular"` fallback is now unreachable — the branch only ever renders for lucky/wheel/scratch):

```tsx
                    placeholder={
                      type === "lucky"
                        ? "Lucky topping"
                        : type === "wheel"
                          ? "Spin to win"
                          : "Scratch & win"
                    }
```

Update the head-start toggle's condition (drop `|| type === "streak"` — Flame Club already qualifies via `type === "stamp"`):

```tsx
            {(type === "stamp" || type === "plant") && (
```

- [ ] **Step 5: Update `src/app/setup/setup-form.dom.test.tsx`**

Replace the two `"Streak Club"` button-name assertions with `"Flame Club"`:

```ts
expect(screen.getByRole("button", { name: "Flame Club" })).toBeInTheDocument();
```

(in the `"shows a single flat grid of all six types with no template/custom toggle"` test)

```ts
await user.click(screen.getByRole("button", { name: "Flame Club" }));
```

(in the `"resets name and reward to blank when a new type is picked"` test)

Add a new test verifying Flame Club submits `type=stamp` + `variant=flame` and shows the variant-aware label:

```ts
  it("Flame Club tile saves type=stamp with variant=flame and the flame-specific label", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Flame Club" }));
    expect(screen.getByText("Visits for full blaze")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("flame");
  });
```

- [ ] **Step 6: Update `test/lib/save-program-schema.test.ts`**

Remove the `"accepts a valid streak program"` and `"rejects a streak program with a target below the two-streak minimum"` tests.

Add tests for the stamp variant field:

```ts
it("accepts a stamp program with variant flame", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Weekly regular",
    stamps_required: "8",
    reward_text: "Free item",
    head_start: "false",
    variant: "flame",
  });
  expect(result.success).toBe(true);
});

it("accepts a stamp program with variant absent (defaults to dots at buildProgramFields)", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee card",
    stamps_required: "10",
    reward_text: "Free kopi",
    head_start: "false",
  });
  expect(result.success).toBe(true);
});

it("rejects a stamp program with an invalid variant value", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee card",
    stamps_required: "10",
    reward_text: "Free kopi",
    head_start: "false",
    variant: "sparkles",
  });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 7: Update `test/lib/build-program-fields.test.ts`**

Replace the `"builds a streak program's fields via buildStreakConfig"` test with a stamp-variant test:

```ts
it("builds a stamp program's config with variant flame", () => {
  const result = buildProgramFields({
    type: "stamp",
    name: "Weekly regular",
    stamps_required: 8,
    reward_text: "Free item",
    head_start: false,
    variant: "flame",
    expiry_days: undefined,
  } as SaveProgramInput);

  expect(result.config).toMatchObject({
    stamps_required: 8,
    reward_text: "Free item",
    variant: "flame",
  });
});

it("defaults a stamp program's config variant to dots when absent", () => {
  const result = buildProgramFields({
    type: "stamp",
    name: "Coffee card",
    stamps_required: 10,
    reward_text: "Free kopi",
    head_start: true,
    expiry_days: undefined,
  } as SaveProgramInput);

  expect(result.config).toMatchObject({ variant: "dots" });
});
```

(the existing `"builds a stamp program's fields"` test's `toEqual` assertion must also be updated — it currently expects `config: { stamps_required: 10, reward_text: "Free kopi" }` with no `variant` key; add `variant: "dots"` to that expected object)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all passing.

- [ ] **Step 9: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: fully clean. `preview-state.ts`/`preview-animation.ts` (Task 5) still import `buildStreakConfig` from `program-config.ts` and still have their own streak branches — that's fine and unaffected by this task, since `program-config.ts` itself is untouched here and `buildStreakConfig` still exists (it isn't deleted until Task 6).

- [ ] **Step 10: Commit**

```bash
git add src/lib/program.ts src/app/setup/actions.ts src/app/setup/page.tsx src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx test/lib/save-program-schema.test.ts test/lib/build-program-fields.test.ts
git commit -m "feat: Flame Club tile in /setup, stamp variant save-path wiring, delete Streak Club fields"
```

---

### Task 5: Preview wiring — `/setup` live preview and animation

**Files:**

- Modify: `src/app/setup/preview-state.ts`
- Modify: `src/app/setup/preview-animation.ts`
- Modify: `test/app/preview-state.test.ts`
- Modify: `src/app/setup/preview-animation.dom.test.tsx`

**Interfaces:**

- Consumes: `buildPlantConfig`/`buildChanceConfig` from `program-config.ts` (unchanged so far), `PreviewInput` is entirely defined and consumed within this task.
- Produces: `PreviewInput` gains `variant: "dots" | "flame"`, loses `periodDays`/`targetStreak`. After this task, `buildStreakConfig` (in `program-config.ts`) has no remaining callers anywhere in the repo — it becomes dead code, cleaned up next in Task 6.

- [ ] **Step 1: Update `src/app/setup/preview-state.ts`**

Remove the `buildStreakConfig` import:

```ts
import {
  buildChanceConfig,
  buildPlantConfig,
  type ProgramType,
} from "@/lib/program-config";
```

Update `PreviewInput` — drop `periodDays`/`targetStreak`, add `variant`:

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
  variant: "dots" | "flame";
};
```

Update `buildPreviewProgram` — remove the `if (input.type === "streak")` branch, add `variant` to the stamp branch's config:

```ts
export function buildPreviewProgram(
  input: Omit<PreviewInput, "headStart">,
): ProgramLike {
  if (input.type === "stamp") {
    return {
      type: "stamp",
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      config: {
        stamps_required: input.stampsRequired,
        reward_text: input.rewardText,
        variant: input.variant,
      },
    };
  }

  if (input.type === "plant") {
    return {
      type: "plant",
      stamps_required: input.visitsToBloom,
      reward_text: input.rewardText,
      config: buildPlantConfig(input.visitsToBloom, input.rewardText),
    };
  }

  if (input.type === "lucky") {
    const pityCeiling = input.pityCeiling ?? 8;
    return {
      type: "lucky",
      stamps_required: pityCeiling,
      reward_text: input.rewardText,
      config: {
        win_probability: input.winPercent / 100,
        pity_ceiling: pityCeiling,
        cooldown_visits: 0,
        reward_text: input.rewardText,
      },
    };
  }

  // wheel / scratch
  return {
    type: input.type,
    stamps_required: input.pityCeiling ?? 10,
    reward_text: input.rewardText,
    config: buildChanceConfig(
      input.type,
      input.segments,
      input.pityCeiling,
      input.rewardText,
    ),
  };
}
```

Update `buildInitialCard` — drop `periodDays`/`targetStreak` from the `Pick<>` type, remove the `if (input.type === "streak")` branch:

```ts
export function buildInitialCard(
  input: Pick<
    PreviewInput,
    | "type"
    | "stampsRequired"
    | "visitsToBloom"
    | "headStart"
    | "headStartPercent"
  >,
  now: Date,
): CardLike {
  if (!input.headStart) return FRESH_CARD;

  if (input.type === "stamp") {
    return {
      state: {},
      stamp_count: headStartStampSeed(
        input.stampsRequired,
        input.headStartPercent,
      ),
      reward_count: 0,
    };
  }

  if (input.type === "plant") {
    return {
      state: {
        growth: headStartPlantGrowth(
          input.visitsToBloom,
          input.headStartPercent,
        ),
        last_visit_at: now.toISOString(),
        blooms: 0,
        bloomed: false,
      },
      stamp_count: 0,
      reward_count: 0,
    };
  }

  return FRESH_CARD;
}
```

`headStartStampSeed`/`headStartPlantGrowth`/`FRESH_CARD`/`buildPreviewProgress` are unchanged.

- [ ] **Step 2: Update `src/app/setup/preview-animation.ts`**

Update the destructuring — drop `periodDays`, `targetStreak`, add `variant`:

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
} = input;
```

Update `recipeKey` to match (drop `periodDays`, `targetStreak`, add `variant` — every `PreviewInput` field must still be represented, per this file's own documented invariant):

```ts
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
]);
```

Remove the streak clock-jump special case — `nextNow` is now always `new Date()`:

```ts
const nextNow = new Date();
const event: EngineEvent = {
  kind: "visit",
  payload: { roll: Math.random() },
};
```

Remove `type` and `periodDays` from the tick effect's dependency array (both are now either unused in the effect body or no longer exist):

```ts
  }, [reducedMotion, phase, card, simulatedNow, program, initialCard]);
```

- [ ] **Step 3: Update `test/app/preview-state.test.ts`**

Update the `base` fixture — drop `periodDays`/`targetStreak`, add `variant`:

```ts
const base = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8 as number | undefined,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
  headStartPercent: 20,
  variant: "dots" as const,
};
```

Remove all 4 streak-specific tests: `"streak: fresh card has no active window"`, `"streak: head start banks one full period"`, `"streak: head-start amount is ignored, always one full period regardless of the percent"` (under `buildPreviewProgress`), and `"seeds the streak head-start position at one banked period"` (under `buildInitialCard`).

Add a test confirming `variant` flows into `buildPreviewProgram`'s stamp config:

```ts
it("stamp: variant flame flows into the built program's config", () => {
  const program = buildPreviewProgram({
    ...base,
    type: "stamp",
    variant: "flame",
  });
  expect(program.config).toMatchObject({ variant: "flame" });
});

it("stamp: variant flame renders a flame view in progress", () => {
  const progress = buildPreviewProgress({
    ...base,
    type: "stamp",
    variant: "flame",
    headStart: true,
  });
  expect(progress.view.kind).toBe("flame");
});
```

(place the first inside the `describe("buildPreviewProgram", ...)` block, the second inside `describe("buildPreviewProgress", ...)`)

- [ ] **Step 4: Update `src/app/setup/preview-animation.dom.test.tsx`**

Update the `base` fixture — drop `periodDays`/`targetStreak`, add `variant`:

```ts
const base: Omit<PreviewInput, "type"> = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
  headStartPercent: 20,
  variant: "dots",
};
```

Remove the `"streak advances one period per tick via a synthetic clock jump"` test entirely.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all passing.

- [ ] **Step 6: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: fully clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/preview-state.ts src/app/setup/preview-animation.ts test/app/preview-state.test.ts src/app/setup/preview-animation.dom.test.tsx
git commit -m "feat: thread stamp variant through the /setup live preview and animation, delete streak branches"
```

---

### Task 6: Engine cleanup — delete Streak Club's engine module, shrink the shared unions

**This task is only safe to run after Tasks 3, 4, and 5 are complete** — it deletes `streak.ts` and shrinks `ProgressView`/`ProgramType`, which is only compilation-safe once every consumer of `streakStrategy`/`StreakConfig`/`StreakState`/`buildStreakConfig`/`ProgressView`'s `streak` member/`ProgramType`'s `"streak"` value has already been removed (Tasks 3-5 did that). See the Global Constraints note on task ordering.

**Files:**

- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/engine/index.ts`
- Modify: `src/lib/program-config.ts`
- Delete: `src/lib/engine/streak.ts`
- Delete: `test/lib/engine/streak.test.ts`

**Interfaces:**

- Consumes: the fully-shipped state of Tasks 2-5 (Flame Club fully wired everywhere; every Streak Club consumer already deleted).
- Produces: `ProgressView` and `ProgramType` are now fully shrunk (streak removed from both). Nothing later depends on this except Task 7's final grep-verification.

- [ ] **Step 1: Verify no remaining consumers before deleting anything**

Run:

```bash
grep -rn "streakStrategy\|StreakConfig\|StreakState\|buildStreakConfig" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules .
```

Expected: hits only inside `src/lib/engine/streak.ts` (its own definitions), `src/lib/engine/index.ts` (the import and switch cases this task is about to remove), `test/lib/engine/streak.test.ts` (about to be deleted), and `src/lib/program-config.ts` (its own `buildStreakConfig` definition and `StreakConfig` import, about to be removed). If any hit turns up anywhere else, **stop** — a prior task missed a deletion, and this task cannot safely proceed until that gap is fixed first (go fix it in the file where the stray reference lives, verify tests still pass there, then re-run this grep).

- [ ] **Step 2: Update `src/lib/engine/types.ts` — remove the `streak` member**

```ts
export type ProgressView =
  | { kind: "dots"; filled: number; total: number }
  | {
      kind: "flame";
      filled: number;
      total: number;
      stage: number;
      stageName: string;
      totalStages: number;
    }
  | {
      kind: "plant";
      stage: number;
      stageName: string;
      totalStages: number;
      wilting: boolean;
    }
  | {
      kind: "chance";
      variant: "wheel" | "scratch";
      segments: { id: string; label: string; reward: boolean }[];
      landedId: string | null;
    };
```

The rest of the file (`Progress`, `Strategy`, `EngineEvent`) is unchanged.

- [ ] **Step 3: Update `src/lib/engine/index.ts`**

Remove the streak import block:

```ts
import {
  streakStrategy,
  type StreakConfig,
  type StreakState,
} from "@/lib/engine/streak";
```

Remove the `resolveStreakConfig` and `resolveStreakState` functions entirely.

Remove the `case "streak":` branch from both `applyVisit` and `getProgress` (the switch falls straight from the `"wheel"`/`"scratch"` case to the `"stamp"`/`default` case):

```ts
export function applyVisit(
  program: ProgramLike,
  card: CardLike,
  event: EngineEvent,
  now: Date,
): { state: unknown; rewardUnlocked: boolean } {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.apply(
        event,
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "plant":
      return plantStrategy.apply(
        event,
        resolvePlantState(card),
        resolvePlantConfig(program),
        now,
      );
    case "wheel":
    case "scratch": {
      const variant = program.type as "wheel" | "scratch";
      return makeChanceStrategy(variant).apply(
        event,
        resolveChanceState(card, variant),
        resolveChanceConfig(program),
        now,
      );
    }
    case "stamp":
    default:
      return stampStrategy.apply(
        event,
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}

export function getProgress(
  program: ProgramLike,
  card: CardLike,
  now: Date,
): Progress {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.progress(
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "plant":
      return plantStrategy.progress(
        resolvePlantState(card),
        resolvePlantConfig(program),
        now,
      );
    case "wheel":
    case "scratch": {
      const variant = program.type as "wheel" | "scratch";
      return makeChanceStrategy(variant).progress(
        resolveChanceState(card, variant),
        resolveChanceConfig(program),
        now,
      );
    }
    case "stamp":
    default:
      return stampStrategy.progress(
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}
```

Everything else in the file (`ProgramLike`, `CardLike`, `hasKeys`, `resolveStampConfig`, `resolveStampState`, lucky/plant/chance resolvers) is unchanged.

- [ ] **Step 4: Delete `src/lib/engine/streak.ts` and `test/lib/engine/streak.test.ts`**

```bash
git rm src/lib/engine/streak.ts test/lib/engine/streak.test.ts
```

- [ ] **Step 5: Update `src/lib/program-config.ts`**

Remove the `StreakConfig` import and the `buildStreakConfig` function. Shrink `ProgramType`:

```ts
export type ProgramType = "stamp" | "lucky" | "plant" | "wheel" | "scratch";
```

The top-of-file import block becomes:

```ts
import { z } from "zod";
import type { PlantConfig } from "@/lib/engine/plant";
import type { ChanceConfig } from "@/lib/engine/chance";
```

`buildPlantConfig` and `buildChanceConfig` are unchanged. The file ends after `buildChanceConfig` — the `buildStreakConfig` function (and its doc comment) is deleted entirely.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all passing.

- [ ] **Step 7: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: fully clean — this is the last TS task, so `pnpm build` must be genuinely green with no exceptions.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine/types.ts src/lib/engine/index.ts src/lib/program-config.ts
git rm src/lib/engine/streak.ts test/lib/engine/streak.test.ts
git commit -m "feat: delete Streak Club's engine module, shrink ProgressView and ProgramType"
```

---

### Task 7: README update and final repo-wide verification

**Files:**

- Modify: `README.md`

**Interfaces:**

- Consumes: the fully-shipped state of Tasks 1-6.
- Produces: nothing — this is the plan's final task.

- [ ] **Step 1: Update `README.md`**

Change the intro blurb (currently mentions "streaks"):

```md
Vendors run a stamp/points program from `/dashboard` (programs, cards,
stamping, flame progress, "lucky" chance rewards); customers collect and view
cards from a phone-friendly `/c` flow via QR. Includes a scratch-card /
wheel reward layer, tiered plans, and an admin console for vendor
```

Change the file-layout comment for `src/app/dashboard/`:

```
src/app/dashboard/     — vendor console (programs, cards, stats)
```

Change the file-layout comment for `src/components/`:

```
src/components/         — wheel, scratch-card, flame-layers, stamp-dots, etc.
```

- [ ] **Step 2: Full repo-wide grep verification**

Run (from the repo root):

```bash
grep -rin "streak" --include="*.ts" --include="*.tsx" --include="*.sql" --exclude-dir=node_modules --exclude-dir=.next .
```

Expected: zero hits **except** inside `supabase/migrations/0011_loopkit_streak_type.sql`, `supabase/migrations/0014_loopkit_head_start.sql`, and `supabase/migrations/0024_loopkit_head_start_percent.sql` (all three are historical migrations, never edited retroactively — the streak text inside them is expected and correct to leave in place).

If any other file has a hit, that is a gap this plan missed — fix it (delete/update the reference) before proceeding, then re-run the grep to confirm zero unexpected hits.

Also run a second, broader grep including docs (informational only, not a gate — these are expected to still mention "streak" as history and are NOT required to be clean):

```bash
grep -rli "streak" --include="*.md" --exclude-dir=node_modules .
```

Expected: only pre-existing dated spec/plan documents from earlier in this project's history, this plan's own file, its spec, and `.superpowers/sdd/progress.md`. Do not edit any of these — they are historical record.

- [ ] **Step 3: Run full verification**

Run: `pnpm check && pnpm test && pnpm build`
Expected: fully clean.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update README for Flame Club, remove Streak Club references"
```
