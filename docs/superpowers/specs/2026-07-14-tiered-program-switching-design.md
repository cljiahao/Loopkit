# Tiered program switching (free prep + Pro scheduled cutover)

Date: 2026-07-14

## Problem

Switching a program's type today only happens through `changeTypeAction`
(`src/app/setup/actions.ts`): it deactivates the old program and creates
the new one in one atomic step, immediately. There is no way to prep a
replacement in advance while the current program stays live, and no way to
schedule a future switch — a vendor has to decide "now" and do everything
in one action.

User feedback: free-tier vendors should be able to create a second program
in advance (staying inactive/hidden) and flip the switch themselves when
ready — not forced into one atomic action. Pro-tier vendors, who already
face no active-program cap, should additionally be able to schedule a
future date on which an existing program automatically retires and hands
over to a designated successor.

Investigation found this splits cleanly along the existing tier boundary:
free tier genuinely needs a new "inactive draft" capability (it can never
have 2 active programs at once), while Pro can just create the new program
active immediately (it already has no cap) and only needs a way to
schedule the _old_ program's future retirement. No cron infrastructure
exists anywhere in the Merqo stack (loopkit/qkit/merqo all ship a bare
`vercel.json`, no `crons` key) — the scheduled cutover is a lazy
check-on-page-load, the same pattern already used for card expiry
(`isCardExpired`).

## Decisions (from brainstorming)

- Free tier: a vendor with 1 active program gets a new "Prep a replacement
  card" entry point that creates a second program with `active=false`
  (hidden from customers — `enroll_card` already gates on `active`, so an
  inactive program can't be enrolled into). A new `activate_program` RPC
  lets the vendor flip it live later: deactivates whichever program(s) are
  currently active, points their `replaced_by` at the newly-activated one,
  and reuses the existing `carry_over_stamps` mechanism from
  `changeTypeAction` (same underlying operation, just decoupled into
  "create" then "activate" instead of one atomic step).
- Free-tier cap: at most 2 _live-in-play_ programs (`replaced_by is null`)
  at once. Already-retired/superseded programs don't count toward this —
  a vendor can prep-and-switch indefinitely over their program's lifetime,
  just never more than "1 active + 1 prepped" simultaneously. No delete/
  archive feature is needed for this to work.
- Pro tier: creating a new program stays exactly as it is today — active
  immediately, no cap, can coexist with other active programs. New:
  a "Schedule retirement" action on an _existing_ active program picks a
  future date and one of the vendor's other active programs as the
  successor, setting `replaced_by` immediately and a new
  `scheduled_deactivate_at timestamptz` column.
- The scheduled cutover triggers lazily: at the top of `/dashboard` and
  `/setup` page loads, any of the vendor's active programs with
  `scheduled_deactivate_at <= now()` get deactivated via a plain
  RLS-scoped update (the existing `programs_own` policy already grants
  vendors update rights on their own rows — no new RPC needed for this
  step). The switch takes effect next time the vendor (or anyone hitting
  those pages) loads them, not at the exact scheduled minute — acceptable
  for a small-business admin panel, matching `isCardExpired`'s existing
  precedent.
- No delete/archive feature — out of scope for this spec.

## A. Schema

New migration, additive only:

```sql
alter table loopkit.programs
  add column scheduled_deactivate_at timestamptz;
```

`replaced_by` (existing, from `0016_loopkit_program_replacement.sql`) is
reused for both flows: free tier sets it at activation time (as
`changeTypeAction` already does today), Pro sets it at scheduling time
(before the cutover happens).

## B. `create_program` — optional `p_active`

Add a trailing, defaulted parameter so every existing caller
(`saveProgramAction`, `changeTypeAction`) is unaffected:

```sql
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false,
  p_active            boolean default true
)
```

The free-tier cap check moves from "count of active programs < 1" (today,
still used for a vendor's very first program) to "count of `replaced_by is
null` programs < 2" when the new program will be created inactive (the
prep flow). The Pro/free active-program cap (`maxActivePrograms`) is
otherwise unchanged — Pro still has no limit, and free tier still can
never directly create a _second active_ program (it must go through
`activate_program` to make a prepped one live).

## C. `activate_program` (new RPC, free-tier prep flow)

```sql
create or replace function loopkit.activate_program(p_program uuid)
returns loopkit.programs
language plpgsql security definer set search_path = '' as $$
declare
  v_program loopkit.programs;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  update loopkit.programs
    set replaced_by = p_program
    where vendor_id = (select vendor_id from loopkit.programs where id = p_program)
      and active and id <> p_program;

  update loopkit.programs set active = false
    where vendor_id = (select vendor_id from loopkit.programs where id = p_program)
      and active and id <> p_program;

  update loopkit.programs set active = true
    where id = p_program
    returning * into v_program;

  return v_program;
end;
$$;
```

(Exact SQL will be finalized during planning — this establishes the shape:
owns_program-gated, deactivates every other currently-active program owned
by the same vendor, links them via `replaced_by`, activates the target.)

## D. `schedule_retirement` (new RPC, Pro cutover flow)

Pro-gated (checks `vendor_pro`, same as other Pro-only actions),
owns_program on both the program being retired and its chosen successor:

```sql
create or replace function loopkit.schedule_retirement(
  p_program   uuid,
  p_successor uuid,
  p_date      timestamptz
)
returns loopkit.programs
language plpgsql security definer set search_path = '' as $$
declare v_program loopkit.programs;
begin
  if not loopkit.owns_program(p_program) or not loopkit.owns_program(p_successor) then
    raise exception 'not authorized';
  end if;
  if not loopkit.is_pro((select vendor_id from loopkit.programs where id = p_program)) then
    raise exception 'pro required';
  end if;

  update loopkit.programs
    set replaced_by = p_successor,
        scheduled_deactivate_at = p_date
    where id = p_program
    returning * into v_program;

  return v_program;
end;
$$;
```

## E. Lazy cutover check

A small server-side helper, called at the top of `/dashboard` and
`/setup`'s page components (both already call `requireVendor()` and
`listPrograms()`):

```ts
// src/lib/program.ts (new function)
export async function applyDueCutovers(): Promise<void> {
  const supabase = await createServerClient();
  await supabase
    .from("programs")
    .update({ active: false })
    .lte("scheduled_deactivate_at", new Date().toISOString())
    .eq("active", true);
}
```

RLS (`programs_own`) already scopes this to the signed-in vendor's own
rows — no vendor_id filter needed, matching every other query in
`src/lib/program.ts`.

## F. UI

- `/setup`: a free-tier vendor with exactly 1 live-in-play program sees a
  new "Prep a replacement card" entry point (same create form, submits
  with `active=false`). A prepped (inactive, unreplaced) program's edit
  page shows an "Activate this card" button.
- `/setup`: a Pro-tier vendor's active program edit page shows a "Schedule
  retirement" control — pick a future date and one of the vendor's other
  active programs as the successor.
- No new page. Both flows extend the existing `/setup` create/edit
  surfaces.

## G. Testing

- Pure cap-math functions (extending `src/lib/program.ts`'s existing
  `canCreateProgram`/`getEntitlement` pattern) get unit tests in
  `test/lib/program.test.ts`.
- `applyDueCutovers` and the two new RPCs get careful hand-review — same
  no-automated-DB-test convention as every migration this session
  (hand-applied via the Supabase dashboard SQL Editor, no linked CLI).
- UI additions get co-located `*.dom.test.tsx` coverage, matching this
  session's established pattern.

## Out of scope

- Any delete/archive feature for retired programs.
- A real cron job (Vercel Cron or otherwise) — the lazy check-on-page-load
  is the chosen mechanism; revisit only if page-load-triggered timing
  proves insufficient in practice.
- Feature B (stats/activity/customers program-switcher, navbar dashboard
  link + left-alignment, `/setup` back button, `/plan` table layout, the
  Sprout Corner stats-sentence header) — a separate, already-queued batch
  of unrelated UI feedback, brainstormed and built after this spec ships.
