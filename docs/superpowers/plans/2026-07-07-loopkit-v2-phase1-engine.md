# loopkit v2 Phase 1 — Program Engine + Stamp Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce an event-sourced, strategy-per-type program engine and migrate the existing stamp card onto it — with zero user-visible change — to de-risk the abstraction against a known-good type before new templates land.

**Architecture:** Strategies live in TypeScript (`src/lib/engine/`), pure and unit-tested; the DB gains generic `type`/`config`/`state` columns (additive migration + backfill) but write RPCs (`add_stamp`/`redeem`) stay unchanged this phase — only the **read/progress computation** routes through the engine. The stamp strategy reads its config from the new `config` JSON *or* falls back to the legacy `stamps_required`/`reward_text` columns, so the code deploy does not depend on the migration being applied first.

**Tech Stack:** Next 16, TypeScript strict, Supabase `@supabase/ssr` (schema `loopkit`), Vitest, pnpm 11.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Schema changes = a new numbered migration in `supabase/migrations/`; update `src/lib/types.ts` to match.
- loopkit CI has no live DB — migrations are guarded by **text-based drift tests** (see existing `test/db/*.test.ts` convention), not applied in tests.
- Stamp semantics are fixed and must not change: stamp_count caps at `stamps_required`; `rewardReady = stamp_count >= stamps_required`; redeem resets stamp_count to 0 and increments reward_count.
- No inline comments (eslint `no-inline-comments: warn`); comments explain WHY. Match existing style.
- Every task ends green: `pnpm check`, `pnpm test`, `pnpm build`.
- Spec of record: `docs/superpowers/specs/2026-07-07-loopkit-v2-core-design.md` (§1 engine, §3.1 stamp, §8 Phase 1).

---

## File Structure

- `supabase/migrations/0004_loopkit_engine.sql` (new) — additive columns + backfill.
- `src/lib/types.ts` (modify) — new columns on `programs`/`cards`/`stamp_events`.
- `src/lib/engine/types.ts` (new) — `Strategy` interface, `EngineEvent`, `Progress`, per-type config/state types.
- `src/lib/engine/stamp.ts` (new) — the stamp `Strategy` (pure).
- `src/lib/engine/index.ts` (new) — `STRATEGIES` registry + `getProgress()` helper.
- `test/db/engine-schema.test.ts` (new) — 0004 drift guard.
- `test/lib/engine/stamp.test.ts` (new) — stamp strategy unit tests.
- `test/lib/engine/index.test.ts` (new) — registry + getProgress tests.

---

### Task 1: Migration 0004 — generalize schema + backfill

**Files:**
- Create: `supabase/migrations/0004_loopkit_engine.sql`
- Modify: `src/lib/types.ts`, `docs/DEPLOY.md`
- Test: `test/db/engine-schema.test.ts`

**Interfaces:**
- Produces: `programs.type` (`'stamp'|'lucky'|'plant'`, default `'stamp'`), `programs.config jsonb`, `cards.state jsonb`, `cards.last_event_at timestamptz`, `stamp_events.payload jsonb`, generalized `stamp_events.kind` check (`'stamp'|'redeem'|'visit'|'win'`).

- [ ] **Step 1: Write the failing drift test**

```ts
// test/db/engine-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0004_loopkit_engine.sql",
  "utf8",
);

describe("0004 engine migration", () => {
  it("adds type + config to programs", () => {
    expect(sql).toMatch(/alter table loopkit\.programs/i);
    expect(sql).toMatch(/add column type text not null default 'stamp'/i);
    expect(sql).toMatch(/check \(type in \('stamp','lucky','plant'\)\)/i);
    expect(sql).toMatch(/add column config jsonb not null default '\{\}'/i);
  });
  it("adds state + last_event_at to cards", () => {
    expect(sql).toMatch(/add column state jsonb not null default '\{\}'/i);
    expect(sql).toMatch(/add column last_event_at timestamptz/i);
  });
  it("generalizes stamp_events kind + adds payload", () => {
    expect(sql).toMatch(/kind in \('stamp','redeem','visit','win'\)/i);
    expect(sql).toMatch(/add column (if not exists )?payload jsonb/i);
  });
  it("backfills existing stamp rows", () => {
    expect(sql).toMatch(/jsonb_build_object\('stamps_required'/i);
    expect(sql).toMatch(/jsonb_build_object\('stamp_count'/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/db/engine-schema.test.ts`
Expected: FAIL — cannot read `0004_loopkit_engine.sql` (file not found).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0004_loopkit_engine.sql
-- v2 engine, phase 1: generalize the schema so a program has a type + a config
-- blob, a card carries a per-type state blob, and events carry a payload. Purely
-- additive + a backfill; existing stamp programs keep working unchanged. Strategy
-- logic lives in TypeScript (src/lib/engine), so no function changes here.

alter table loopkit.programs
  add column type text not null default 'stamp'
    check (type in ('stamp','lucky','plant')),
  add column config jsonb not null default '{}'::jsonb;

alter table loopkit.cards
  add column state jsonb not null default '{}'::jsonb,
  add column last_event_at timestamptz;

alter table loopkit.stamp_events
  drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
    check (kind in ('stamp','redeem','visit','win'));
alter table loopkit.stamp_events
  add column if not exists payload jsonb;

-- Backfill existing rows so reads through the engine work immediately. Idempotent:
-- only touches rows still at the default empty blob.
update loopkit.programs
  set config = jsonb_build_object(
    'stamps_required', stamps_required,
    'reward_text', reward_text
  )
  where config = '{}'::jsonb;

update loopkit.cards
  set state = jsonb_build_object('stamp_count', stamp_count),
      last_event_at = coalesce(updated_at, created_at)
  where state = '{}'::jsonb;
```

- [ ] **Step 4: Update `src/lib/types.ts`**

Add to the `programs` Row/Insert/Update: `type: string` and `config: Json`. Add to `cards` Row: `state: Json` and `last_event_at: string | null`. Add to `stamp_events` Row: `payload: Json | null` and widen `kind` to `string`. Match the existing hand-written `Database` shape and `Json` type already exported there.

- [ ] **Step 5: Update `docs/DEPLOY.md`**

Add to the migration step: "apply `0004_loopkit_engine.sql` (additive columns + backfill; safe, idempotent)."

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm vitest run test/db/engine-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Full verify + commit**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all green.

```bash
git add supabase/migrations/0004_loopkit_engine.sql src/lib/types.ts docs/DEPLOY.md test/db/engine-schema.test.ts
git commit -m "feat: 0004 engine schema — type/config/state columns + backfill"
```

---

### Task 2: Engine types + stamp strategy

**Files:**
- Create: `src/lib/engine/types.ts`, `src/lib/engine/stamp.ts`
- Test: `test/lib/engine/stamp.test.ts`

**Interfaces:**
- Produces:
  - `type EngineEvent = { kind: "visit" | "redeem"; payload?: Record<string, unknown> }`
  - `type ProgressView = { kind: "dots"; filled: number; total: number }`
  - `type Progress = { stage: string; label: string; view: ProgressView; rewardReady: boolean }`
  - `interface Strategy<C, S> { defaults(config: C): S; progress(state: S, config: C, now: Date): Progress; apply(event: EngineEvent, state: S, config: C, now: Date): { state: S; rewardUnlocked: boolean }; redeem(state: S, config: C): S }`
  - `type StampConfig = { stamps_required: number; reward_text: string }`
  - `type StampState = { stamp_count: number; reward_count: number }`
  - `const stampStrategy: Strategy<StampConfig, StampState>`
- Consumes: nothing (leaf module).

- [ ] **Step 1: Write the failing tests**

```ts
// test/lib/engine/stamp.test.ts
import { describe, it, expect } from "vitest";
import { stampStrategy } from "@/lib/engine/stamp";

const cfg = { stamps_required: 5, reward_text: "free kopi" };
const now = new Date("2026-07-07T00:00:00Z");

describe("stampStrategy", () => {
  it("defaults to an empty card", () => {
    expect(stampStrategy.defaults(cfg)).toEqual({
      stamp_count: 0,
      reward_count: 0,
    });
  });
  it("adds a stamp and caps at the requirement", () => {
    let s = { stamp_count: 4, reward_count: 0 };
    s = stampStrategy.apply({ kind: "visit" }, s, cfg, now).state;
    expect(s.stamp_count).toBe(5);
    const capped = stampStrategy.apply({ kind: "visit" }, s, cfg, now);
    expect(capped.state.stamp_count).toBe(5);
  });
  it("reports rewardReady only at the requirement", () => {
    expect(
      stampStrategy.progress({ stamp_count: 4, reward_count: 0 }, cfg, now)
        .rewardReady,
    ).toBe(false);
    expect(
      stampStrategy.progress({ stamp_count: 5, reward_count: 0 }, cfg, now)
        .rewardReady,
    ).toBe(true);
  });
  it("unlocks the reward on the stamp that reaches the requirement", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 4, reward_count: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
  });
  it("redeem resets stamps and increments reward_count", () => {
    expect(
      stampStrategy.redeem({ stamp_count: 5, reward_count: 1 }, cfg),
    ).toEqual({ stamp_count: 0, reward_count: 2 });
  });
  it("progress renders a dot view", () => {
    expect(
      stampStrategy.progress({ stamp_count: 3, reward_count: 0 }, cfg, now).view,
    ).toEqual({ kind: "dots", filled: 3, total: 5 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/lib/engine/stamp.test.ts`
Expected: FAIL — module `@/lib/engine/stamp` not found.

- [ ] **Step 3: Write `src/lib/engine/types.ts`**

```ts
export type EngineEvent = {
  kind: "visit" | "redeem";
  payload?: Record<string, unknown>;
};

export type ProgressView = { kind: "dots"; filled: number; total: number };

export type Progress = {
  stage: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
};

export interface Strategy<C, S> {
  defaults(config: C): S;
  progress(state: S, config: C, now: Date): Progress;
  apply(
    event: EngineEvent,
    state: S,
    config: C,
    now: Date,
  ): { state: S; rewardUnlocked: boolean };
  redeem(state: S, config: C): S;
}
```

- [ ] **Step 4: Write `src/lib/engine/stamp.ts`**

```ts
import type { Strategy } from "@/lib/engine/types";

export type StampConfig = { stamps_required: number; reward_text: string };
export type StampState = { stamp_count: number; reward_count: number };

export const stampStrategy: Strategy<StampConfig, StampState> = {
  defaults() {
    return { stamp_count: 0, reward_count: 0 };
  },
  progress(state, config) {
    const filled = Math.min(state.stamp_count, config.stamps_required);
    return {
      stage: filled >= config.stamps_required ? "ready" : "collecting",
      label: `${filled}/${config.stamps_required} stamps`,
      view: { kind: "dots", filled, total: config.stamps_required },
      rewardReady: state.stamp_count >= config.stamps_required,
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run test/lib/engine/stamp.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Full verify + commit**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all green.

```bash
git add src/lib/engine/types.ts src/lib/engine/stamp.ts test/lib/engine/stamp.test.ts
git commit -m "feat: engine strategy interface + stamp strategy"
```

---

### Task 3: Engine registry + route the read path through it

**Files:**
- Create: `src/lib/engine/index.ts`
- Modify: `src/lib/program.ts` (select `type,config`), the dashboard/customer read that computes reward-ready to call `getProgress` instead of the inline `rewardReady`
- Test: `test/lib/engine/index.test.ts`

**Interfaces:**
- Consumes: `stampStrategy`, `Strategy`, `Progress` from Task 2; `Program` from `src/lib/program.ts`.
- Produces:
  - `type ProgramLike = { type: string; config: unknown; stamps_required: number; reward_text: string }`
  - `type CardLike = { state: unknown; stamp_count: number; reward_count: number }`
  - `getProgress(program: ProgramLike, card: CardLike, now: Date): Progress`
  - `resolveStampConfig(program: ProgramLike): StampConfig` (reads `config` JSON, falls back to legacy columns)

- [ ] **Step 1: Write the failing tests**

```ts
// test/lib/engine/index.test.ts
import { describe, it, expect } from "vitest";
import { getProgress } from "@/lib/engine";

const now = new Date("2026-07-07T00:00:00Z");

describe("getProgress", () => {
  it("computes stamp progress from the config blob", () => {
    const program = {
      type: "stamp",
      config: { stamps_required: 8, reward_text: "free kopi" },
      stamps_required: 8,
      reward_text: "free kopi",
    };
    const card = { state: { stamp_count: 3 }, stamp_count: 3, reward_count: 0 };
    const p = getProgress(program, card, now);
    expect(p.view).toEqual({ kind: "dots", filled: 3, total: 8 });
    expect(p.rewardReady).toBe(false);
  });
  it("falls back to legacy columns when config is empty", () => {
    const program = {
      type: "stamp",
      config: {},
      stamps_required: 5,
      reward_text: "free tea",
    };
    const card = { state: {}, stamp_count: 5, reward_count: 0 };
    const p = getProgress(program, card, now);
    expect(p.view.total).toBe(5);
    expect(p.rewardReady).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/lib/engine/index.test.ts`
Expected: FAIL — module `@/lib/engine` not found.

- [ ] **Step 3: Write `src/lib/engine/index.ts`**

```ts
import type { Progress } from "@/lib/engine/types";
import {
  stampStrategy,
  type StampConfig,
  type StampState,
} from "@/lib/engine/stamp";

export type ProgramLike = {
  type: string;
  config: unknown;
  stamps_required: number;
  reward_text: string;
};
export type CardLike = {
  state: unknown;
  stamp_count: number;
  reward_count: number;
};

function hasKeys(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" && o !== null && Object.keys(o).length > 0;
}

export function resolveStampConfig(program: ProgramLike): StampConfig {
  if (hasKeys(program.config)) return program.config as StampConfig;
  return {
    stamps_required: program.stamps_required,
    reward_text: program.reward_text,
  };
}

function resolveStampState(card: CardLike): StampState {
  if (hasKeys(card.state)) {
    const s = card.state as Partial<StampState>;
    return {
      stamp_count: s.stamp_count ?? card.stamp_count,
      reward_count: s.reward_count ?? card.reward_count,
    };
  }
  return { stamp_count: card.stamp_count, reward_count: card.reward_count };
}

export function getProgress(
  program: ProgramLike,
  card: CardLike,
  now: Date,
): Progress {
  switch (program.type) {
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/lib/engine/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Route the read path through the engine (behavior-preserving)**

In `src/lib/program.ts`, extend the `getProgram` select to include `type,config` and add them to the `Program` type (`type: string`, `config: unknown`). Where the dashboard / customer view currently derives reward-ready from `rewardReady(stamp_count, stamps_required)` (see `src/lib/loyalty.ts` usage), leave `rewardReady` in place for now but ALSO expose `getProgress` for the progress label/dots. Do not change any write path or RPC. The goal is that the read computation has an engine-backed path; the visible output must be identical (same dots, same reward-ready). Confirm by running the existing dashboard/customer tests — they must still pass unchanged.

- [ ] **Step 6: Full verify + commit**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all green; existing stamp behavior unchanged.

```bash
git add src/lib/engine/index.ts src/lib/program.ts test/lib/engine/index.test.ts
git commit -m "feat: engine registry + engine-backed read path for stamp"
```

---

## Self-Review

**Spec coverage (§1, §3.1, §8 Phase 1):** engine schema (Task 1) ✓; strategy interface + stamp strategy pure & tested (Task 2) ✓; registry + derived progress on read, config-or-legacy fallback so deploy ≠ migration-timing (Task 3) ✓. Write RPCs intentionally unchanged this phase (spec §1.1 "keep add_stamp/redeem working"; §9 open question — convergence deferred to Phase 2). Backfill idempotent ✓. No behavior change ✓.

**Placeholder scan:** none — all steps carry real SQL/TS/tests. Step 5 of Task 3 is prose (a behavior-preserving wiring) but names the exact files and the invariant (identical output); acceptable as it must not alter output.

**Type consistency:** `Strategy`, `EngineEvent`, `Progress`, `ProgressView`, `StampConfig`, `StampState`, `getProgress`, `resolveStampConfig`, `ProgramLike`, `CardLike` are used consistently across Tasks 2–3. `stamp_count` cap + `rewardReady = >=` matches the Global Constraints and 0001/0002 semantics.
