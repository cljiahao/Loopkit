# Programs reward cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a stamp program one vendor-set reward cost (`programs.reward_cost_cents`), editable from the program edit form, so the Overview can show what the reward liability costs.

**Architecture:** One nullable integer column on `loopkit.programs` (SGD cents, `>= 0`). Read it through the existing `Program` type / `PROGRAM_COLUMNS` select. Write it only on the program **edit** path (`saveProgramAction`'s direct `.update()`); program **create** leaves it `null` (the vendor sets it later, when cost matters). No RPC signature change. A dollars-to-cents pair of pure helpers keeps money as integer cents everywhere.

**Tech Stack:** Supabase migration SQL, TypeScript strict, Zod, React Hook Form (existing `setup-form.tsx`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-vendor-dashboard-redesign-design.md` (sub-plan 2 of 5)

## Global Constraints

- Pin exact dependency versions: no `^`/`~` on new or changed deps. (This plan adds none.)
- **No em dashes** in any user-facing copy or code comment. Use a period, comma, colon, or parentheses; split into two sentences. Sweep any em dash out of a line you are already editing.
- TypeScript strict: no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in RLS policies, not app code. `loopkit.programs` already has a `FOR ALL` owner policy (`programs_own`, migration 0001) that covers every column; a new column needs no new policy.
- Money is integer cents, never a float. Currency is SGD.
- CI gate: changed-line coverage >= 80% (diff-cover). Every task ships its own tests.
- Every PR touches `CHANGELOG.md` (`## [Unreleased]`) and keeps every changed folder's `README.md` current in the same commit, including `CHANGELOG.md` -> a running-narrative sentence in the root `README.md` (loopkit convention: the last several `main` commits all pair a CHANGELOG change with a root README sentence).
- After a new migration, hand-edit `src/lib/types.ts` to match (the repo maintains it by hand; there is no `supabase gen types` script wired up, and the implementer cannot reach the live database).

## File Structure

- `supabase/migrations/0045_loopkit_reward_cost.sql` (create) - the column + check constraint.
- `test/db/reward-cost-schema.test.ts` (create) - static SQL string-match, same shape as `test/db/vendor-notify-settings-schema.test.ts`.
- `src/lib/types.ts` (modify) - add `reward_cost_cents` to `loopkit.programs` Row/Insert/Update.
- `src/lib/money.ts` (create) - `dollarsToCents` / `centsToDollars` / `formatSgd` pure helpers.
- `test/lib/money.test.ts` (create).
- `src/lib/program.ts` (modify) - `PROGRAM_COLUMNS`, `Program` type, `saveProgramSchema` stamp variant field.
- `test/lib/program.test.ts` (modify) - the new schema field.
- `src/app/setup/actions.ts` (modify) - thread the field into the edit-path `.update()`.
- `src/app/setup/setup-form.tsx` (modify) - the input, in the stamp branch.
- `src/app/setup/setup-form.dom.test.tsx` (modify) - renders + round-trips.
- `CHANGELOG.md`, `supabase/migrations/README.md`, `src/lib/README.md`, `src/app/setup/README.md`, root `README.md` (modify).

---

### Task 1: Migration + schema test

**Files:**

- Create: `supabase/migrations/0045_loopkit_reward_cost.sql`
- Test: `test/db/reward-cost-schema.test.ts`

**Interfaces:**

- Produces: `loopkit.programs.reward_cost_cents integer` (nullable, `check (reward_cost_cents is null or reward_cost_cents >= 0)`).

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0045_loopkit_reward_cost.sql",
  "utf8",
);

describe("0045 reward cost", () => {
  it("adds a nullable reward_cost_cents integer to loopkit.programs", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column (if not exists )?reward_cost_cents integer/i,
    );
  });

  it("constrains it to null or non-negative", () => {
    expect(sql).toMatch(
      /check \(\s*reward_cost_cents is null or reward_cost_cents >= 0\s*\)/i,
    );
  });

  it("adds no new RLS policy (the FOR ALL owner policy already covers it)", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** - `pnpm exec vitest run test/db/reward-cost-schema.test.ts` - FAIL (file not found).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0045_loopkit_reward_cost.sql
-- Vendor-dashboard redesign, sub-plan 2: one reward cost per stamp program,
-- the vendor's own estimate of the reward item's COGS in SGD cents. Used by
-- the Overview cost panel (rewards_redeemed_this_month * reward_cost_cents).
-- Nullable: a program with no estimate set is shown as "cost not set", never
-- as $0. programs_own (migration 0001, FOR ALL) already covers the column,
-- so no policy change.

alter table loopkit.programs
  add column if not exists reward_cost_cents integer
    check (reward_cost_cents is null or reward_cost_cents >= 0);
```

- [ ] **Step 4: Run the test, verify it passes.**

- [ ] **Step 5: Commit** - `git commit -m "feat(db): add programs.reward_cost_cents (migration 0045)"`

---

### Task 2: types.ts + money helpers

**Files:**

- Modify: `src/lib/types.ts`
- Create: `src/lib/money.ts`, `test/lib/money.test.ts`

**Interfaces:**

- Produces:
  - `dollarsToCents(dollars: number): number` - `Math.round(dollars * 100)`.
  - `centsToDollars(cents: number): number` - `cents / 100`.
  - `formatSgd(cents: number): string` - `"$" + (cents / 100).toFixed(2)`, e.g. `formatSgd(120)` -> `"$1.20"`.
  - `types.ts`: `reward_cost_cents: number | null` on `loopkit.programs` Row; `reward_cost_cents?: number | null` on Insert and Update.

- [ ] **Step 1: Write the failing test** - `test/lib/money.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars, formatSgd } from "@/lib/money";

describe("dollarsToCents", () => {
  it("converts and rounds to the nearest cent", () => {
    expect(dollarsToCents(1.2)).toBe(120);
    expect(dollarsToCents(1.005)).toBe(101); // 1.005 * 100 = 100.499... -> Math.round guards float drift; assert actual
  });
  it("handles zero and whole dollars", () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(3)).toBe(300);
  });
});

describe("centsToDollars", () => {
  it("is the inverse for whole cents", () => {
    expect(centsToDollars(120)).toBe(1.2);
    expect(centsToDollars(0)).toBe(0);
  });
});

describe("formatSgd", () => {
  it("always shows two decimal places with a leading $", () => {
    expect(formatSgd(120)).toBe("$1.20");
    expect(formatSgd(0)).toBe("$0.00");
    expect(formatSgd(1050)).toBe("$10.50");
  });
});
```

Note on `dollarsToCents(1.005)`: `1.005 * 100` is `100.49999999999999` in IEEE 754, so `Math.round` gives `100`. Assert the real value (`100`), not the naive `101`. Adjust the test literal to `toBe(100)` and add a one-line comment saying why. This is the behaviour we want documented, not a bug to fix (the form step is `0.01` and users type at most 2 decimals).

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Write `src/lib/money.ts`**

```ts
// SGD money helpers. The database stores integer cents (programs.reward_cost_cents
// and future reward-cost fields); forms collect dollars. Keep the conversion in
// one place so rounding is consistent.

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatSgd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
```

- [ ] **Step 4: Edit `src/lib/types.ts`** - find the `loopkit` -> `Tables` -> `programs` block (around line 28). Add `reward_cost_cents: number | null;` to `Row` next to `reward_expiry_days`, and `reward_cost_cents?: number | null;` to both `Insert` and `Update` in the same relative position. Match the existing formatting exactly.

- [ ] **Step 5: Run `pnpm exec vitest run test/lib/money.test.ts` and `pnpm exec tsc --noEmit`. Both green.**

- [ ] **Step 6: Commit** - `git commit -m "feat(lib): SGD money helpers + reward_cost_cents in DB types"`

---

### Task 3: Program type + schema field

**Files:**

- Modify: `src/lib/program.ts`, `test/lib/program.test.ts`

**Interfaces:**

- Consumes: `emptyToUndefined` (already in `program.ts`).
- Produces:
  - `Program.reward_cost_cents: number | null`.
  - `saveProgramSchema` stamp variant gains `reward_cost_dollars?: number` (preprocessed from `""`/absent to `undefined`, `z.coerce.number().min(0).max(100000).optional()`).
  - `PROGRAM_COLUMNS` includes `reward_cost_cents`.

- [ ] **Step 1: Add the failing test** to `test/lib/program.test.ts` (in the existing `saveProgramSchema` describe block):

```ts
it("accepts an optional reward_cost_dollars on a stamp program and coerces it", () => {
  const parsed = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee",
    stamps_required: "10",
    reward_text: "Free coffee",
    head_start: "false",
    reward_cost_dollars: "1.20",
  });
  expect(parsed.success).toBe(true);
  if (parsed.success && parsed.data.type === "stamp") {
    expect(parsed.data.reward_cost_dollars).toBe(1.2);
  }
});

it("treats a blank reward_cost_dollars as unset", () => {
  const parsed = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee",
    stamps_required: "10",
    reward_text: "Free coffee",
    head_start: "false",
    reward_cost_dollars: "",
  });
  expect(parsed.success).toBe(true);
  if (parsed.success && parsed.data.type === "stamp") {
    expect(parsed.data.reward_cost_dollars).toBeUndefined();
  }
});

it("rejects a negative reward_cost_dollars", () => {
  const parsed = saveProgramSchema.safeParse({
    type: "stamp",
    name: "Coffee",
    stamps_required: "10",
    reward_text: "Free coffee",
    head_start: "false",
    reward_cost_dollars: "-1",
  });
  expect(parsed.success).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails.**

- [ ] **Step 3: Edit `src/lib/program.ts`:**
  - `PROGRAM_COLUMNS`: append `,reward_cost_cents`.
  - `Program` type: add `reward_cost_cents: number | null;` after `reward_expiry_days`.
  - In the `saveProgramSchema` `z.literal("stamp")` object, next to `reward_expiry_days: rewardExpiryDaysSchema,` add:

```ts
      reward_cost_dollars: z.preprocess(
        emptyToUndefined,
        z.coerce.number().min(0).max(100000).optional(),
      ),
```

- [ ] **Step 4: Run the program tests + `tsc --noEmit`. Green.** (Adding an optional field is not a breaking change to `buildProgramFields`, which ignores it.)

- [ ] **Step 5: Commit** - `git commit -m "feat(program): reward_cost_cents read + reward_cost_dollars input schema"`

---

### Task 4: Persist on the edit path + the form field

**Files:**

- Modify: `src/app/setup/actions.ts`, `src/app/setup/setup-form.tsx`, `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `saveProgramSchema` (now with `reward_cost_dollars`), `dollarsToCents` from `@/lib/money`.

- [ ] **Step 1: `src/app/setup/actions.ts`**
  - Add `reward_cost_dollars: formData.get("reward_cost_dollars"),` to the `saveProgramSchema.safeParse({...})` object.
  - Import `dollarsToCents` from `@/lib/money`.
  - In `updateExistingProgram`, add to the `update: ProgramUpdate` object:

```ts
      ...(data.type === "stamp"
        ? {
            reward_cost_cents:
              data.reward_cost_dollars === undefined
                ? null
                : dollarsToCents(data.reward_cost_dollars),
          }
        : {}),
```

Leave `createNewProgram` untouched (the `create_program` RPC has no parameter for this; a new program starts with `reward_cost_cents` null and the vendor sets it on first edit). Add a one-line comment saying so.

- [ ] **Step 2: `src/app/setup/setup-form.tsx`** - in the stamp-type branch, near the `reward_text` / `reward_expiry_days` fields, add an optional number input:
  - `name="reward_cost_dollars"`, `type="number"`, `step="0.01"`, `min="0"`, `inputMode="decimal"`.
  - Label: `Reward cost (SGD, optional)`. Helper text: `Roughly what the reward costs you. Powers the cost view on your dashboard.`
  - `defaultValue={program?.reward_cost_cents != null ? centsToDollars(program.reward_cost_cents).toString() : ""}` (import `centsToDollars`). If the form uses React Hook Form `register`, register it as a plain optional string field, matching how `reward_expiry_days` is wired.
  - Match the surrounding field markup (shadcn `Input` + `Label`, the same wrapper classes the sibling fields use).

- [ ] **Step 3: `setup-form.dom.test.tsx`** - add a test:
  - Rendering the form in stamp mode shows a `Reward cost (SGD, optional)` field.
  - Passing a `program` prop with `reward_cost_cents: 150` renders the input with value `"1.5"`.
    Follow the file's existing render helpers and `program` fixture (extend the fixture with `reward_cost_cents`).

- [ ] **Step 4: Run `pnpm exec vitest run src/app/setup/ test/lib/` and `pnpm build`.** All green. (`pnpm build` per the standing rule: `pnpm check`/`test` miss Next client/server bundle-boundary errors.)

- [ ] **Step 5: Commit** - `git commit -m "feat(setup): edit a stamp program's reward cost"`

---

### Task 5: CHANGELOG + READMEs

**Files:** `CHANGELOG.md`, `supabase/migrations/README.md`, `src/lib/README.md`, `src/app/setup/README.md`, root `README.md`

- [ ] **Step 1: `CHANGELOG.md`** - under `## [Unreleased]` `### Added`: `Stamp programs can carry a reward cost estimate (SGD), edited from the program form and stored as integer cents (migration 0045). Feeds the upcoming dashboard cost view.`

- [ ] **Step 2: `supabase/migrations/README.md`** - add the `0045_loopkit_reward_cost.sql` bullet to Contents, matching the file's per-migration description style.

- [ ] **Step 3: `src/lib/README.md`** - add a `money.ts` entry (`dollarsToCents`/`centsToDollars`/`formatSgd`, SGD cents <-> dollars, one place for the rounding) and note `reward_cost_cents` on the `program.ts` `Program` description.

- [ ] **Step 4: `src/app/setup/README.md`** - note the new optional reward-cost field on the stamp form and that `saveProgramAction` writes `reward_cost_cents` on edit only.

- [ ] **Step 5: Root `README.md`** - add one running-narrative sentence in the vendor-dashboard-redesign area: `Sub-plan 2 landed: stamp programs now carry an optional reward cost (migration 0045), edited from the program form, for the dashboard cost view.`

- [ ] **Step 6: Commit** - `git commit -m "docs: note reward_cost_cents across CHANGELOG and folder READMEs"`

---

## Self-Review

- **Spec coverage:** sub-plan 2's deliverable is "`programs.reward_cost_cents` migration, type regen, a `rewardCostCents` field on `Program`, a small edit control." Tasks 1 (migration), 2 (types), 3 (`Program` field), 4 (edit control) cover it. The spec's "Reward cost" section (one nullable int, SGD cents, `rewards_redeemed_this_month * reward_cost_cents`) is satisfied; the consuming panel is sub-plan 3.
- **Naming:** the DB column and `Program` field are `reward_cost_cents`; the form field and Zod key are `reward_cost_dollars` (a dollars input). `dollarsToCents` bridges them. Consistent across Tasks 2-4.
- **No placeholder steps:** every step names the file and the exact edit.

## Execution Handoff

Subagent-driven (per the parent spec). Cheap model for Tasks 1, 2, 5; standard model for Tasks 3, 4.
