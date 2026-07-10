# Loyalty engine mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vendor-opt-in "endowed progress" head start for new stamp/plant/streak cards, and fix the post-redemption UI gap where Plant/Streak mode goes blank instead of showing the customer's fresh next-goal state (Stamp mode already does this correctly).

**Architecture:** One migration adds `loopkit.programs.head_start` and seeds new cards' initial progress in `enroll_card` when the flag is set; `create_program` gets an additive `p_head_start` param. `saveProgramSchema` / `/setup`'s form gain a checkbox for stamp/plant/streak types only. Separately, `redeemPlantAction`/`redeemStreakAction` are changed to return fresh progress (mirroring `recordVisitAction`'s shape) and `serve-customer.tsx` renders it instead of collapsing to a blank form — the underlying pure `plantStrategy.redeem()`/`streakStrategy.redeem()` functions already compute the correct state; this is a plumbing fix.

**Tech Stack:** Next.js 16 App Router, Supabase (`@supabase/ssr`, schema `loopkit`), Zod, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all Server Action input with Zod.
- Authorization lives in RLS policies / `SECURITY DEFINER` SQL functions — never widen a policy to fix a query.
- `src/lib/types.ts` is **hand-written**, not CLI-generated (no live codegen available) — every migration in this plan must be mirrored there by hand, matching its exact columns/types.
- `supabase-migrate` is a safety-gated skill — the human must run it (or apply the SQL directly via the Supabase SQL editor) after Task 1's migration file is written; it cannot be auto-invoked. Because `types.ts` is hand-written, later tasks are NOT blocked on the migration being applied to the live DB — only the actual seeding behavior is (that's a runtime/manual-verification concern, not a typecheck one).
- Endowed progress only applies to `stamp`/`plant`/`streak` program types — `lucky`/`wheel`/`scratch` are pity-counter mechanics with no accumulating goal to seed, and must not show the head-start checkbox or be touched by `enroll_card`'s seeding branch.
- `stamps_required` doubles as each type's completion threshold today (`visits_to_bloom` for plant, `target_streak` for streak — see `saveProgramSchema` in `src/lib/program.ts`), so seeding math can read one column uniformly across all three types.

---

## File Structure

- **Create** `supabase/migrations/0014_loopkit_head_start.sql` — `programs.head_start` column, additive `create_program` param, `enroll_card` seeding logic.
- **Create** `test/db/head-start-schema.test.ts` — regex-on-migration-text schema test (precedent: `test/db/card-lifecycle-schema.test.ts`).
- **Modify** `src/lib/types.ts` — hand-mirror the new column + `create_program` Args.
- **Modify** `src/lib/program.ts` — `Program` type, `PROGRAM_COLUMNS`, `saveProgramSchema` (stamp/plant/streak variants).
- **Modify** `src/app/setup/actions.ts` — thread `head_start` through create/update paths.
- **Modify** `src/app/setup/setup-form.tsx` — checkbox UI for stamp/plant/streak types.
- **Modify** `src/app/dashboard/actions.ts` — `redeemPlantAction`/`redeemStreakAction` return fresh progress.
- **Modify** `src/app/dashboard/serve-customer.tsx` — render returned progress instead of blanking on redeem.
- **Modify** `test/app/dashboard-actions.test.ts` — cover the new redeem return shape.

---

### Task 1: Migration — `head_start` column + seeding + additive `create_program` param

**Files:**

- Create: `supabase/migrations/0014_loopkit_head_start.sql`
- Create: `test/db/head-start-schema.test.ts`

**Interfaces:**

- Produces: column `loopkit.programs.head_start boolean not null default false`; `loopkit.create_program(...)` gains additive `p_head_start boolean default false`; `loopkit.enroll_card(p_program uuid, p_phone text)` keeps its existing signature/Returns but seeds `cards.stamp_count`/`cards.state` on insert when the program's `head_start` is true. Consumed by Task 2 (`types.ts`), Task 3 (`program.ts`), Task 4 (`setup/actions.ts`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0014_loopkit_head_start.sql
-- Endowed Progress Effect (Nunes & Drèze 2006, Journal of Consumer Research):
-- a loyalty card pre-filled with ~20% progress toward its first reward
-- (2-of-10 stamps in the original study) hit 34% completion vs. 19% for a
-- blank card requiring the identical number of purchases — a head start
-- measurably lifts completion independent of objective distance to the
-- reward. Vendor opt-in (head_start), off by default: it's real reward
-- inventory the vendor is choosing to give away, their call. Meaningful only
-- for stamp/plant/streak — their redeem step accumulates toward a visible
-- goal; lucky/wheel/scratch are pity-counter mechanics with no goal to seed.

alter table loopkit.programs
  add column head_start boolean not null default false;

-- create_program: additive trailing p_head_start (defaulted, so existing
-- callers keep working unchanged). Same vendor/Pro gate as 0008/0012.
create or replace function loopkit.create_program(
  p_type            text,
  p_name            text,
  p_stamps_required int,
  p_reward_text     text,
  p_config          jsonb,
  p_expiry_days     int default null,
  p_head_start      boolean default false
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
  if not (
    loopkit.is_pro(v_uid)
    or (select count(*) from loopkit.programs where vendor_id = v_uid) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days, head_start)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config, p_expiry_days, p_head_start)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(text, text, int, text, jsonb, int, boolean) to authenticated;

-- enroll_card: seed new cards with ~20% progress (Endowed Progress Effect)
-- when the program has head_start enabled. stamps_required doubles as each
-- type's completion threshold (visits_to_bloom for plant, target_streak for
-- streak — see src/lib/program.ts's saveProgramSchema), so one calculation
-- covers all three seedable types. Lucky/wheel/scratch are untouched — no
-- accumulating goal to seed, seeding their pity counter would be a different
-- (and weaker) mechanic, out of scope here.
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
    v_seed := greatest(1, round(v_program.stamps_required * 0.2)::int);
    if v_program.type = 'stamp' then
      v_seed_stamp_count := least(v_seed, v_program.stamps_required - 1);
    elsif v_program.type = 'plant' then
      v_seed_state := jsonb_build_object(
        'growth', least(v_seed, v_program.stamps_required - 1),
        'last_visit_at', now(),
        'blooms', 0,
        'bloomed', false
      );
    elsif v_program.type = 'streak' then
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

- [ ] **Step 2: Write the schema test**

```typescript
// test/db/head-start-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Cheap guard against silent drift in the hand-written 0014 migration — regex
// presence checks only, not a substitute for running it against real Postgres.
const sql = readFileSync(
  "supabase/migrations/0014_loopkit_head_start.sql",
  "utf8",
);

describe("0014 head start", () => {
  it("adds a not-null, default-false head_start column to programs", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column head_start boolean not null default false/i,
    );
  });

  it("recreates create_program with an additive, defaulted p_head_start", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(/p_head_start\s+boolean default false/i);
    expect(sql).toMatch(
      /insert into loopkit\.programs\s*\n\s*\(vendor_id, type, name, stamps_required, reward_text, config, expiry_days, head_start\)/i,
    );
  });

  it("recreates enroll_card seeding stamp/plant/streak progress when head_start is set", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.enroll_card\(p_program uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(/if v_program\.head_start then/i);
    expect(sql).toMatch(/v_program\.type = 'stamp'/i);
    expect(sql).toMatch(/v_program\.type = 'plant'/i);
    expect(sql).toMatch(/v_program\.type = 'streak'/i);
    expect(sql).toMatch(
      /insert into loopkit\.cards \(program_id, phone, stamp_count, state\)/i,
    );
  });

  it("keeps enroll_card's phone validation and active-program guard", () => {
    expect(sql).toMatch(/p_phone !~ '\^\\\+65\[3689\]\[0-9\]\{7\}\$'/);
    expect(sql).toMatch(
      /select \* into v_program from loopkit\.programs where id = p_program and active/i,
    );
  });
});
```

- [ ] **Step 3: Run the new test**

Run: `pnpm test test/db/head-start-schema.test.ts`
Expected: 4 tests pass.

- [ ] **Step 4: Note the manual-apply step**

This migration is NOT applied to the live Supabase project by this task — that requires a human to run `/supabase-migrate` (safety-gated) or apply the SQL directly via the Supabase SQL editor. Do not attempt either. Task 2 hand-mirrors the schema into `types.ts` regardless, so later tasks are not blocked on the live apply for typechecking — only the actual runtime seeding behavior is, which is a manual-verification concern for Task 7.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0014_loopkit_head_start.sql test/db/head-start-schema.test.ts
git commit -m "feat: add head_start column, seed endowed progress in enroll_card"
```

---

### Task 2: Hand-mirror `types.ts`

**Files:**

- Modify: `src/lib/types.ts`

**Interfaces:**

- Consumes: the exact column/param shapes from Task 1's migration.
- Produces: `Database["loopkit"]["Tables"]["programs"]["Row"|"Insert"|"Update"]` gain `head_start`; `Database["loopkit"]["Functions"]["create_program"]["Args"]` gains `p_head_start`. Consumed by Task 3 (`program.ts`), Task 4 (`setup/actions.ts`).

- [ ] **Step 1: Add `head_start` to the `programs` table block**

In `src/lib/types.ts`, the `programs` table's `Row`/`Insert`/`Update` blocks each currently end with `expiry_days`. Add `head_start` immediately after each:

`Row` (around line 26):

```typescript
expiry_days: number | null;
head_start: boolean;
```

`Insert` (around line 38):

```typescript
          expiry_days?: number | null;
          head_start?: boolean;
```

`Update` (around line 50):

```typescript
          expiry_days?: number | null;
          head_start?: boolean;
```

- [ ] **Step 2: Add `p_head_start` to `create_program`'s Args**

Find the `create_program` block under `Functions` (around line 224-234) and add the new optional param after `p_expiry_days`:

```typescript
      create_program: {
        Args: {
          p_type: string;
          p_name: string;
          p_stamps_required: number;
          p_reward_text: string;
          p_config: Json;
          p_expiry_days?: number | null;
          p_head_start?: boolean;
        };
        Returns: string;
      };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: hand-mirror head_start into src/lib/types.ts"
```

---

### Task 3: `program.ts` — type, columns, schema

**Files:**

- Modify: `src/lib/program.ts`

**Interfaces:**

- Consumes: `Database["loopkit"]["Tables"]["programs"]["Row"]` (Task 2).
- Produces: `Program.head_start: boolean`; `saveProgramSchema`'s `stamp`/`plant`/`streak` variants each gain `head_start: boolean` (parsed from a `"true"|"false"` string). Consumed by Task 4 (`setup/actions.ts`), Task 5 (`setup-form.tsx`).

- [ ] **Step 1: Add `head_start` to `PROGRAM_COLUMNS` and `Program`**

```typescript
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start";

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
};
```

- [ ] **Step 2: Add `head_start` to the stamp/plant/streak schema variants**

In `saveProgramSchema`, add a `head_start` field to exactly the `stamp`, `plant`, and `streak` variants (NOT `lucky`/`wheel`/`scratch` — matching the design decision that endowed progress doesn't apply to pity-counter types). Same `"true"|"false"` string-to-boolean pattern as `src/app/admin/actions.ts`'s `setVendorProSchema`:

```typescript
  z.object({
    type: z.literal("stamp"),
    name: z.string().trim().min(1).max(60),
    stamps_required: z.coerce.number().int().min(2).max(20),
    reward_text: z.string().trim().min(1).max(80),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
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
    expiry_days: expiryDaysSchema,
  }),
```

(`lucky` variant shown unchanged for anchoring — do not add `head_start` to it, or to `wheel`/`scratch`.) Then the `streak` variant:

```typescript
  z.object({
    type: z.literal("streak"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    period_days: z.coerce.number().int().min(1).max(30),
    target_streak: z.coerce.number().int().min(2).max(20),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    expiry_days: expiryDaysSchema,
  }),
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: errors in `src/app/setup/actions.ts` (Task 4 fixes these — `data.head_start` doesn't exist yet on the lucky/wheel/scratch union branches, and the `ProgramUpdate`/RPC calls don't pass it yet). This is expected at this point in the plan; do not attempt to fix `setup/actions.ts` in this task.

- [ ] **Step 4: Commit**

```bash
git add src/lib/program.ts
git commit -m "feat: add head_start to Program type and saveProgramSchema"
```

---

### Task 4: `setup/actions.ts` — thread `head_start` through

**Files:**

- Modify: `src/app/setup/actions.ts`

**Interfaces:**

- Consumes: `saveProgramSchema` (Task 3), `Database["loopkit"]["Functions"]["create_program"]["Args"]` (Task 2).
- Produces: create path passes `p_head_start`; update path includes `head_start` in the `ProgramUpdate`. Consumed by Task 5 (form submits the field this reads).

- [ ] **Step 1: Compute `headStart` alongside `type`/`stampsRequired`/`config`**

In `saveProgramAction`, the existing `if (data.type === "stamp") { ... } else if (data.type === "lucky") { ... } else if (data.type === "plant") { ... } else if (data.type === "streak") { ... } else { ... }` block computes `type`/`stampsRequired`/`config` per branch. Add a parallel `let headStart: boolean;` declared alongside `let type: string;`, and set it in each branch:

```typescript
let type: string;
let stampsRequired: number;
let config: Json;
let headStart: boolean;
if (data.type === "stamp") {
  type = "stamp";
  stampsRequired = data.stamps_required;
  headStart = data.head_start;
  config = {
    stamps_required: data.stamps_required,
    reward_text: data.reward_text,
  };
} else if (data.type === "lucky") {
  type = "lucky";
  stampsRequired = data.pity_ceiling;
  headStart = false;
  config = {
    win_probability: data.win_percent / 100,
    pity_ceiling: data.pity_ceiling,
    cooldown_visits: 0,
    reward_text: data.reward_text,
  };
} else if (data.type === "plant") {
  type = "plant";
  stampsRequired = data.visits_to_bloom;
  headStart = data.head_start;
  config = buildPlantConfig(data.visits_to_bloom, data.reward_text) as Json;
} else if (data.type === "streak") {
  type = "streak";
  stampsRequired = data.target_streak;
  headStart = data.head_start;
  config = buildStreakConfig(
    data.period_days,
    data.target_streak,
    data.reward_text,
  ) as Json;
} else {
  type = data.type;
  stampsRequired = data.pity_ceiling ?? 10;
  headStart = false;
  config = buildChanceConfig(
    data.type,
    data.segments,
    data.pity_ceiling,
    data.reward_text,
  ) as Json;
}
```

- [ ] **Step 2: Pass it through the edit path**

```typescript
  if (isEdit) {
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

- [ ] **Step 3: Pass it through the create path**

```typescript
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

- [ ] **Step 4: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors (the previous task's expected errors are now resolved). If any remain, they indicate the discriminated-union narrowing didn't line up with what Task 3 actually produced — re-check `saveProgramSchema`'s field names against this file's `data.head_start` accesses.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/actions.ts
git commit -m "feat: thread head_start through saveProgramAction"
```

---

### Task 5: `/setup` form — head start checkbox

**Files:**

- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `Program.head_start` (Task 3).
- Produces: a `head_start` form field (`"true"|"false"` string) that Task 4's `saveProgramSchema` parse already expects.

- [ ] **Step 1: Add local state**

Near the existing `const [segments, setSegments] = useState<SegmentInput[]>(...)` declaration, add:

```typescript
const [headStart, setHeadStart] = useState(program?.head_start ?? false);
```

- [ ] **Step 2: Render the checkbox for stamp/plant/streak types only**

Add this block right before the existing `expiry_days` field (after the type-specific fields block, before `reward_text`/`expiry_days` — both are secondary/optional settings, so grouping them together reads naturally):

```typescript
      {(type === "stamp" || type === "plant" || type === "streak") && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <input
            type="checkbox"
            id="head_start_checkbox"
            checked={headStart}
            onChange={(e) => setHeadStart(e.target.checked)}
            className="mt-0.5 size-4 rounded border-input"
          />
          <label htmlFor="head_start_checkbox" className="text-sm">
            <span className="font-medium">Give new customers a head start</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              New signups start with a small amount of free progress toward
              their first reward — shown to measurably increase completion.
            </span>
          </label>
          <input
            type="hidden"
            name="head_start"
            value={headStart ? "true" : "false"}
          />
        </div>
      )}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `pnpm dev`, visit `/setup`, pick "Stamp card" — confirm the "Give new customers a head start" checkbox appears; switch to "Lucky Tap" — confirm it disappears; switch to "Sprout" or "Streak Club" — confirm it reappears. Toggle it and submit — no console errors (the create/update RPC calls will fail gracefully with a network/auth error in local dev without a live linked Supabase session, which is expected; just confirm no client-side crash or missing-field warning).

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/setup-form.tsx
git commit -m "feat: add head-start checkbox to /setup for stamp/plant/streak"
```

---

### Task 6: Post-redemption next-goal (Plant + Streak)

**Files:**

- Modify: `src/app/dashboard/actions.ts`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Modify: `test/app/dashboard-actions.test.ts`

**Interfaces:**

- Consumes: `getProgress` (`@/lib/engine`), `plantStrategy.redeem`/`streakStrategy.redeem` (already imported in `dashboard/actions.ts`).
- Produces: `redeemPlantAction`/`redeemStreakAction` return type changes from `ActionResult<{ phone: string }>` to `ActionResult<{ phone: string; progress: Progress }>`.

- [ ] **Step 1: Change `redeemPlantAction`'s return**

In `src/app/dashboard/actions.ts`, change the function signature and add a `progress` computation right after the `reset` state is computed, before the `record_visit` RPC call fires (the RPC call itself is unchanged — `reset` is already the exact state being persisted, so progress can be derived from it directly without a second DB read):

```typescript
export async function redeemPlantAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string; progress: Progress }>> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "No card yet for that number." };
  }

  const config = program.config as PlantConfig;
  const state = resolvePlantState({
    state: existing.state,
    stamp_count: 0,
    reward_count: 0,
  });
  const reset = plantStrategy.redeem(state, config);

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: reset as unknown as Json,
    p_kind: "redeem",
    p_payload: { reward: program.reward_text },
  });
  if (error) {
    console.error("record_visit redeem failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const progress = getProgress(
    program,
    { state: reset, stamp_count: 0, reward_count: 0 },
    new Date(),
  );

  revalidatePath("/dashboard");
  return { success: true, phone: normalized.phone, progress };
}
```

- [ ] **Step 2: Change `redeemStreakAction`'s return**

Same pattern:

```typescript
export async function redeemStreakAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string; progress: Progress }>> {
  await requireVendor();
  const program = await programFromForm(formData);
  if (!program) return { success: false, error: "Set up your card first." };
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("cards")
    .select("state")
    .eq("program_id", program.id)
    .eq("phone", normalized.phone)
    .maybeSingle();
  if (!existing) {
    return { success: false, error: "No card yet for that number." };
  }

  const config = program.config as StreakConfig;
  const state = resolveStreakState({
    state: existing.state,
    stamp_count: 0,
    reward_count: 0,
  });
  const reset = streakStrategy.redeem(state, config);

  const { error } = await supabase.rpc("record_visit", {
    p_program: program.id,
    p_phone: normalized.phone,
    p_state: reset as unknown as Json,
    p_kind: "redeem",
    p_payload: { reward: program.reward_text },
  });
  if (error) {
    console.error("record_visit redeem failed", error.message);
    return { success: false, error: "Something went wrong. Try again." };
  }

  const progress = getProgress(
    program,
    { state: reset, stamp_count: 0, reward_count: 0 },
    new Date(),
  );

  revalidatePath("/dashboard");
  return { success: true, phone: normalized.phone, progress };
}
```

- [ ] **Step 3: Render the returned progress in `serve-customer.tsx`**

Replace `confirmRedeemPlant`:

```typescript
function confirmRedeemPlant() {
  if (!result || result.mode !== "plant") return;
  const phone = result.phone;
  run(async () => {
    const fd = new FormData();
    fd.set("phone", phone);
    fd.set("program_id", programId);
    const res = await redeemPlantAction(fd);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Reward redeemed for ${res.phone}.`);
    if (res.progress.view.kind === "plant") {
      setResult({
        mode: "plant",
        phone: res.phone,
        view: res.progress.view,
        label: res.progress.label,
        rewardReady: res.progress.rewardReady,
        rewardUnlocked: false,
      });
    } else {
      setResult(null);
    }
    setRedeemOpen(false);
    router.refresh();
  });
}
```

Replace `confirmRedeemStreak`:

```typescript
function confirmRedeemStreak() {
  if (!result || result.mode !== "streak") return;
  const phone = result.phone;
  run(async () => {
    const fd = new FormData();
    fd.set("phone", phone);
    fd.set("program_id", programId);
    const res = await redeemStreakAction(fd);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success(`Reward redeemed for ${res.phone}.`);
    if (res.progress.view.kind === "streak") {
      setResult({
        mode: "streak",
        phone: res.phone,
        view: res.progress.view,
        label: res.progress.label,
        rewardReady: res.progress.rewardReady,
        rewardUnlocked: false,
      });
    } else {
      setResult(null);
    }
    setRedeemOpen(false);
    router.refresh();
  });
}
```

- [ ] **Step 4: Write tests for the new return shape**

Append to `test/app/dashboard-actions.test.ts`. This needs a real `PlantConfig`/`StreakConfig` fixture (not the empty `{}` the existing `program` fixture uses) so `plantStrategy.redeem`/`streakStrategy.redeem` and `getProgress` compute a real stage. Add these imports at the top of the file (alongside the existing ones) and two new `describe` blocks:

```typescript
import { buildPlantConfig, buildStreakConfig } from "@/lib/program";
```

```typescript
describe("redeemPlantAction returns fresh progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("shows the reset Seed stage immediately after redeeming a bloomed plant", async () => {
    const plantProgram = {
      id: "p2",
      name: "Sprout",
      stamps_required: 8,
      reward_text: "Free plant",
      type: "plant",
      config: buildPlantConfig(8, "Free plant"),
      active: true,
    };
    getProgramByIdMock.mockResolvedValue(plantProgram);
    maybeSingleMock.mockResolvedValue({
      data: {
        state: {
          growth: 8,
          last_visit_at: "2026-01-01T00:00:00Z",
          blooms: 0,
          bloomed: true,
        },
      },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await redeemPlantAction(
      form({ program_id: "p2", phone: "91234567" }),
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.progress.view).toEqual({
        kind: "plant",
        stage: 0,
        stageName: "Seed",
        totalStages: 5,
        wilting: false,
      });
      expect(res.progress.rewardReady).toBe(false);
    }
  });
});

describe("redeemStreakAction returns fresh progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("shows the reset streak count immediately after redeeming", async () => {
    const streakProgram = {
      id: "p3",
      name: "Regulars",
      stamps_required: 4,
      reward_text: "Free item",
      type: "streak",
      config: buildStreakConfig(7, 4, "Free item"),
      active: true,
    };
    getProgramByIdMock.mockResolvedValue(streakProgram);
    maybeSingleMock.mockResolvedValue({
      data: {
        state: {
          current_streak: 4,
          window_start: "2026-01-01T00:00:00Z",
          reward_banked: true,
        },
      },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await redeemStreakAction(
      form({ program_id: "p3", phone: "91234567" }),
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.progress.view.kind).toBe("streak");
      if (res.progress.view.kind === "streak") {
        expect(res.progress.view.current).toBe(0);
      }
      expect(res.progress.rewardReady).toBe(false);
    }
  });
});
```

Also add `redeemPlantAction, redeemStreakAction` to this file's existing import from `@/app/dashboard/actions`:

```typescript
import {
  stampAction,
  lookupAction,
  redeemPlantAction,
  redeemStreakAction,
} from "@/app/dashboard/actions";
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test test/app/dashboard-actions.test.ts`
Expected: all tests pass (existing 5 + 2 new).

- [ ] **Step 6: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/actions.ts src/app/dashboard/serve-customer.tsx test/app/dashboard-actions.test.ts
git commit -m "fix: show fresh next-goal state after Plant/Streak redemption"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + lint + full test suite**

Run: `pnpm check && pnpm test`
Expected: no errors, all tests pass (baseline 209 + new tests from Task 1 (4) and Task 6 (2) = 215).

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 3: Manual verification (requires the migration to actually be applied)**

This step requires the human to have applied Task 1's migration (via `/supabase-migrate` or the Supabase SQL editor) to a real environment first — flag this to the user rather than attempting it.

Using `pnpm dev` against a linked/live Supabase project:

1. Create a Stamp card program with "Give new customers a head start" checked. Enroll a brand-new phone number via `/c`. Confirm the vendor dashboard shows that customer starting at >0 stamps (not 0), and that the seed never equals `stamps_required` (no free reward at signup).
2. Repeat for a Sprout (plant) program — confirm the new card starts above the "Seed" stage.
3. Repeat for a Streak Club program — confirm the new card shows `current: 1` instead of 0.
4. Create a Lucky Tap program — confirm the checkbox does NOT appear on `/setup` for it.
5. On an existing Sprout program, water a card to bloom, then redeem it from the vendor dashboard — confirm the UI immediately shows the reset Seed-stage plant (not a blank lookup form).
6. Repeat step 5 for a Streak Club program at its target streak.

Expected: all six behaviors match, no console errors.

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address issues found in manual verification"
```

(Only if Step 3 surfaced fixes — otherwise skip, nothing to commit.)
