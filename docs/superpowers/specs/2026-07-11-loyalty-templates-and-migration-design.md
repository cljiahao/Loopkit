# Loyalty templates + program type migration

Date: 2026-07-11

## Problem

`/setup` today makes a vendor pick a raw engine type (Stamp/Lucky
Tap/Sprout/Wheel/Scratch/Streak) and hand-configure every knob from
scratch. There's no curated starting point for "I run a cafe" or "I run a
salon." And once a program is created, its `type` is permanently locked
(`src/app/setup/actions.ts:34-39` — deliberately: switching type in place
would reinterpret every existing card's `state` blob and corrupt
progress). A vendor who picks the wrong mechanic, or whose business needs
change, has no path forward except abandoning loopkit's structure entirely.

Real-world precedent (Loopy Loyalty, the closest analogue — digital stamp
cards for small vendors) confirms in-place type/stamp-count changes are
deliberately unsupported for the same reason, and its own documented
guidance for vendors who need to change is: let existing customers finish
their current card, notify them a new card now exists, and enroll them in
it going forward. That's the shape this spec builds toward, made native to
loopkit instead of a manual vendor workaround.

This spec covers two features that share one data-model decision:

1. **Templates** — curated presets at `/setup`, on top of the existing
   type/config system.
2. **Migration** — a vendor-initiated "change type" flow: retire the old
   program, stand up a new one, tell affected customers.

## Decision: join-QR model stays as-is

Out of scope, decided separately and already shipped: the vendor-level
join QR (`/c?v=<vendor_id>`, one QR per shop, auto-enrolls into every
active program) stays exactly as it is. No per-program join QR, no
separate customer-stamping QR system. Both features below are designed
against that fixed foundation — a vendor can run several active programs
at once (Pro tier) or exactly one (Free tier), and customers always join
through the one vendor-level QR regardless of how many programs exist.

## What does NOT change

- `cards`/`stamp_events` schema, all engine `Strategy` code
  (`src/lib/engine/*`), `enroll_card`/`record_visit`/`redeem`/
  `regenerate_card` RPCs.
- A program's `type` is still immutable after creation — migration works
  by retiring the old program and creating a new one, never by mutating
  `type` on an existing row.
- The vendor-level join QR / `vendor_active_programs` RPC.
- The Counter/Customers/Activity/Stats dashboard pages' existing `?p=`
  program scoping.

## What changes

### A. Data model — `supabase/migrations/0016_loopkit_program_replacement.sql`

One additive column, plus a fix to `create_program`'s plan-cap count and
an extension of `vendor_join`'s read to surface the replacement's name.

```sql
alter table loopkit.programs
  add column replaced_by uuid references loopkit.programs(id);

-- Plan cap: free tier is "1 ACTIVE program", not "1 program ever". Without
-- this fix, deactivating a program to migrate its type would permanently
-- use up a free vendor's only program slot — they could never create the
-- replacement. Migration flow always deactivates the old program before
-- creating the new one (Section C), so by the time create_program runs,
-- the count below is already back to 0 for a single-program free vendor.
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
    or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
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

-- vendor_join: surface the replacement program's name for a retired card, so
-- the customer's card page can say what to use instead of a bare "retired"
-- notice. Only the projection changes — enrollment/dedup logic is untouched.
create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text
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
           r.name
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

`src/lib/types.ts`: `vendor_join`'s `Returns` entry gains `replaced_by_name:
string | null`. `Program` (`src/lib/program.ts:11-21`) gains `replaced_by:
string | null`, and `PROGRAM_COLUMNS` gains `replaced_by`.

`canCreateProgram` (`src/lib/program.ts:231-233`) keeps its signature —
`(count: number, pro: boolean)` — but every call site passes an
active-only count instead of the raw list length:

- `src/app/setup/page.tsx:30`: `canCreateProgram(programs.filter((p) => p.active).length, pro)`
- `src/app/setup/actions.ts:142`: same change, using the `programs` it
  already loaded.

### B. Templates — `src/lib/templates.ts` (new)

`ProgramType` (today: defined locally inside `setup-form.tsx` as `type
ProgramType = "stamp" | "lucky" | "plant" | "wheel" | "scratch" |
"streak"`) moves to `src/lib/program.ts` as an exported type, since
`templates.ts` needs it too and a type used by two modules belongs in the
shared one, not redefined in each. `setup-form.tsx` imports it instead of
declaring its own copy.

```typescript
import type { ProgramType } from "@/lib/program";

export type Template = {
  key: string;
  label: string;
  description: string;
  type: ProgramType;
  defaults: {
    name: string;
    reward_text: string;
    stamps_required?: number;
    visits_to_bloom?: number;
    win_percent?: number;
    pity_ceiling?: number;
    period_days?: number;
    target_streak?: number;
  };
};

// Curated presets — each just prefills the existing SetupForm fields for a
// given engine type; nothing here is persisted. A vendor can edit any field
// before saving, same as picking the type manually always allowed.
export const TEMPLATES: Template[] = [
  {
    key: "cafe-regulars",
    label: "Cafe Regulars",
    type: "stamp",
    description: "10 visits, free coffee",
    defaults: {
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free coffee",
    },
  },
  {
    key: "bakery-loaf-club",
    label: "Bakery Loaf Club",
    type: "stamp",
    description: "8 visits, free loaf",
    defaults: {
      name: "Loaf club",
      stamps_required: 8,
      reward_text: "Free loaf of bread",
    },
  },
  {
    key: "salon-vip",
    label: "Salon VIP",
    type: "stamp",
    description: "6 visits, free treatment",
    defaults: {
      name: "Salon VIP card",
      stamps_required: 6,
      reward_text: "Free treatment",
    },
  },
  {
    key: "weekly-regular",
    label: "Weekly Regular",
    type: "streak",
    description: "Visit weekly, reward after a 4-week streak",
    defaults: {
      name: "Weekly regular",
      period_days: 7,
      target_streak: 4,
      reward_text: "Free item",
    },
  },
  {
    key: "grow-a-kopi",
    label: "Grow-a-Kopi",
    type: "plant",
    description: "6 visits to bloom",
    defaults: {
      name: "Grow-a-kopi",
      visits_to_bloom: 6,
      reward_text: "Free kopi",
    },
  },
  {
    key: "lucky-tap",
    label: "Lucky Tap",
    type: "lucky",
    description: "20% win chance every visit",
    defaults: {
      name: "Lucky tap",
      win_percent: 20,
      pity_ceiling: 8,
      reward_text: "Free item",
    },
  },
  {
    key: "spin-the-wheel",
    label: "Spin the Wheel",
    type: "wheel",
    description: "Spin for a prize on every visit",
    defaults: { name: "Spin to win", reward_text: "Free item" },
  },
  {
    key: "scratch-and-win",
    label: "Scratch & Win",
    type: "scratch",
    description: "Scratch for a prize on every visit",
    defaults: { name: "Scratch & win", reward_text: "Free item" },
  },
];
```

`src/app/setup/setup-form.tsx`'s create-mode picker (today: a 6-button
type grid, lines 96-121) becomes a template grid: one tile per
`TEMPLATES` entry (label + description) plus a trailing **"Custom"** tile.
Picking a template tile sets `type` to that template's `type` and seeds
every default into the form's existing `useState` fields (same fields
`isEdit` already prefills from `program`, just sourced from
`template.defaults` instead). Picking "Custom" reveals today's raw
type-grid + blank config, unchanged. Every field stays editable after
either path — a template is a starting point, not a constraint. `isEdit`
mode (editing an already-created program) is untouched — no template
picker there, matching today's locked-type edit view.

### C. Migration — "Change type" flow

**Entry point:** `/setup`'s program list (`src/app/setup/page.tsx:61-88`)
gains a third link per row, next to Edit/Manage: **"Change type"**,
`href="/setup?migrate=<id>"`. The list also gains an Active/Inactive badge
per row (today shows no status at all) — needed once retired programs can
exist and a vendor needs to tell them apart from live ones.

**Confirmation + picker page:** `/setup?migrate=<id>` renders:

```
Change [Program Name]'s type

Your current card stops collecting new stamps. Customers who already
have it keep it and can still redeem what they've earned — they just
won't see it as something to keep working toward. Everyone gets moved
onto the new card automatically next time they check their rewards.

[same template grid + Custom fallback + config fields as Section B,
 with a Cancel link back to /setup]

[Change type] (submit button)
```

This reuses `SetupForm`'s template/config UI verbatim (a `replacingId`
prop switches its submit target and copy; it is never combined with
`isEdit`), with a hidden `replacing=<id>` field.

**Server action** — `changeTypeAction` (new, `src/app/setup/actions.ts`):

```typescript
export async function changeTypeAction(
  _prev: SaveProgramState,
  formData: FormData,
): Promise<SaveProgramState> {
  await requireVendor();

  const replacingId = String(formData.get("replacing") ?? "").trim();
  const existing = replacingId ? await getProgramById(replacingId) : null;
  if (!existing) return { error: "Couldn't find that card." };

  const parsed = saveProgramSchema.safeParse({
    type: formData.get("type"),
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
  });
  if (!parsed.success) {
    return { error: "Check the card details and try again." };
  }

  const { type, stampsRequired, config, headStart } = buildProgramFields(
    parsed.data,
  ); // extracted from saveProgramAction's existing if/else chain — shared,
  // not duplicated (Section E notes the refactor this requires).

  const supabase = await createServerClient();

  // 1. Deactivate the old program FIRST — the free-tier gate on
  // create_program counts only active programs (Section A), so this must
  // happen before step 2 or a free vendor's only program slot stays "used."
  const { error: deactivateError } = await supabase
    .from("programs")
    .update({ active: false })
    .eq("id", replacingId);
  if (deactivateError)
    return { error: "Couldn't change your card. Try again." };

  // 2. Create the new program.
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
    },
  );
  if (createError || !created) {
    // Old program is already deactivated with no replacement yet. Not a data
    // loss — the vendor can retry from /setup, and the free-tier gate is now
    // open (active count is back to 0) so a retry will succeed. No saga/
    // rollback machinery: consistent with this codebase's existing
    // non-transactional RPC-sequencing pattern (e.g. vendor_join's per-
    // program enroll loop).
    return { error: "Couldn't create the new card. Try again from Setup." };
  }

  // 3. Link old -> new so vendor_join can tell affected customers.
  await supabase
    .from("programs")
    .update({ replaced_by: created })
    .eq("id", replacingId);
  // Best-effort: if this update fails, the retired card just shows the
  // generic message instead of naming the replacement (Section D) — cosmetic,
  // not blocking.

  revalidatePath("/setup");
  redirect(`/dashboard?p=${created}`);
}
```

### D. Customer-facing messaging — `src/app/c/program-card-status.tsx`

The existing inactive-card note (today: a flat "no longer joinable" line)
becomes conditional on the new `replacedByName` field on `CardStatus`:

```tsx
{
  !card.active && (
    <p className="text-xs text-muted-foreground">
      {card.replacedByName
        ? `This card is retired — check your rewards again to see your new ${card.replacedByName} card.`
        : "This program is no longer joinable, but you can still redeem what you've earned."}
    </p>
  );
}
```

`CardStatus` (`src/app/c/status-state.ts`) gains `replacedByName: string |
null`; `checkStatusAction` (`src/app/c/actions.ts`) reads
`row.replaced_by_name` off the extended `vendor_join` row (Section A) onto
that field. `VendorJoinRow`'s type gains the same field.

### E. Shared config-building refactor

`saveProgramAction`'s type→`{type, stampsRequired, config, headStart}`
if/else chain (`src/app/setup/actions.ts:66-114`) is extracted into a pure
function `buildProgramFields(data: SaveProgramInput)` in
`src/lib/program.ts`, used by both `saveProgramAction` and the new
`changeTypeAction`. This is a refactor of existing logic, not new
behavior — without it, the type-building chain would be duplicated
verbatim across two server actions.

## Testing

- `test/db/program-replacement-schema.test.ts` (new) — regex-match
  `0016_loopkit_program_replacement.sql`: the `replaced_by` column, the
  `and active` clause added to `create_program`'s count, and
  `vendor_join`'s new `replaced_by_name` projection + left join.
- `test/app/change-type-action.test.ts` (new) — mocks Supabase
  `update`/`rpc`; covers: unknown/unowned `replacing` id rejected without
  writes, happy path issues the deactivate→create→link sequence in order,
  a `create_program` failure leaves the old program deactivated and
  returns an error without linking, a `replaced_by` update failure still
  redirects successfully (best-effort, non-blocking).
- `test/app/check-status-action.test.ts` — extend with a case asserting
  `replacedByName` flows from `vendor_join`'s `replaced_by_name` column
  onto `CardStatus`.
- `test/lib/program.test.ts` — extend `canCreateProgram` call-site tests
  (or add one) confirming active-only counting once call sites change;
  `buildProgramFields` gets its own unit tests (one per engine type,
  mirroring today's inline logic).
- `test/lib/templates.test.ts` (new) — every `TEMPLATES` entry's `type`
  matches a real engine type and its `defaults` satisfy that type's
  branch of `saveProgramSchema` (catches a template/schema drift at test
  time rather than at first vendor use).

## Out of scope

- No DB-backed template catalog (admin-editable without a deploy) — no
  current need; `TEMPLATES` is a static module like today's `typeLabels`.
- No `template_key` persisted on `programs` — templates only prefill
  fields, a program never remembers which template (if any) it started
  from.
- No automatic notification (SMS/push) to customers when a program is
  retired — the message is surface-level, shown next time the customer
  opens their `/c` page themselves, same delivery model as every other
  status change in this app today.
- No transactional/saga rollback for the deactivate→create→link sequence
  — consistent with this codebase's existing non-transactional RPC
  patterns; failure modes are recoverable by retrying from `/setup`, not
  data-destructive.
- Customer auth model (Google vs. phone) and dashboard nav polish — separate
  specs, sequenced after this one.
