# Vendor-configurable head-start percentage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let vendors configure how much of a head start (5–50%, default 20%) a new stamp/plant customer gets, replacing today's fixed ~20% formula, while leaving streak's behavior completely unchanged.

**Architecture:** One additive migration (new column + recreated `create_program`/`enroll_card`), then the server-side field flow (`saveProgramSchema` → `buildProgramFields` → `actions.ts`'s 3 action functions), then the client-side UI + preview formula.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (SECURITY DEFINER functions), Zod, TypeScript strict, React, Vitest.

## Global Constraints

- Every task's commit must leave `pnpm check` clean, the full `pnpm test` suite passing, and `pnpm build` clean.
- The plant Sprout-stage floor (25% of `stamps_required`/`visits_to_bloom`) stays a fixed literal in both the SQL and the TypeScript port — never becomes vendor-configurable, regardless of the new percentage.
- Streak's head-start behavior is completely unchanged — still a literal one-full-period seed, never reads `head_start_percent` at all.
- `programs.head_start_percent` is `integer not null default 20 check (head_start_percent between 5 and 50)` — existing `head_start=true` programs reproduce today's exact behavior with zero retroactive change.
- `head_start_percent` is optional in `saveProgramSchema` (defaults to 20 when absent from `FormData`, which happens whenever the UI doesn't render the input — streak/lucky/wheel/scratch, or stamp/plant with the head-start toggle off).

---

### Task 1: Migration 0024 + hand-written types.ts sync

**Files:**

- Create: `supabase/migrations/0024_loopkit_head_start_percent.sql`
- Create: `test/db/head-start-percent-schema.test.ts`
- Modify: `src/lib/types.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks (first task).
- Produces: `loopkit.programs.head_start_percent` column; `create_program`'s additive 10th param `p_head_start_percent int default 20`; `Database["loopkit"]["Tables"]["programs"]["Row"|"Insert"|"Update"]` gaining `head_start_percent`; `Database["loopkit"]["Functions"]["create_program"]["Args"]` gaining `p_head_start_percent?: number`. Task 2 depends on these TypeScript types existing to compile its Supabase queries.

- [ ] **Step 1: Write the failing schema test**

Create `test/db/head-start-percent-schema.test.ts`:

```ts
// test/db/head-start-percent-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0024_loopkit_head_start_percent.sql",
  "utf8",
);

describe("0024 head start percent", () => {
  it("adds a not-null, default-20, range-checked head_start_percent column", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column head_start_percent integer not null default 20\s+check \(head_start_percent between 5 and 50\)/i,
    );
  });

  it("recreates create_program with an additive, defaulted p_head_start_percent", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(/p_head_start_percent\s+int default 20/i);
    expect(sql).toMatch(
      /insert into loopkit\.programs\s*\n\s*\(vendor_id, type, name, stamps_required, reward_text, config, expiry_days,\s*\n\s*head_start, carry_over_stamps, active, head_start_percent\)/i,
    );
  });

  it("recreates enroll_card scaling the stamp/plant seed by head_start_percent", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.enroll_card\(p_program uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(
      /v_seed := greatest\(1, round\(v_program\.stamps_required \* v_program\.head_start_percent \/ 100\.0\)::int\)/i,
    );
  });

  it("keeps the plant Sprout-stage floor fixed at 25%, not vendor-configurable", () => {
    expect(sql).toMatch(
      /'growth',\s*least\(\s*greatest\(v_seed, round\(v_program\.stamps_required \* 0\.25\)::int\),\s*v_program\.stamps_required - 1\s*\)/,
    );
  });

  it("keeps streak's seed fixed at one full period, never reading head_start_percent", () => {
    expect(sql).toMatch(
      /elsif v_program\.type = 'streak' then[\s\S]*?'current_streak', 1,/,
    );
    // The streak branch must not reference head_start_percent anywhere.
    const streakBranch = sql.slice(
      sql.indexOf("elsif v_program.type = 'streak' then"),
      sql.indexOf(
        "end if;",
        sql.indexOf("elsif v_program.type = 'streak' then"),
      ),
    );
    expect(streakBranch).not.toMatch(/head_start_percent/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/db/head-start-percent-schema.test.ts`
Expected: FAIL — `ENOENT: no such file or directory, open 'supabase/migrations/0024_loopkit_head_start_percent.sql'`.

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/0024_loopkit_head_start_percent.sql`:

```sql
-- supabase/migrations/0024_loopkit_head_start_percent.sql
-- Vendor-configurable head-start amount: head_start was previously a fixed
-- ~20% seed for stamp/plant (migration 0014). This adds a percentage knob
-- (5-50, default 20) so vendors control how much of a head start they give
-- away. Streak is untouched — there's no fractional-period representation,
-- so it keeps its fixed one-full-period seed regardless of this column.
-- Plant's Sprout-stage floor (25%) also stays a fixed literal: a seed below
-- that threshold would render as a fresh, un-seeded "Seed" card no matter
-- what percentage produced it, defeating the point of the feature.

alter table loopkit.programs
  add column head_start_percent integer not null default 20
    check (head_start_percent between 5 and 50);

-- create_program: additive trailing p_head_start_percent (defaulted to 20,
-- so existing callers keep working unchanged). Same idiom as every prior
-- extension of this function (0012/0016/0018/0023).
create or replace function loopkit.create_program(
  p_type               text,
  p_name               text,
  p_stamps_required    int,
  p_reward_text        text,
  p_config             jsonb,
  p_expiry_days        int default null,
  p_head_start         boolean default false,
  p_carry_over_stamps  boolean default false,
  p_active             boolean default true,
  p_head_start_percent int default 20
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authorized';
  end if;
  if p_active then
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
    ) then
      raise insufficient_privilege;
    end if;
  else
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and replaced_by is null) < 2
    ) then
      raise insufficient_privilege;
    end if;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps, active, head_start_percent)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active, p_head_start_percent)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int
) to authenticated;

-- enroll_card: stamp/plant's seed now scales by the program's own
-- head_start_percent instead of the old flat 20%. Plant's Sprout-stage
-- floor (25% of stamps_required) and streak's fixed one-period seed are
-- both unchanged — see the header comment above for why.
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
    elsif v_program.type = 'streak' then
      -- current_streak is always exactly 1, not v_seed-scaled: streak's head
      -- start is one full period, not a percentage-of-threshold ratio like
      -- stamp/plant (a fractional streak has no meaningful representation).
      v_seed_state := jsonb_build_object(
        'current_streak', 1,
        'window_start', now(),
        'reward_banked', false
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/db/head-start-percent-schema.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Sync the hand-written types.ts**

In `src/lib/types.ts`, add `head_start_percent: number;` to `Database.loopkit.Tables.programs.Row` (after `carry_over_stamps: boolean;`):

```ts
Row: {
  id: string;
  vendor_id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: Json;
  active: boolean;
  expiry_days: number | null;
  head_start: boolean;
  replaced_by: string | null;
  carry_over_stamps: boolean;
  head_start_percent: number;
  scheduled_deactivate_at: string | null;
  created_at: string;
}
```

Add `head_start_percent?: number;` to `Insert` and `Update` (same position, optional since the column has a default):

```ts
        Insert: {
          id?: string;
          vendor_id: string;
          name: string;
          stamps_required: number;
          reward_text: string;
          type?: string;
          config?: Json;
          active?: boolean;
          expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          carry_over_stamps?: boolean;
          head_start_percent?: number;
          scheduled_deactivate_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_id?: string;
          name?: string;
          stamps_required?: number;
          reward_text?: string;
          type?: string;
          config?: Json;
          active?: boolean;
          expiry_days?: number | null;
          head_start?: boolean;
          replaced_by?: string | null;
          carry_over_stamps?: boolean;
          head_start_percent?: number;
          scheduled_deactivate_at?: string | null;
          created_at?: string;
        };
```

Add `p_head_start_percent?: number;` to `Database.loopkit.Functions.create_program.Args` (after `p_active?: boolean;`):

```ts
      create_program: {
        Args: {
          p_type: string;
          p_name: string;
          p_stamps_required: number;
          p_reward_text: string;
          p_config: Json;
          p_expiry_days?: number | null;
          p_head_start?: boolean;
          p_carry_over_stamps?: boolean;
          p_active?: boolean;
          p_head_start_percent?: number;
        };
        Returns: string;
      };
```

- [ ] **Step 6: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0024_loopkit_head_start_percent.sql test/db/head-start-percent-schema.test.ts src/lib/types.ts
git commit -m "feat: add vendor-configurable head_start_percent column + create_program/enroll_card update"
```

**Note for the human operator**: this migration must be applied to the actual Supabase project (`pnpm dlx supabase db push` or the SQL Editor) before Task 2/3's code changes take effect end-to-end against real data — nothing in this task blocks writing/testing the TypeScript changes without a live database, since the schema tests are pure text-pattern checks against the migration file, not integration tests.

---

### Task 2: saveProgramSchema, buildProgramFields, actions.ts wiring

**Files:**

- Modify: `src/lib/program.ts`
- Modify: `src/app/setup/actions.ts`
- Modify: `test/lib/save-program-schema.test.ts`
- Modify: `test/lib/build-program-fields.test.ts`

**Interfaces:**

- Consumes: `Database["loopkit"]["Tables"]["programs"]["Row"|"Update"]` gaining `head_start_percent` (Task 1).
- Produces: `buildProgramFields`'s return type gains `headStartPercent: number` — Task 3's `setup-form.tsx` doesn't consume this directly (it submits the raw field via `FormData`), but `actions.ts` (this task) does.

- [ ] **Step 1: Write the failing tests**

Append to `test/lib/save-program-schema.test.ts` (inside the existing `describe("saveProgramSchema", ...)` block, after the "accepts a valid stamp program" test):

```ts
it("accepts a stamp program with a custom head_start_percent", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee card",
    stamps_required: "10",
    reward_text: "Free kopi",
    head_start: "true",
    head_start_percent: "30",
  });
  expect(result.success).toBe(true);
});

it("accepts a stamp program with head_start_percent absent (toggle off)", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee card",
    stamps_required: "10",
    reward_text: "Free kopi",
    head_start: "false",
  });
  expect(result.success).toBe(true);
});

it("rejects a stamp program with head_start_percent below the 5% minimum", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee card",
    stamps_required: "10",
    reward_text: "Free kopi",
    head_start: "true",
    head_start_percent: "4",
  });
  expect(result.success).toBe(false);
});

it("rejects a stamp program with head_start_percent above the 50% maximum", () => {
  const result = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee card",
    stamps_required: "10",
    reward_text: "Free kopi",
    head_start: "true",
    head_start_percent: "51",
  });
  expect(result.success).toBe(false);
});
```

Add one more test inside the existing "accepts a valid plant program" area (after it):

```ts
it("accepts a plant program with a custom head_start_percent", () => {
  const result = saveProgramSchema.safeParse({
    type: "plant",
    name: "Grow-a-kopi",
    reward_text: "Free kopi",
    visits_to_bloom: "6",
    head_start: "true",
    head_start_percent: "35",
  });
  expect(result.success).toBe(true);
});
```

Append to `test/lib/build-program-fields.test.ts` (inside `describe("buildProgramFields", ...)`, after the stamp test):

```ts
it("defaults headStartPercent to 20 when absent from a stamp program", () => {
  const result = buildProgramFields({
    type: "stamp",
    name: "Coffee card",
    stamps_required: 10,
    reward_text: "Free kopi",
    head_start: false,
    head_start_percent: undefined,
    expiry_days: undefined,
  } as SaveProgramInput);

  expect(result.headStartPercent).toBe(20);
});

it("passes through a custom headStartPercent for a stamp program", () => {
  const result = buildProgramFields({
    type: "stamp",
    name: "Coffee card",
    stamps_required: 10,
    reward_text: "Free kopi",
    head_start: true,
    head_start_percent: 35,
    expiry_days: undefined,
  } as SaveProgramInput);

  expect(result.headStartPercent).toBe(35);
});

it("defaults headStartPercent to 20 for types that never use it", () => {
  const result = buildProgramFields({
    type: "lucky",
    name: "Lucky tap",
    reward_text: "Free item",
    win_percent: 20,
    pity_ceiling: 8,
    expiry_days: undefined,
  } as SaveProgramInput);

  expect(result.headStartPercent).toBe(20);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/save-program-schema.test.ts test/lib/build-program-fields.test.ts`
Expected: the `save-program-schema` tests FAIL with "Unrecognized key(s)" or pass-through-without-validation depending on Zod's default behavior for extra keys (either way, the range-rejection tests FAIL since nothing validates the field yet); the `build-program-fields` tests FAIL — `result.headStartPercent` is `undefined`, not `20`/`35`.

- [ ] **Step 3: Add head_start_percent to saveProgramSchema**

In `src/lib/program.ts`, the stamp variant of `saveProgramSchema` changes from:

```ts
  z.object({
    type: z.literal("stamp"),
    name: z.string().trim().min(1).max(60),
    stamps_required: z.coerce.number().int().min(2).max(20),
    reward_text: z.string().trim().min(1).max(80),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    expiry_days: expiryDaysSchema,
  }),
```

to:

```ts
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
    expiry_days: expiryDaysSchema,
  }),
```

The plant variant changes identically — from:

```ts
  z.object({
    type: z.literal("plant"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    visits_to_bloom: z.coerce.number().int().min(4).max(20),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    expiry_days: expiryDaysSchema,
  }),
```

to:

```ts
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
```

The streak/lucky/wheel/scratch variants are NOT changed — `head_start_percent` is never accepted for those types.

- [ ] **Step 4: Update buildProgramFields**

In `src/lib/program.ts`, `buildProgramFields`'s return type changes from:

```ts
export function buildProgramFields(data: SaveProgramInput): {
  type: string;
  stampsRequired: number;
  config: Json;
  headStart: boolean;
} {
```

to:

```ts
export function buildProgramFields(data: SaveProgramInput): {
  type: string;
  stampsRequired: number;
  config: Json;
  headStart: boolean;
  headStartPercent: number;
} {
```

The stamp branch changes from:

```ts
if (data.type === "stamp") {
  return {
    type: "stamp",
    stampsRequired: data.stamps_required,
    headStart: data.head_start,
    config: {
      stamps_required: data.stamps_required,
      reward_text: data.reward_text,
    },
  };
}
```

to:

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
    },
  };
}
```

The plant branch changes from:

```ts
if (data.type === "plant") {
  return {
    type: "plant",
    stampsRequired: data.visits_to_bloom,
    headStart: data.head_start,
    config: buildPlantConfig(data.visits_to_bloom, data.reward_text) as Json,
  };
}
```

to:

```ts
if (data.type === "plant") {
  return {
    type: "plant",
    stampsRequired: data.visits_to_bloom,
    headStart: data.head_start,
    headStartPercent: data.head_start_percent ?? 20,
    config: buildPlantConfig(data.visits_to_bloom, data.reward_text) as Json,
  };
}
```

The lucky branch changes from:

```ts
if (data.type === "lucky") {
  return {
    type: "lucky",
    stampsRequired: data.pity_ceiling,
    headStart: false,
    config: {
      win_probability: data.win_percent / 100,
      pity_ceiling: data.pity_ceiling,
      cooldown_visits: 0,
      reward_text: data.reward_text,
    },
  };
}
```

to (adding `headStartPercent: 20`):

```ts
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
```

The streak branch changes from:

```ts
if (data.type === "streak") {
  return {
    type: "streak",
    stampsRequired: data.target_streak,
    headStart: data.head_start,
    config: buildStreakConfig(
      data.period_days,
      data.target_streak,
      data.reward_text,
    ) as Json,
  };
}
```

to (adding `headStartPercent: 20` — streak's own `head_start` still works, only the percent is fixed):

```ts
if (data.type === "streak") {
  return {
    type: "streak",
    stampsRequired: data.target_streak,
    headStart: data.head_start,
    headStartPercent: 20,
    config: buildStreakConfig(
      data.period_days,
      data.target_streak,
      data.reward_text,
    ) as Json,
  };
}
```

The final wheel/scratch fallback changes from:

```ts
  return {
    type: data.type,
    stampsRequired: data.pity_ceiling ?? 10,
    headStart: false,
    config: buildChanceConfig(
      data.type,
      data.segments,
      data.pity_ceiling,
      data.reward_text,
    ) as Json,
  };
}
```

to (adding `headStartPercent: 20`):

```ts
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

Also add `head_start_percent` to `PROGRAM_COLUMNS` (so it's actually selected by `listPrograms`/`getProgramById`) and to the `Program` type — change:

```ts
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start,replaced_by,carry_over_stamps";
```

to:

```ts
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start,head_start_percent,replaced_by,carry_over_stamps";
```

and:

```ts
export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
  expiry_days?: number | null;
  head_start: boolean;
  replaced_by: string | null;
  carry_over_stamps: boolean;
};
```

to:

```ts
export type Program = {
  id: string;
  name: string;
  stamps_required: number;
  reward_text: string;
  type: string;
  config: unknown;
  active: boolean;
  expiry_days?: number | null;
  head_start: boolean;
  head_start_percent: number;
  replaced_by: string | null;
  carry_over_stamps: boolean;
};
```

- [ ] **Step 5: Wire head_start_percent through actions.ts**

In `src/app/setup/actions.ts`, all 3 `saveProgramSchema.safeParse({...})` calls
(in `saveProgramAction`, `changeTypeAction`, `prepProgramAction`) add
`head_start_percent: formData.get("head_start_percent"),` immediately after
the existing `head_start: formData.get("head_start"),` line — e.g. in
`saveProgramAction`:

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
  period_days: formData.get("period_days"),
  target_streak: formData.get("target_streak"),
  expiry_days: formData.get("expiry_days"),
  head_start: formData.get("head_start"),
  head_start_percent: formData.get("head_start_percent"),
});
```

(the same one-line addition applies identically inside `changeTypeAction`'s
and `prepProgramAction`'s own `safeParse({...})` calls).

`saveProgramAction`'s destructuring line changes from:

```ts
const { type, stampsRequired, config, headStart } = buildProgramFields(data);
```

to:

```ts
const { type, stampsRequired, config, headStart, headStartPercent } =
  buildProgramFields(data);
```

and its edit-mode `update` object changes from:

```ts
const update: ProgramUpdate = {
  type,
  name: data.name,
  stamps_required: stampsRequired,
  reward_text: data.reward_text,
  config,
  expiry_days: data.expiry_days ?? null,
  head_start: headStart,
};
```

to:

```ts
const update: ProgramUpdate = {
  type,
  name: data.name,
  stamps_required: stampsRequired,
  reward_text: data.reward_text,
  config,
  expiry_days: data.expiry_days ?? null,
  head_start: headStart,
  head_start_percent: headStartPercent,
};
```

and its `create_program` RPC call changes from:

```ts
const { data: created, error } = await supabase.rpc("create_program", {
  p_type: type,
  p_name: data.name,
  p_stamps_required: stampsRequired,
  p_reward_text: data.reward_text,
  p_config: config,
  p_expiry_days: data.expiry_days ?? null,
  p_head_start: headStart,
});
```

to:

```ts
const { data: created, error } = await supabase.rpc("create_program", {
  p_type: type,
  p_name: data.name,
  p_stamps_required: stampsRequired,
  p_reward_text: data.reward_text,
  p_config: config,
  p_expiry_days: data.expiry_days ?? null,
  p_head_start: headStart,
  p_head_start_percent: headStartPercent,
});
```

`changeTypeAction`'s destructuring line changes from:

```ts
const { type, stampsRequired, config, headStart } = buildProgramFields(
  parsed.data,
);
```

to:

```ts
const { type, stampsRequired, config, headStart, headStartPercent } =
  buildProgramFields(parsed.data);
```

and its `create_program` RPC call changes from:

```ts
const { data: created, error: createError } = await supabase.rpc(
  "create_program",
  {
    p_type: type,
    p_name: parsed.data.name,
    p_stamps_required: stampsRequired,
    p_reward_text: parsed.data.reward_text,
    p_config: config,
    p_expiry_days: parsed.data.expiry_days ?? null,
    p_head_start: headStart,
    p_carry_over_stamps: carryOverStamps,
  },
);
```

to:

```ts
const { data: created, error: createError } = await supabase.rpc(
  "create_program",
  {
    p_type: type,
    p_name: parsed.data.name,
    p_stamps_required: stampsRequired,
    p_reward_text: parsed.data.reward_text,
    p_config: config,
    p_expiry_days: parsed.data.expiry_days ?? null,
    p_head_start: headStart,
    p_carry_over_stamps: carryOverStamps,
    p_head_start_percent: headStartPercent,
  },
);
```

`prepProgramAction`'s destructuring line changes from:

```ts
const { type, stampsRequired, config, headStart } = buildProgramFields(
  parsed.data,
);
```

to:

```ts
const { type, stampsRequired, config, headStart, headStartPercent } =
  buildProgramFields(parsed.data);
```

and its `create_program` RPC call changes from:

```ts
const { data: created, error } = await supabase.rpc("create_program", {
  p_type: type,
  p_name: parsed.data.name,
  p_stamps_required: stampsRequired,
  p_reward_text: parsed.data.reward_text,
  p_config: config,
  p_expiry_days: parsed.data.expiry_days ?? null,
  p_head_start: headStart,
  p_active: false,
});
```

to:

```ts
const { data: created, error } = await supabase.rpc("create_program", {
  p_type: type,
  p_name: parsed.data.name,
  p_stamps_required: stampsRequired,
  p_reward_text: parsed.data.reward_text,
  p_config: config,
  p_expiry_days: parsed.data.expiry_days ?? null,
  p_head_start: headStart,
  p_active: false,
  p_head_start_percent: headStartPercent,
});
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/save-program-schema.test.ts test/lib/build-program-fields.test.ts`
Expected: PASS — all tests (existing + new).

- [ ] **Step 7: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/program.ts src/app/setup/actions.ts test/lib/save-program-schema.test.ts test/lib/build-program-fields.test.ts
git commit -m "feat: thread head_start_percent through saveProgramSchema, buildProgramFields, and actions.ts"
```

---

### Task 3: SetupForm UI + preview-state.ts formula update

**Files:**

- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/preview-state.ts`
- Modify: `src/app/setup/preview-animation.ts`
- Modify: `test/app/preview-state.test.ts`
- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `Program.head_start_percent` (Task 2).
- Produces: `PreviewInput` gains `headStartPercent: number`; `headStartStampSeed(stampsRequired, percent)` and `headStartPlantGrowth(visitsToBloom, percent)` take an explicit percent parameter instead of a hardcoded ratio — no other file calls these two functions directly (they're module-private to `preview-state.ts`), so this signature change has no other call sites to update.

- [ ] **Step 1: Write the failing tests**

In `test/app/preview-state.test.ts`, add `headStartPercent: 20` to the shared
`base` fixture object (so all existing tests keep passing at today's default):

```ts
const base = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8 as number | undefined,
  periodDays: 7,
  targetStreak: 4,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
  headStartPercent: 20,
};
```

Append these new tests inside the existing `describe("buildPreviewProgress", ...)` block:

```ts
it("stamp: a custom head-start percent scales the seed", () => {
  const progress = buildPreviewProgress({
    ...base,
    type: "stamp",
    headStart: true,
    headStartPercent: 30,
  });
  // round(10 * 30 / 100) = 3
  expect(progress.label).toBe("3/10 stamps");
});

it("plant: a low head-start percent still floors at the Sprout stage", () => {
  const progress = buildPreviewProgress({
    ...base,
    type: "plant",
    headStart: true,
    headStartPercent: 10,
  });
  // round(6 * 10 / 100) = 1, floored to the Sprout threshold round(6*0.25)=2
  expect(progress.view).toEqual({
    kind: "plant",
    stage: 1,
    stageName: "Sprout",
    totalStages: 5,
    wilting: false,
  });
});

it("streak: head-start amount is ignored, always one full period regardless of the percent", () => {
  const progress = buildPreviewProgress({
    ...base,
    type: "streak",
    headStart: true,
    headStartPercent: 50,
  });
  expect(progress.view).toEqual({
    kind: "streak",
    current: 1,
    target: 4,
    status: "active",
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: FAIL — TypeScript compile error (`headStartPercent` doesn't exist on `PreviewInput` yet) or, once that's stubbed, the "custom head-start percent" test fails since the formula still hardcodes 20%.

- [ ] **Step 3: Update preview-state.ts**

In `src/app/setup/preview-state.ts`, `PreviewInput` changes from:

```ts
export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  periodDays: number;
  targetStreak: number;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
};
```

to:

```ts
export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  periodDays: number;
  targetStreak: number;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
  headStartPercent: number;
};
```

`headStartStampSeed`/`headStartPlantGrowth` change from:

```ts
function headStartStampSeed(stampsRequired: number): number {
  const seed = Math.max(1, Math.round(stampsRequired * 0.2));
  return Math.min(seed, stampsRequired - 1);
}

function headStartPlantGrowth(visitsToBloom: number): number {
  const seed = Math.max(1, Math.round(visitsToBloom * 0.2));
  const floored = Math.max(seed, Math.round(visitsToBloom * 0.25));
  return Math.min(floored, visitsToBloom - 1);
}
```

to:

```ts
function headStartStampSeed(stampsRequired: number, percent: number): number {
  const seed = Math.max(1, Math.round((stampsRequired * percent) / 100));
  return Math.min(seed, stampsRequired - 1);
}

function headStartPlantGrowth(visitsToBloom: number, percent: number): number {
  const seed = Math.max(1, Math.round((visitsToBloom * percent) / 100));
  const floored = Math.max(seed, Math.round(visitsToBloom * 0.25));
  return Math.min(floored, visitsToBloom - 1);
}
```

`buildInitialCard`'s parameter type changes from:

```ts
export function buildInitialCard(
  input: Pick<
    PreviewInput,
    | "type"
    | "stampsRequired"
    | "visitsToBloom"
    | "periodDays"
    | "targetStreak"
    | "headStart"
  >,
  now: Date,
): CardLike {
```

to (adding `"headStartPercent"`):

```ts
export function buildInitialCard(
  input: Pick<
    PreviewInput,
    | "type"
    | "stampsRequired"
    | "visitsToBloom"
    | "periodDays"
    | "targetStreak"
    | "headStart"
    | "headStartPercent"
  >,
  now: Date,
): CardLike {
```

and its stamp/plant branches change from:

```ts
if (input.type === "stamp") {
  return {
    state: {},
    stamp_count: headStartStampSeed(input.stampsRequired),
    reward_count: 0,
  };
}

if (input.type === "plant") {
  return {
    state: {
      growth: headStartPlantGrowth(input.visitsToBloom),
      last_visit_at: now.toISOString(),
      blooms: 0,
      bloomed: false,
    },
    stamp_count: 0,
    reward_count: 0,
  };
}
```

to:

```ts
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
      growth: headStartPlantGrowth(input.visitsToBloom, input.headStartPercent),
      last_visit_at: now.toISOString(),
      blooms: 0,
      bloomed: false,
    },
    stamp_count: 0,
    reward_count: 0,
  };
}
```

The streak branch is unchanged (still the literal `current_streak: 1` seed, doesn't read `headStartPercent`).

- [ ] **Step 4: Correct preview-animation.ts's recipeKey (a fix to the spec's own claim)**

The design spec claimed `preview-animation.ts` needs no changes beyond
`PreviewInput` gaining the field, reasoning that "`recipeKey` already
includes every `PreviewInput` field." That's incorrect: `recipeKey` is a
manually-listed array of specific fields, not derived from `Object.keys(input)` —
adding a field to the `PreviewInput` type does NOT automatically add it to
that array. Without this fix, editing the new percent input would silently
fail to update the live preview/animation until some other field also
changed (`initialCard`'s `useMemo` wouldn't recompute).

In `src/app/setup/preview-animation.ts`, the destructuring changes from:

```ts
const {
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
} = input;
```

to:

```ts
const {
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
  headStartPercent,
} = input;
```

and `recipeKey` changes from:

```ts
const recipeKey = JSON.stringify([
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
]);
```

to:

```ts
const recipeKey = JSON.stringify([
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
  headStartPercent,
]);
```

- [ ] **Step 5: Add the percent input to SetupForm**

In `src/app/setup/setup-form.tsx`, add new controlled state immediately after
the existing `headStart` state declaration:

```tsx
const [headStart, setHeadStart] = useState(program?.head_start ?? false);
const [headStartPercent, setHeadStartPercent] = useState(
  program?.head_start_percent ?? 20,
);
```

Add `headStartPercent` to the `usePreviewAnimation` call:

```tsx
const { progress: previewProgress, celebrating } = usePreviewAnimation({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
  headStartPercent,
});
```

Add a reset to `pickType`:

```tsx
function pickType(value: ProgramType) {
  setType(value);
  setName("");
  setRewardText("");
  setStampsRequired(10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setPeriodDays(7);
  setTargetStreak(4);
  setHeadStartPercent(20);
}
```

Replace the head-start toggle block:

```tsx
{
  (type === "stamp" || type === "plant" || type === "streak") && (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
      <Switch
        id="head_start_checkbox"
        checked={headStart}
        onCheckedChange={setHeadStart}
        className="mt-0.5"
      />
      <label htmlFor="head_start_checkbox" className="text-sm">
        <span className="font-medium">Give new customers a head start</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          New signups start with a small amount of free progress toward their
          first reward — shown to measurably increase completion.
        </span>
      </label>
      <input
        type="hidden"
        name="head_start"
        value={headStart ? "true" : "false"}
      />
    </div>
  );
}
```

with:

```tsx
{
  (type === "stamp" || type === "plant" || type === "streak") && (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
      <Switch
        id="head_start_checkbox"
        checked={headStart}
        onCheckedChange={setHeadStart}
        className="mt-0.5"
      />
      <div className="flex-1 space-y-2">
        <label htmlFor="head_start_checkbox" className="text-sm">
          <span className="font-medium">Give new customers a head start</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            New signups start with a small amount of free progress toward their
            first reward — shown to measurably increase completion.
          </span>
        </label>
        {headStart && (type === "stamp" || type === "plant") && (
          <div className="flex items-center gap-2">
            <Label
              htmlFor="head_start_percent"
              className="text-xs font-semibold text-muted-foreground"
            >
              Head start amount
            </Label>
            <Input
              id="head_start_percent"
              type="number"
              min={5}
              max={50}
              value={headStartPercent}
              onChange={(e) => setHeadStartPercent(Number(e.target.value))}
              className="h-9 w-20 rounded-lg"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}
      </div>
      <input
        type="hidden"
        name="head_start"
        value={headStart ? "true" : "false"}
      />
      {headStart && (type === "stamp" || type === "plant") && (
        <input
          type="hidden"
          name="head_start_percent"
          value={headStartPercent}
        />
      )}
    </div>
  );
}
```

(The percent input and its hidden mirror only render — and thus only
submit — when the toggle is on AND the type is stamp/plant; streak's toggle
still renders with no percent field at all, matching the "streak stays
fixed" decision. The label is kept as a separate flex sibling from the new
percent-input block, both inside one `flex-1` column, specifically so the
percent `<Input>` is never nested inside the `<label>` — nesting an
unrelated input inside a `<label>` associated with the `Switch` would risk
a stray click on the number input also toggling the switch.)

- [ ] **Step 6: Add a dom test for the new field**

Append to the `describe("SetupForm type picker", ...)` block in
`src/app/setup/setup-form.dom.test.tsx`:

```tsx
it("shows the head-start percent input only for stamp/plant with the toggle on, and submits it", async () => {
  const user = userEvent.setup();
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  expect(screen.queryByLabelText("Head start amount")).not.toBeInTheDocument();

  await user.click(screen.getByLabelText(/give new customers a head start/i));
  const percentInput = screen.getByLabelText("Head start amount");
  expect(percentInput).toHaveValue(20);

  await user.clear(percentInput);
  await user.type(percentInput, "35");
  await user.type(screen.getByLabelText("Card name"), "Coffee card");
  await user.type(screen.getByLabelText("Reward"), "Free kopi");
  await user.click(screen.getByRole("button", { name: "Create card" }));

  expect(saveMock).toHaveBeenCalled();
  const submitted = saveMock.mock.calls[0][1] as FormData;
  expect(submitted.get("head_start_percent")).toBe("35");
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/preview-state.test.ts src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — all tests (existing + new).

- [ ] **Step 8: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 9: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/preview-state.ts src/app/setup/preview-animation.ts test/app/preview-state.test.ts src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: vendor-facing head-start percent input, wired through the preview and animation"
```

## Self-Review Notes

- **Spec coverage:** Section A (migration) → Task 1. Section B (schema/buildProgramFields) → Task 2 Steps 3-4. Section C (actions.ts) → Task 2 Step 5. Section D (setup-form.tsx UI) → Task 3 Step 5. Section E (preview-state.ts) → Task 3 Step 3. All covered.
- **Placeholder scan:** none — every step shows complete code.
- **Type consistency:** `headStartPercent` is the consistent TS field name throughout (`PreviewInput`, `buildProgramFields`'s return, `SetupForm`'s state); `head_start_percent` is the consistent snake_case name for the DB column, Zod schema key, FormData key, and RPC param (`p_head_start_percent`) — matches this codebase's established camelCase-in-TS / snake_case-at-the-DB-and-form-boundary convention throughout every existing field in this same file.
- **Corrected a wrong claim in the approved spec**: Section E said `preview-animation.ts` needs no changes; Task 3 Step 4 shows this is false (`recipeKey` is a manually-maintained field list, not auto-derived) and fixes it. Flagging this here since it's a case where the plan overrides spec text — the correction is a bugfix, not a scope change, so it doesn't need re-approval, but it's the kind of divergence worth being explicit about.
