# Stamp + Plant Redeem-Carryover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Stamp and Plant cards keep accumulating past their reward
threshold if the customer hasn't redeemed yet, and make redeem consume
exactly one threshold's worth, carrying any excess forward instead of
resetting to zero.

**Architecture:** Stamp's stamp/redeem writes live entirely in two SQL RPCs
(`loopkit.add_stamp`, `loopkit.redeem`) untouched since day one — a single
new migration replaces both function bodies. Plant's stamp/redeem logic
lives entirely in a pure TypeScript strategy (`src/lib/engine/plant.ts`) —
no SQL change needed there, just `apply()`/`redeem()`. A third, independent
task updates the two redeem confirmation dialogs' copy to describe
carryover accurately.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase Postgres
(SQL RPCs, `security definer`), Vitest + Testing Library (jsdom).

## Global Constraints

- Scope is Stamp and Plant only. Do not touch Streak, Wheel, or Scratch
  logic in any task.
- No reward-stacking: redeem always grants exactly one reward
  (`reward_count`/`blooms` +1 per call), regardless of how much excess the
  card holds.
- **Keep the codebase clean** (standing project rule): every task replaces
  the old capped/reset code path and old copy strings outright — `create or
replace` the SQL functions, edit `plant.ts`'s functions in place, replace
  (not duplicate) the confirmation dialog text. No dead code, no
  backwards-compatibility branches, no old copy left alongside new copy.
- The SQL migration is hand-applied by the user via the Supabase dashboard
  SQL Editor — there is no linked Supabase CLI in this environment. No
  automated RPC test; the migration file itself must be reviewed carefully
  and its `DEPLOY.md` entry must say exactly what it does, matching every
  prior migration's entry style in `docs/DEPLOY.md`.
- Every task's commit must leave `pnpm check` (prettier --check + eslint +
  tsc --noEmit) clean.

---

### Task 1: SQL migration — remove Stamp's cap, add redeem carryover

**Files:**

- Create: `supabase/migrations/0022_loopkit_stamp_carryover.sql`
- Modify: `docs/DEPLOY.md` (append a migration entry, matching the existing
  numbered-list style used for `0018`–`0021`)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: nothing later tasks import — this is a standalone SQL change.
  `loopkit.add_stamp(p_program uuid, p_phone text)` and
  `loopkit.redeem(p_card uuid)` keep their existing signatures and return
  type (`loopkit.cards`), so `src/app/dashboard/actions.ts`'s
  `stampAction`/`redeemAction` (which call these RPCs by name via
  `supabase.rpc("add_stamp", ...)` / `supabase.rpc("redeem", ...)`) need no
  changes.

The current live bodies (for reference — do not copy these, they are what
you are replacing):

`add_stamp` (from `supabase/migrations/0002_loopkit_stamp_cap.sql`) caps at
`stamps_required`:

```sql
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card     loopkit.cards;
  v_required int;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select stamps_required into v_required
    from loopkit.programs
    where id = p_program;

  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, 1)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  update loopkit.cards
    set stamp_count = stamp_count + 1, updated_at = now()
    where program_id = p_program and phone = p_phone
      and stamp_count < v_required
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  select * into v_card
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_card;
end;
$$;
```

`redeem` (from `supabase/migrations/0001_loopkit_core.sql`, never modified
since) hard-resets to zero:

```sql
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare v_card loopkit.cards;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  update loopkit.cards
    set stamp_count = 0, reward_count = reward_count + 1, updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;
```

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0022_loopkit_stamp_carryover.sql` with exactly
this content:

```sql
-- 0022 — remove the stamp ceiling and carry over excess stamps on redeem.
-- Idempotent: create-or-replace restates both function bodies in full;
-- no schema/column changes, no grants to restate (signatures unchanged).

-- add_stamp: stamp_count now increments unconditionally — a full card keeps
-- earning past stamps_required instead of silently no-op'ing. Every stamp
-- (including ones past the requirement) still logs a stamp_events row, since
-- there is no longer a "ceiling, no-op" branch to distinguish from a real
-- stamp.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  -- First stamp for this phone: create the card and log it.
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, 1)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    return v_card;
  end if;

  -- Existing card: always increment, no ceiling.
  update loopkit.cards
    set stamp_count = stamp_count + 1, updated_at = now()
    where program_id = p_program and phone = p_phone
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  return v_card;
end;
$$;

-- redeem: consume exactly one card's worth of stamps and carry the rest
-- forward, instead of resetting to zero. reward_count still increments by
-- exactly one per call — a card with 2x+ the requirement in stamp_count
-- does not grant multiple rewards from a single redeem call (the vendor can
-- simply redeem again immediately if the leftover still qualifies).
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card     loopkit.cards;
  v_required int;
begin
  select c.*, p.stamps_required into v_card, v_required
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    where c.id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  update loopkit.cards
    set stamp_count = greatest(stamp_count - v_required, 0),
        reward_count = reward_count + 1,
        updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;
```

Note on the `select ... into v_card, v_required` line: `v_card` is declared
`loopkit.cards`, and the query selects `c.*` (all of `loopkit.cards`'
columns) plus `p.stamps_required` as a second target — Postgres allows a
`select ... into` with multiple target variables where the first absorbs
the row-typed columns and the second absorbs the trailing scalar column, in
that positional order. This is the same "row plus one extra column" pattern
already used by `add_stamp` above it (`select stamps_required into
v_required`) and by `card_status`/`card_view` elsewhere in this schema —
consistent with existing style, not a new pattern.

- [ ] **Step 2: Update `docs/DEPLOY.md`**

Find the numbered list entry for `0021_loopkit_customers.sql` (around line 131) and add a new entry immediately after it, matching the existing style
exactly:

```markdown
- apply `0022_loopkit_stamp_carryover.sql` — removes the stamp ceiling
  (`add_stamp` now increments unconditionally) and changes `redeem` to
  carry over any stamps beyond `stamps_required` instead of resetting to
  zero (`reward_count` still increments by exactly one per call, no
  reward-stacking). No schema change. Safe to re-run.
```

- [ ] **Step 3: Verify the migration file is syntactically self-contained**

Run: `pnpm check`

Expected: PASS (this step only touches a `.sql` file and a `.md` file — no
TypeScript is affected, so this just confirms nothing else broke).

There is no automated way to execute this SQL in this environment (no
linked Supabase CLI). Read the file back once after writing it and confirm:
both `create or replace function` statements end with `$$;`, the `redeem`
function's `select ... into v_card, v_required` line lists `v_card` before
`v_required` (matching declaration order), and no `grant execute` lines
were added or removed (none are needed — both functions keep their exact
prior signatures, so their existing grants from `0001_loopkit_core.sql`
still apply).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0022_loopkit_stamp_carryover.sql docs/DEPLOY.md
git commit -m "feat(db): remove stamp ceiling, carry over excess on redeem

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Plant engine — remove growth cap, carry over excess on redeem

**Files:**

- Modify: `src/lib/engine/plant.ts`
- Test: `test/lib/engine/plant.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `plantStrategy.apply(event, state, config, now)` and
  `plantStrategy.redeem(state, config)` keep their existing signatures
  (`redeem` already declares `config` as its second parameter per the
  `Strategy<C, S>` interface in `src/lib/engine/types.ts` — it was simply
  unused inside the function body before this task). No caller
  (`src/app/dashboard/actions.ts`'s `redeemPlantAction`, which calls
  `plantStrategy.redeem(state, config)` with both arguments already) needs
  any change.

Current `src/lib/engine/plant.ts` in full (for reference — you are editing
this file, not replacing it wholesale):

```ts
import type { Strategy } from "@/lib/engine/types";

export type PlantStage = { name: string; threshold: number };
export type PlantConfig = {
  stages: PlantStage[];
  growth_per_visit: number;
  grace_days: number;
  decay_rate: number;
  floor_growth: number;
  reward_text: string;
};
export type PlantState = {
  growth: number;
  last_visit_at: string | null;
  blooms: number;
  bloomed?: boolean;
};

const MS_PER_DAY = 86_400_000;

function decayedGrowth(
  state: PlantState,
  config: PlantConfig,
  now: Date,
): number {
  if (state.last_visit_at === null) return state.growth;
  const idleDays = Math.max(
    0,
    (now.getTime() - new Date(state.last_visit_at).getTime()) / MS_PER_DAY,
  );
  const decayDays = Math.max(0, idleDays - config.grace_days);
  const floor = Math.min(state.growth, config.floor_growth);
  return Math.max(floor, state.growth - config.decay_rate * decayDays);
}

function stageIndexFor(growth: number, stages: PlantStage[]): number {
  let idx = 0;
  for (let i = 0; i < stages.length; i++) {
    if (growth >= stages[i].threshold) idx = i;
  }
  return idx;
}

function bloomThreshold(config: PlantConfig): number {
  return config.stages[config.stages.length - 1].threshold;
}

export const plantStrategy: Strategy<PlantConfig, PlantState> = {
  defaults() {
    return { growth: 0, last_visit_at: null, blooms: 0, bloomed: false };
  },
  progress(state, config, now) {
    const g = decayedGrowth(state, config, now);
    const idx = stageIndexFor(g, config.stages);
    const wilting = g < state.growth;
    return {
      stage: config.stages[idx].name,
      label: wilting ? "Wilting — visit to revive it" : config.stages[idx].name,
      view: {
        kind: "plant",
        stage: idx,
        stageName: config.stages[idx].name,
        totalStages: config.stages.length,
        wilting,
      },
      rewardReady: state.bloomed ?? g >= bloomThreshold(config),
    };
  },
  apply(event, state, config, now) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const settled = decayedGrowth(state, config, now);
    const bloom = bloomThreshold(config);
    const growth = Math.min(settled + config.growth_per_visit, bloom);
    const bloomed = state.bloomed === true || growth >= bloom;
    return {
      state: {
        growth,
        last_visit_at: now.toISOString(),
        blooms: state.blooms,
        bloomed,
      },
      rewardUnlocked: settled < bloom && growth >= bloom,
    };
  },
  redeem(state) {
    return {
      growth: 0,
      last_visit_at: state.last_visit_at,
      blooms: state.blooms + 1,
      bloomed: false,
    };
  },
};
```

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the existing `describe("plantStrategy", ...)`
block in `test/lib/engine/plant.test.ts`, right after the existing "blooms
when a visit reaches the top threshold" test (after line 67, before "banks
the bloom so it survives idle decay"):

```ts
it("keeps growing past the bloom threshold instead of capping", () => {
  const r = plantStrategy.apply(
    { kind: "visit" },
    { growth: 8, last_visit_at: day0.toISOString(), blooms: 0, bloomed: true },
    cfg,
    day0,
  );
  expect(r.state.growth).toBe(9);
  expect(r.rewardUnlocked).toBe(false);
});
```

And replace the existing "redeem resets to a seed, counts the bloom, and
clears the bank" test (lines 92–106) with these two tests covering both the
exact-threshold and past-threshold cases:

```ts
it("redeem carries over exactly zero when growth equals the threshold", () => {
  const s = plantStrategy.redeem(
    {
      growth: 8,
      last_visit_at: day0.toISOString(),
      blooms: 1,
      bloomed: true,
    },
    cfg,
  );
  expect(s.growth).toBe(0);
  expect(s.blooms).toBe(2);
  expect(s.bloomed).toBe(false);
  expect(plantStrategy.progress(s, cfg, day0).rewardReady).toBe(false);
});
it("redeem carries over the excess when growth exceeds the threshold", () => {
  const s = plantStrategy.redeem(
    {
      growth: 11,
      last_visit_at: day0.toISOString(),
      blooms: 1,
      bloomed: true,
    },
    cfg,
  );
  expect(s.growth).toBe(3);
  expect(s.blooms).toBe(2);
  expect(s.bloomed).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/lib/engine/plant.test.ts`

Expected: the "keeps growing past the bloom threshold" test fails with
`expected 8 to be 9` (still capped at the bloom threshold of 8), and the
"redeem carries over the excess" test fails with `expected 0 to be 3`
(still hard-resetting to 0).

- [ ] **Step 3: Implement the minimal change**

In `src/lib/engine/plant.ts`, change the `apply` method's growth
calculation — remove the `Math.min(..., bloom)` cap:

```ts
  apply(event, state, config, now) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const settled = decayedGrowth(state, config, now);
    const bloom = bloomThreshold(config);
    const growth = settled + config.growth_per_visit;
    const bloomed = state.bloomed === true || growth >= bloom;
    return {
      state: {
        growth,
        last_visit_at: now.toISOString(),
        blooms: state.blooms,
        bloomed,
      },
      rewardUnlocked: settled < bloom && growth >= bloom,
    };
  },
```

And change `redeem` to accept `config` and carry over the excess:

```ts
  redeem(state, config) {
    return {
      growth: Math.max(0, state.growth - bloomThreshold(config)),
      last_visit_at: state.last_visit_at,
      blooms: state.blooms + 1,
      bloomed: false,
    };
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/lib/engine/plant.test.ts`

Expected: PASS, all tests in the file green (the pre-existing "blooms when
a visit reaches the top threshold" and "banks the bloom so it survives idle
decay" tests still pass unchanged — neither asserts a capped growth value,
only `rewardUnlocked`/`rewardReady`/`bloomed`, none of which this change
affects at the exact-threshold boundary).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS. `pnpm check` confirms `redeem(state, config)`'s new
parameter doesn't break any caller — `redeemPlantAction` in
`src/app/dashboard/actions.ts` already calls `plantStrategy.redeem(state,
config)` with both arguments, so this is purely additive at the type level.

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/plant.ts test/lib/engine/plant.test.ts
git commit -m "feat(engine): remove plant growth cap, carry over excess on redeem

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Redeem confirmation copy (Stamp + Plant)

**Files:**

- Modify: `src/app/dashboard/redeem-button.tsx`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Create: `src/app/dashboard/redeem-button.dom.test.tsx`
- Modify: `test/app/serve-customer.test.tsx`

**Interfaces:**

- Consumes: nothing from Tasks 1 or 2 (this task only changes UI copy and
  component props — the underlying redeem behavior is already correct
  after Tasks 1 and 2 ship).
- Produces: `RedeemButton` gains a required `stampsRequired: number` prop.
  Its one caller, `src/app/dashboard/serve-customer.tsx`, already has
  `stampsRequired` in scope as its own prop (see the `ServeCustomer`
  function signature) — no new data plumbing needed, just pass it through.

Current `src/app/dashboard/redeem-button.tsx` in full:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { redeemAction } from "@/app/dashboard/actions";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** Redeem control with an AlertDialog confirm — resetting a card is destructive. */
export function RedeemButton({
  card,
  onRedeemed,
}: {
  card: StampCard;
  onRedeemed: (card: StampCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { pending, run } = useAsyncAction();

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("card_id", card.id);
      const result = await redeemAction(fd);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reward redeemed for ${card.phone}.`);
      onRedeemed(result.card);
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl">
          Redeem
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Redeem reward?</AlertDialogTitle>
          <AlertDialogDescription>
            Redeem reward for {card.phone}? This resets their card.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
          >
            {pending ? "Redeeming…" : "Redeem"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 1: Write the failing test for `RedeemButton`**

Create `src/app/dashboard/redeem-button.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { redeemMock } = vi.hoisted(() => ({ redeemMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({ redeemAction: redeemMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { RedeemButton } from "@/app/dashboard/redeem-button";

describe("RedeemButton", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the exact stamp count consumed and carryover wording in the confirm dialog", async () => {
    const user = userEvent.setup();
    render(
      <RedeemButton
        card={{ id: "card-1", phone: "+6591234567", stamp_count: 11 }}
        stampsRequired={8}
        onRedeemed={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(
      screen.getByText(
        "Redeem reward for +6591234567? Uses 8 stamps — any extra carries over to their next card.",
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/redeem-button.dom.test.tsx`

Expected: FAIL — either a TypeScript error (`stampsRequired` does not exist
on the props type) or, if that's not caught by the test runner, a text
match failure against the current "This resets their card." copy.

- [ ] **Step 3: Implement the copy change**

In `src/app/dashboard/redeem-button.tsx`, add the `stampsRequired` prop and
update the description text:

```tsx
export function RedeemButton({
  card,
  stampsRequired,
  onRedeemed,
}: {
  card: StampCard;
  stampsRequired: number;
  onRedeemed: (card: StampCard) => void;
}) {
```

```tsx
<AlertDialogDescription>
  Redeem reward for {card.phone}? Uses {stampsRequired} stamps — any extra
  carries over to their next card.
</AlertDialogDescription>
```

- [ ] **Step 4: Update `RedeemButton`'s call site**

In `src/app/dashboard/serve-customer.tsx`, find the `<RedeemButton>`
element (inside the `result?.mode === "stamp"` block) and add the
`stampsRequired` prop:

```tsx
<RedeemButton
  card={result.card}
  stampsRequired={stampsRequired}
  onRedeemed={(next) =>
    setResult({
      mode: "stamp",
      phone: next.phone,
      card: next,
      rewardReady: false,
    })
  }
/>
```

- [ ] **Step 5: Run the `RedeemButton` test to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/redeem-button.dom.test.tsx`

Expected: PASS.

- [ ] **Step 6: Write the failing test for Plant's redeem dialog copy**

Add this test to `test/app/serve-customer.test.tsx`, inside the existing
`describe("ServeCustomer", ...)` block (the file already mocks
`redeemPlantAction` as `redeemPlantMock` and `lookupAction` as `lookupMock`
— reuse those, do not add new mocks):

```ts
  it("shows carryover wording in the plant redeem confirm dialog", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 0 },
      progress: {
        view: {
          kind: "plant",
          stage: 4,
          stageName: "Bloom",
          totalStages: 5,
          wilting: false,
        },
        label: "Bloom",
        rewardReady: true,
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="A bloom"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(lookupMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(
      screen.getByText(
        "Redeem A bloom for +6591234567? Any extra growth carries over to their next plant.",
      ),
    ).toBeInTheDocument();
  });
```

Add `waitFor` to this file's existing `import { render, screen, waitFor }
from "@testing-library/react";` if it is not already imported — it already
is (used by the existing stamp tests), so no import change is needed.

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm exec vitest run test/app/serve-customer.test.tsx -t "carryover wording in the plant"`

Expected: FAIL — the current text is "Redeem A bloom for +6591234567? This
resets their plant to a seed."

- [ ] **Step 8: Implement the copy change**

In `src/app/dashboard/serve-customer.tsx`, change the Plant
`AlertDialogDescription` text:

```tsx
<AlertDialogDescription>
  Redeem {rewardText} for {result.phone}? Any extra growth carries over to their
  next plant.
</AlertDialogDescription>
```

- [ ] **Step 9: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`

Expected: PASS — all tests green, including the two new ones and every
pre-existing test in `test/app/serve-customer.test.tsx` and
`src/app/dashboard/redeem-button.dom.test.tsx`.

- [ ] **Step 10: Commit**

```bash
git add src/app/dashboard/redeem-button.tsx src/app/dashboard/redeem-button.dom.test.tsx src/app/dashboard/serve-customer.tsx test/app/serve-customer.test.tsx
git commit -m "feat(dashboard): update redeem confirmations to describe carryover

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

- Section A (Stamp SQL) → Task 1. ✅
- Section B (Plant engine) → Task 2. ✅
- Section C (redeem confirmation copy, both Stamp and Plant) → Task 3. ✅
- Section D (Testing) → covered per-task: `test/lib/engine/plant.test.ts`
  extended in Task 2; new `redeem-button.dom.test.tsx` and an extension to
  `test/app/serve-customer.test.tsx` in Task 3; SQL migration explicitly
  has no automated test per the spec's own stated convention, addressed in
  Task 1's Step 3 as a manual read-back check instead. ✅
- Out of scope items (Streak, Wheel/Scratch, the reward-ledger initiative,
  `0018`'s program-replacement carryover) — no task touches any of these
  files. ✅
- Cleanup section — reflected in every task's Global Constraints
  inheritance (`create or replace`, in-place edits, replaced not duplicated
  copy). ✅

**2. Placeholder scan:** No TBD/TODO/"add appropriate" phrasing found. Every
step has exact code, exact file paths, exact commands with expected
output.

**3. Type consistency:** `plantStrategy.redeem(state, config)` — Task 2
introduces the `config` parameter; Task 3's `RedeemButton` test and
`ServeCustomer` call site both use `stampsRequired: number`, matching the
prop's existing type everywhere else it's already used in
`serve-customer.tsx`. `RedeemButton`'s `card: StampCard` prop and
`onRedeemed: (card: StampCard) => void` are unchanged from the current
file — only `stampsRequired` is additive. No naming drift between tasks.

**Build-integrity check:** Task 3's Step 3 (adding the required
`stampsRequired` prop) and Step 4 (updating the one call site) are both
inside the same task/commit — `pnpm check` never goes red between them,
consistent with this session's standing constraint that a signature change
and its one consumer update must never be split across separate commits.
Task 1 and Task 2 are fully independent of each other and of Task 3 (no
shared files, no signature dependencies), so they can be implemented in any
order without breaking the build — sequencing them 1 → 2 → 3 here only
because Task 1 (SQL, highest-risk, hand-applied) is the natural first
deliverable to get in front of the user for manual application.
