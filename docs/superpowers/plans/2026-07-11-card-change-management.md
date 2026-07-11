# Card-type change management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two gaps yesterday's `changeTypeAction` spec explicitly
left open: let a vendor opt in to carrying a customer's stamp count onto a
same-type replacement card, and replace the easy-to-miss passive "retired"
notice with a dialog a customer can't scroll past.

**Architecture:** One additive migration (`programs.carry_over_stamps`,
`create_program`/`enroll_card` seeding logic, `vendor_join` widened to also
project the new card's stamp count). Carryover only ever applies
stamp→stamp — every other type pairing keeps today's reset-to-zero
behavior, enforced both in the UI (checkbox hidden) and the RPC (type-match
guard). Notification stays 100% passive/pull-based (no SMS) — the change is
making the existing pull surface impossible to miss, not adding a push
channel.

**Tech Stack:** Next.js 16 App Router, Supabase `@supabase/ssr`, Zod,
Vitest, this repo's existing regex-on-migration-text schema test
convention, shadcn `AlertDialog`.

## Global Constraints

- A program's `type` stays immutable in place — carryover happens by
  seeding the _new_ card's progress at enrollment time, never by mutating
  an existing card's `program_id` or an existing program's `type`.
- `changeTypeAction`'s deactivate → create → link sequence and its
  non-transactional failure handling are unchanged — this plan only adds a
  flag to the create step, not a new sequence.
- The engine `Strategy` layer (`src/lib/engine/*`) and every program type's
  `config`/`state` shape are untouched.
- No SMS/push notification — the customer notice stays a client-rendered
  dialog driven by data already in `vendor_join`'s response, same trust
  model as the rest of `/c`'s customer-side state.
- **Migration numbering:** this plan claims `supabase/migrations/0018_loopkit_carry_over.sql`.
  The sibling `2026-07-11-vendor-identity-profile-ui.md` plan claims `0017`
  (a `loopkit.vendors` table — unrelated schema, no ordering dependency
  between the two). **Before Step 1 of Task 1, re-run `ls supabase/migrations/`
  and confirm `0017` has landed and `0018` is still free** — if `0017` hasn't
  shipped yet, this migration still numbers itself `0018` (reserving the
  slot in sequence) rather than filling the gap at `0017`, to avoid a
  collision if both land close together.

---

### Task 1: Schema — `carry_over_stamps` column, seeding logic, `vendor_join` widening

**Files:**

- Create: `supabase/migrations/0018_loopkit_carry_over.sql`
- Create: `test/db/carry-over-schema.test.ts`
- Modify: `src/lib/types.ts` (`programs` Row/Insert/Update, `create_program`
  Args, `vendor_join` Returns)
- Modify: `src/lib/program.ts` (`Program` type, `PROGRAM_COLUMNS`)

**Interfaces:**

- Produces: `programs.carry_over_stamps` column (`boolean`, default
  `false`); `create_program` RPC gains `p_carry_over_stamps?: boolean`;
  `vendor_join` RPC gains a `replaced_by_stamp_count: number | null`
  returned column; `Program` gains `carry_over_stamps: boolean`. Task 2
  consumes `p_carry_over_stamps`; Task 3 consumes `Program.carry_over_stamps`
  indirectly via the predecessor's `type` (not this flag directly — see
  Task 3); Task 4 consumes `replaced_by_stamp_count`.
- Consumes: `loopkit.programs`, `create_program`, `enroll_card`, and
  `vendor_join`, all currently defined across
  `supabase/migrations/0001_loopkit_core.sql`,
  `0014_loopkit_head_start.sql` (latest `enroll_card`, with plant/streak
  head-start branches — read in full before writing Step 1, don't
  paraphrase from memory), `0016_loopkit_program_replacement.sql` (latest
  `create_program`/`vendor_join`, including `replaced_by`/`replaced_by_name`).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0018_loopkit_carry_over.sql`:

```sql
alter table loopkit.programs
  add column carry_over_stamps boolean not null default false;

-- create_program: accept an optional carry-over flag, defaulted so every
-- existing call site (saveProgramAction's create path) is unaffected.
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false
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
    or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean
) to authenticated;

-- enroll_card: carry-over seeding takes precedence over head_start seeding,
-- but only when carryover actually applies (a same-type predecessor with a
-- card for this phone exists) — falling back to head_start otherwise keeps
-- a vendor who ticks the box in a genuinely-empty edge case from silently
-- losing the head-start seed they'd have gotten anyway. Carryover only
-- ever applies stamp -> stamp: every other type pairing has no meaningful
-- translation between engine-specific progress representations, so it's
-- left at 0 exactly as before (v_carried stays false, head_start's normal
-- branches run unchanged for plant/streak).
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_program loopkit.programs%rowtype;
  v_predecessor loopkit.programs%rowtype;
  v_seed_stamp_count int := 0;
  v_seed_state jsonb := '{}'::jsonb;
  v_seed int;
  v_carried boolean := false;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    return null;
  end if;

  select * into v_program from loopkit.programs where id = p_program and active;
  if not found then
    return null;
  end if;

  if v_program.carry_over_stamps then
    select p.* into v_predecessor
      from loopkit.programs p
      where p.replaced_by = v_program.id
      limit 1;
    if found and v_predecessor.type = 'stamp' and v_program.type = 'stamp' then
      select coalesce(c.stamp_count, 0) into v_seed_stamp_count
        from loopkit.cards c
        where c.program_id = v_predecessor.id and c.phone = p_phone;
      v_seed_stamp_count := least(coalesce(v_seed_stamp_count, 0), v_program.stamps_required);
      v_carried := true;
    end if;
  end if;

  if not v_carried and v_program.head_start then
    v_seed := greatest(1, round(v_program.stamps_required * 0.2)::int);
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

-- vendor_join: also surface the replacement card's current stamp_count (when
-- one exists) so /c can tell a customer how many stamps carried over. The
-- enrollment loop above already runs before this query on every call, so by
-- the time nc is joined, a customer re-checking /c after migration already
-- has a card in the replacement program (created via the loop, seeded per
-- carry_over_stamps above). Same DROP-then-CREATE-OR-REPLACE requirement as
-- 0016 — a RETURNS TABLE column addition changes the function's signature.
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
           r.name, nc.stamp_count
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Write the failing schema test**

Create `test/db/carry-over-schema.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0018_loopkit_carry_over.sql",
  "utf8",
);

describe("0017 carry over", () => {
  it("adds a carry_over_stamps column defaulting to false", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column carry_over_stamps boolean not null default false/i,
    );
  });

  it("create_program accepts an optional carry-over flag", () => {
    expect(sql).toMatch(/p_carry_over_stamps\s+boolean default false/i);
    expect(sql).toMatch(
      /grant execute on function loopkit\.create_program\(\s*text, text, int, text, jsonb, int, boolean, boolean\s*\) to authenticated/i,
    );
  });

  it("enroll_card seeds stamp_count from a same-type predecessor's card when carry_over_stamps is set", () => {
    expect(sql).toMatch(/if v_program\.carry_over_stamps then/i);
    expect(sql).toMatch(/where p\.replaced_by = v_program\.id/i);
    expect(sql).toMatch(
      /v_predecessor\.type = 'stamp' and v_program\.type = 'stamp'/i,
    );
    expect(sql).toMatch(
      /least\(coalesce\(v_seed_stamp_count, 0\), v_program\.stamps_required\)/i,
    );
  });

  it("keeps enroll_card's head_start branches (stamp/plant/streak) as a fallback", () => {
    expect(sql).toMatch(/if not v_carried and v_program\.head_start then/i);
    expect(sql).toMatch(/elsif v_program\.type = 'plant' then/i);
    expect(sql).toMatch(/elsif v_program\.type = 'streak' then/i);
  });

  it("widens vendor_join with replaced_by_stamp_count via a second left join", () => {
    expect(sql).toMatch(/replaced_by_name text, replaced_by_stamp_count int/i);
    expect(sql).toMatch(
      /left join loopkit\.cards nc on nc\.program_id = p\.replaced_by and nc\.phone = c\.phone/i,
    );
    expect(sql).toMatch(/r\.name, nc\.stamp_count/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm vitest run test/db/carry-over-schema.test.ts`
Expected: PASS, all 5 tests (this repo's established convention: a
regex-on-file-text test passes as soon as the migration file exists with
matching text).

- [ ] **Step 4: Update `src/lib/types.ts`**

`programs` Row/Insert/Update each gain `carry_over_stamps: boolean` /
`carry_over_stamps?: boolean` alongside the existing `head_start` field.

`create_program`'s `Args` gains `p_carry_over_stamps?: boolean` alongside
`p_head_start`.

`vendor_join`'s `Returns` entry gains `replaced_by_stamp_count: number |
null` alongside the existing `replaced_by_name: string | null`.

- [ ] **Step 5: Update `src/lib/program.ts`**

Change:

```typescript
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start,replaced_by";

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
};
```

to:

```typescript
const PROGRAM_COLUMNS =
  "id,name,stamps_required,reward_text,type,config,active,expiry_days,head_start,replaced_by,carry_over_stamps";

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

- [ ] **Step 6: Run typecheck and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS. `Program` gaining a required field is additive at the type
level — every caller reads it back from `listPrograms`/`getProgramById`,
none construct a `Program` literal by hand.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0018_loopkit_carry_over.sql test/db/carry-over-schema.test.ts src/lib/types.ts src/lib/program.ts
git commit -m "feat: add carry_over_stamps column, enroll_card seeding, vendor_join stamp-count projection"
```

---

### Task 2: `changeTypeAction` — wire the carry-over flag

**Files:**

- Modify: `src/app/setup/actions.ts` (`changeTypeAction`)
- Modify: `test/app/change-type-action.test.ts`

**Interfaces:**

- Consumes: `existing.type` (the predecessor's type, already loaded by
  `getProgramById` at the top of `changeTypeAction`), `type` (the parsed
  new type from `buildProgramFields`), `create_program`'s
  `p_carry_over_stamps` param (Task 1).
- Produces: no new exports — `changeTypeAction`'s existing signature and
  `SaveProgramState` return type are unchanged.

- [ ] **Step 1: Extend the failing tests**

In `test/app/change-type-action.test.ts`, add after the existing "still
redirects successfully even if the final link update fails" test:

```typescript
it("passes carry_over_stamps through on a same-type (stamp -> stamp) migration when ticked", async () => {
  getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "stamp" });

  await expect(
    changeTypeAction({}, form({ ...stampFields, carry_over_stamps: "true" })),
  ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

  expect(rpcMock).toHaveBeenCalledWith(
    "create_program",
    expect.objectContaining({ p_carry_over_stamps: true }),
  );
});

it("ignores carry_over_stamps when the predecessor's type differs from the new type", async () => {
  getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "wheel" });

  await expect(
    changeTypeAction({}, form({ ...stampFields, carry_over_stamps: "true" })),
  ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

  expect(rpcMock).toHaveBeenCalledWith(
    "create_program",
    expect.objectContaining({ p_carry_over_stamps: false }),
  );
});

it("defaults carry_over_stamps to false when not submitted", async () => {
  getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "stamp" });

  await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
    "REDIRECT:/dashboard?p=new-id",
  );

  expect(rpcMock).toHaveBeenCalledWith(
    "create_program",
    expect.objectContaining({ p_carry_over_stamps: false }),
  );
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run test/app/change-type-action.test.ts`
Expected: FAIL on all 3 new cases — `changeTypeAction` doesn't send
`p_carry_over_stamps` at all yet.

- [ ] **Step 3: Wire the flag in `changeTypeAction`**

In `src/app/setup/actions.ts`, after the existing
`buildProgramFields(parsed.data)` destructure and before the "1. Deactivate
the old program" comment, add:

```typescript
// Belt-and-suspenders: the UI only renders the checkbox when the
// predecessor's type and the new type both resolve to "stamp" (Task 3),
// but a stray field in the submitted form must never carry the flag
// through for a type pairing the RPC's own guard (Task 1) wouldn't have
// honored anyway — this keeps the intent visible at the call site too.
const carryOverStamps =
  formData.get("carry_over_stamps") === "true" &&
  existing.type === "stamp" &&
  type === "stamp";
```

Then add `p_carry_over_stamps: carryOverStamps,` to the `create_program`
RPC call's argument object (after `p_head_start: headStart,`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/change-type-action.test.ts`
Expected: PASS, all 8 tests (5 existing + 3 new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/actions.ts test/app/change-type-action.test.ts
git commit -m "feat: wire carry_over_stamps through changeTypeAction"
```

---

### Task 3: `/setup?migrate=` UI — carryover checkbox

**Files:**

- Modify: `src/app/setup/page.tsx` (pass the predecessor's type down)
- Modify: `src/app/setup/setup-form.tsx` (checkbox)

**Interfaces:**

- Consumes: `migrating.type` (`src/app/setup/page.tsx`, already loaded).
- Produces: `<SetupForm ... replacingType={string | null} />` — a new
  required prop; every existing call site must pass it explicitly (`null`
  where not migrating).

No dedicated test file for this task — matches this repo's existing
convention for `SetupForm`'s other UI-only additions (the template grid
and status badges in the prior spec's Task 6 also shipped without a
component test, verified manually instead).

- [ ] **Step 1: Pass the predecessor's type from `/setup/page.tsx`**

Change:

```typescript
              <SetupForm
                program={migrating ? null : editing}
                isEdit={isEdit}
                replacingId={migrating ? migrating.id : null}
              />
```

to:

```typescript
              <SetupForm
                program={migrating ? null : editing}
                isEdit={isEdit}
                replacingId={migrating ? migrating.id : null}
                replacingType={migrating ? migrating.type : null}
              />
```

- [ ] **Step 2: Add the `replacingType` prop and checkbox to `SetupForm`**

In `src/app/setup/setup-form.tsx`, change the prop destructure:

```typescript
export function SetupForm({
  program,
  isEdit,
  replacingId,
}: {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
}) {
```

to:

```typescript
export function SetupForm({
  program,
  isEdit,
  replacingId,
  replacingType,
}: {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
  replacingType: string | null;
}) {
```

Add state alongside the existing `headStart` state (after
`const [headStart, setHeadStart] = useState(program?.head_start ?? false);`):

```typescript
const [carryOverStamps, setCarryOverStamps] = useState(false);
const showCarryOverOption =
  replacingId !== null && replacingType === "stamp" && type === "stamp";
```

Add the checkbox block immediately after the existing head-start block
(after the `{(type === "stamp" || type === "plant" || type === "streak") &&
(...)}` block, before the `expiry_days` field):

```tsx
{
  showCarryOverOption && (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
      <input
        type="checkbox"
        id="carry_over_stamps_checkbox"
        checked={carryOverStamps}
        onChange={(e) => setCarryOverStamps(e.target.checked)}
        className="mt-0.5 size-4 rounded border-input"
      />
      <label htmlFor="carry_over_stamps_checkbox" className="text-sm">
        <span className="font-medium">
          Carry over customers&apos; current stamp count onto the new card
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Left unchecked, everyone starts the new card from zero.
        </span>
      </label>
      <input
        type="hidden"
        name="carry_over_stamps"
        value={carryOverStamps ? "true" : "false"}
      />
    </div>
  );
}
```

Note: `showCarryOverOption` re-derives on every render from `type` (the
vendor's current type-picker selection), so switching the type picker away
from "stamp" mid-flow hides the checkbox immediately and its hidden input
stops being submitted — no stale `carry_over_stamps=true` can leak through
for a type the vendor changed their mind on.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Per this repo's UI-change convention (no component test for this file):
start `pnpm dev`, create a stamp program, use "Change type" on it, confirm
the checkbox appears only when the new-card type picker is also "stamp",
and disappears when picking any other type.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/page.tsx src/app/setup/setup-form.tsx
git commit -m "feat: /setup carry-over checkbox on same-type migrations"
```

---

### Task 4: Customer notification — carried-over count + retired-card dialog

**Files:**

- Modify: `src/app/c/actions.ts` (`VendorJoinRow`, `checkStatusAction`)
- Modify: `src/app/c/status-state.ts` (`CardStatus`)
- Modify: `src/app/c/program-card-status.tsx` (new `AlertDialog`)
- Modify: `test/app/check-status-action.test.ts`

**Interfaces:**

- Consumes: `vendor_join`'s `replaced_by_stamp_count` (Task 1).
- Produces: `CardStatus.carriedOverCount: number | null` — consumed only
  by `ProgramCardStatus`'s new dialog within this task, no other consumer.

- [ ] **Step 1: Extend the failing test**

In `test/app/check-status-action.test.ts`, add after the existing
"surfaces the replacement program's name on a retired card" test:

```typescript
it("surfaces how many stamps carried over onto the replacement card", async () => {
  mockJoin([
    {
      program_id: "p1",
      name: "Old Program",
      type: "stamp",
      config: {},
      state: {},
      stamp_count: 5,
      card_token: "tok_1",
      reward_text: "Free item",
      stamps_required: 10,
      expiry_days: null,
      cycle_started_at: null,
      active: false,
      replaced_by_name: "Weekly Regular",
      replaced_by_stamp_count: 6,
    },
  ]);

  const result = await checkStatusAction(
    STATUS_IDLE,
    form({ vendor: "v1", phone: "91234567" }),
  );

  expect(result.cards?.[0].carriedOverCount).toBe(6);
});

it("reports no carried-over count when the replacement card has zero stamps (or none exists)", async () => {
  mockJoin([
    {
      program_id: "p1",
      name: "Old Program",
      type: "stamp",
      config: {},
      state: {},
      stamp_count: 5,
      card_token: "tok_1",
      reward_text: "Free item",
      stamps_required: 10,
      expiry_days: null,
      cycle_started_at: null,
      active: false,
      replaced_by_name: "Weekly Regular",
      replaced_by_stamp_count: 0,
    },
  ]);

  const result = await checkStatusAction(
    STATUS_IDLE,
    form({ vendor: "v1", phone: "91234567" }),
  );

  expect(result.cards?.[0].carriedOverCount).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm vitest run test/app/check-status-action.test.ts`
Expected: FAIL — `carriedOverCount` doesn't exist on `CardStatus` yet
(TypeScript will also flag the test file once `CardStatus` is checked, but
the test itself fails at the `toBe(6)`/`toBeNull()` assertion first since
the field is currently `undefined`).

- [ ] **Step 3: Add `carriedOverCount` to `CardStatus`**

In `src/app/c/status-state.ts`, add to `CardStatus`:

```typescript
export type CardStatus = {
  programId: string;
  name: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
  reward_text: string;
  qr: string;
  expired: boolean;
  active: boolean;
  replacedByName: string | null;
  carriedOverCount: number | null;
};
```

- [ ] **Step 4: Read the new column in `src/app/c/actions.ts`**

Add `replaced_by_stamp_count: number | null;` to `VendorJoinRow`'s type
(alongside the existing `replaced_by_name: string | null;`).

In the `cards` mapping inside `checkStatusAction`, add alongside the
existing `replacedByName: row.replaced_by_name ?? null,`:

```typescript
        carriedOverCount:
          row.replaced_by_stamp_count && row.replaced_by_stamp_count > 0
            ? row.replaced_by_stamp_count
            : null,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/check-status-action.test.ts`
Expected: PASS, all 11 tests (9 existing + 2 new).

- [ ] **Step 6: Add the retired-card notice dialog**

In `src/app/c/program-card-status.tsx`, add `useEffect` to the imports:

```typescript
import { useEffect, useState, useTransition } from "react";
```

Add state alongside the existing `regenOpen` state (after
`const [regenOpen, setRegenOpen] = useState(false);`):

```typescript
// Auto-opens once per retired card the first time this customer loads
// /c after a vendor migrates its type. "Seen" persists in localStorage,
// same no-server-round-trip trust model as regenerateCardAction's local
// UX elsewhere on this page — there's no customer auth to key a
// server-side "dismissed" flag off of.
const [noticeOpen, setNoticeOpen] = useState(false);

useEffect(() => {
  if (card.active || !card.replacedByName) return;
  const key = `loopkit:seen-replaced:${card.programId}`;
  if (!localStorage.getItem(key)) {
    setNoticeOpen(true);
  }
  // Only re-check when the identity of the retired card changes — not on
  // every render, and not keyed on active/replacedByName individually
  // since those don't change without programId also changing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [card.programId]);

function dismissNotice() {
  localStorage.setItem(`loopkit:seen-replaced:${card.programId}`, "1");
  setNoticeOpen(false);
}
```

Add the dialog markup immediately before the closing `</div>` of the
component's return (after the existing "Lost your code?" `AlertDialog`
block, still inside the outer `<div className="space-y-4 ...">`):

```tsx
{
  card.replacedByName && (
    <AlertDialog
      open={noticeOpen}
      onOpenChange={(open) => {
        if (!open) dismissNotice();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {card.name} has a new card: {card.replacedByName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your old rewards are still yours to redeem — show the shop this
            card. Next time you check in, you&apos;ll get the new card
            automatically.
            {card.carriedOverCount
              ? ` Your ${card.carriedOverCount} stamps carried over.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissNotice}>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

The existing small-text fallback line (`{!card.active && (...)}`, a few
lines above) stays exactly as-is — it remains the permanent,
non-dismissible surface for a customer who returns after already
dismissing the one-time dialog.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Per this repo's UI-change convention: in a browser, migrate a stamp
program with carryover ticked, have a test phone number check `/c`,
confirm the dialog auto-opens once, shows the carried-over count, and does
not reopen on a page refresh after dismissal (localStorage key set).

- [ ] **Step 9: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/c/actions.ts src/app/c/status-state.ts src/app/c/program-card-status.tsx test/app/check-status-action.test.ts
git commit -m "feat: tell a customer how many stamps carried over via a dismissible dialog"
```
