# Program Edit Safety + Reward Expiry Default

**Status:** Approved 2026-09-09
**Depends on:** the 2026-09-08 vendor-dashboard redesign (all 5 sub-plans merged, main 2b5be04)

## Problem

Two gaps left after the dashboard redesign:

1. **Silent progress-affecting edits.** A vendor opens `/setup?edit=<id>` on a
   live program, changes `stamps_required` from 8 to 10 (or rewrites
   `reward_text`), hits "Save changes", and it saves with no warning. A
   customer sitting at 7/8 stamps now sees 7/10. The vendor never saw that
   coming. `src/app/setup/setup-form.tsx` submits straight to
   `saveProgramAction` -> `updateExistingProgram` (a direct PostgREST
   `.update()`).

2. **Earned rewards never expire by default.** `grant_reward_voucher`
   (migration 0027) and the redeem path (0043) set `expires_at = null` unless
   the program has a non-null `reward_expiry_days`. The setup form leaves the
   field blank by default, so in practice every reward is granted with no
   expiry. Unbounded liability for the vendor. The 2026-09-08 spec resolved
   "90 days default" but no code landed for it.

Not in scope: `programs.archived_at` and a "Replace this program" flow. Both
already exist. `programs` has `active`, `replaced_by`, `scheduled_deactivate_at`;
`setup/page.tsx` renders "Change type" (`?migrate=`), "Prep replacement",
"Activate", "Schedule retirement"; `replaceProgramAction` links old -> new via
`replaced_by`; `card-check` surfaces `replaced_by_name` /
`replaced_by_stamp_count` to customers on retired cards. Archived =
`active=false, replaced_by=null`, with its own setup UI.

## Global Constraints

- Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui (new-york),
  Supabase `@supabase/ssr` with RLS. Vitest. pnpm 11. Node >= 24.
- No em dashes in user-facing copy or code comments. Period, comma, colon, or
  parens, or two sentences.
- Near-zero new code comments. One line max where a comment earns its place.
- Every changed folder needs its `README.md` updated in the same diff.
  `CHANGELOG.md` gets an entry; a `^src/` change also updates the root
  `README.md` running-narrative sentence.
- Migrations: latest applied is `0045`. This spec adds `0046`.
- Prefer shadcn components over hand-rolled markup.
- Run `pnpm build` before shipping (client/server bundle-boundary errors that
  `pnpm check` and `pnpm test` miss).
- Phase 1 stays ungated. No `isPro()` gating added by this work.

## Part 1: Edit-impact confirmation dialog

### Trigger

The dialog appears only when **all** of these hold:

- The form is in edit mode (`isEdit === true`, `program` is non-null).
- The pending change is **progress-affecting** (see below).
- The program has at least one active card.

Any other case (new program, prep, change-type, non-progress edit, or zero
active cards) submits straight through with no dialog, exactly as today.

### "Progress-affecting"

A pure comparison of the submitted form values against the loaded `program`:

- `stamps_required` changed, OR
- `reward_text` changed (trimmed compare), OR
- a mechanic knob that moves the goal changed: for `lucky` the win
  probability, for `plant`/`wheel`/`scratch` the visits-to-bloom / segment
  weights. Compare the built `config` object's relevant fields, not the whole
  object (avoids false positives from key ordering or unrelated fields).

`name`, `reward_cost_dollars`, `expiry_days`, `reward_expiry_days`,
`head_start*`, `birthday_bonus_enabled` are **not** progress-affecting.

### Dialog contents

shadcn `AlertDialog`. Title: "Save this change?". Body is one short intro line
plus one line per relevant impact:

- Intro: "N customers have a card on this program." (N = active card count)
- If `stamps_required` changed: "They keep the stamps they have. The goal
  moves from {old} to {new}." When {new} < {old}: "They keep the stamps they
  have. The goal drops from {old} to {new}, so some may already have earned a
  reward." (the RPCs handle overflow on next visit; this is just honest
  framing)
- If `reward_text` changed: "Rewards already earned keep the current wording.
  New rewards will read \"{new}\"."
- If a mechanic knob changed: "The odds change for every card from the next
  visit on."

Actions: "Save changes" (proceeds) and "Cancel" (closes, no submit).

### Wiring

- `src/lib/program-edit-impact.ts` (new, pure, no I/O):
  - `type EditImpactLine = string`
  - `isProgressAffecting(before: ProgramSnapshot, after: ProgramSnapshot): boolean`
  - `describeEditImpact(before: ProgramSnapshot, after: ProgramSnapshot, activeCardCount: number): EditImpactLine[]`
  - `ProgramSnapshot = { stamps_required: number; reward_text: string; type: string; config: unknown }`
- `src/app/setup/edit-impact-dialog.tsx` (new, `"use client"`): wraps the
  submit button. Props: `disabled`, `pending`, `impactLines: string[] | null`,
  `children` (the button label node). When `impactLines` is null or empty,
  renders the plain submit button. Otherwise renders a button that opens the
  `AlertDialog`; the dialog's confirm calls the form's `requestSubmit()`.
- `src/app/setup/setup-form.tsx`:
  - Track the current form values needed for the comparison in component
    state (already partly tracked: `type`, segments, etc). Derive
    `afterSnapshot` from them plus the controlled inputs; `beforeSnapshot`
    from `program`.
  - Compute `impactLines` client-side each render when `isEdit` and
    `activeCardCount > 0` and `isProgressAffecting`, else null.
  - Replace the bare submit `<Button type="submit">` (line ~1400) with
    `<EditImpactDialog impactLines={impactLines} .../>` for the edit case.
    Non-edit cases keep the current button unchanged.
  - New prop `activeCardCount?: number` (default 0).
- `src/lib/cards.ts`: add
  `programActiveCardCount(programId: string): Promise<number>` returning the
  count of `cards` rows for that program with `status = 'active'`. Reuses the
  `createServerClient` pattern already in the file. (Distinct from
  `activeCardCountsByProgram`, which is a 30-day-touched count for the Counter
  default; the dialog wants "has a card at all".)
- `src/app/setup/page.tsx`: when `editing` is non-null, call
  `programActiveCardCount(editing.id)` and pass it to `<SetupForm>`. Both
  `<SetupForm>` call sites (lines 266, 283): the edit render passes the real
  count, the other passes nothing (defaults 0).

### Server side

**No change.** The dialog is a client-side gate only. `saveProgramAction` /
`updateExistingProgram` stay as they are. A vendor with JavaScript disabled
submits as today (acceptable: the redesign already assumes a JS client, and
this is a confirmation nicety, not a security control).

### Testing

- `test/lib/program-edit-impact.test.ts`:
  - `isProgressAffecting`: true on `stamps_required` change, `reward_text`
    change (and trimmed-equal returns false), lucky `win_probability` change;
    false on `name`-only, `reward_cost` -only, expiry-only, identical
    snapshots.
  - `describeEditImpact`: the intro line uses the passed count; the
    `stamps_required` up vs down wording; the `reward_text` line quotes the
    new text; multiple simultaneous changes produce multiple lines in a
    stable order (intro, stamps, reward, mechanic).
- `src/app/setup/edit-impact-dialog.dom.test.tsx`:
  - null `impactLines` -> renders a plain submit button, no dialog role in
    the tree.
  - non-empty -> clicking the button opens an `alertdialog`; it shows every
    line; "Cancel" closes without submitting; "Save changes" triggers form
    submission (assert via a spied `requestSubmit` or a form `onSubmit`).
- `src/app/setup/setup-form.dom.test.tsx`: add a block. Render in edit mode
  with `activeCardCount={3}` and a `program` at `stamps_required: 8`. Change
  the stamps input to `10`, click save, assert the dialog appears with "3
  customers". Change only the program `name`, click save, assert no dialog
  (submits straight through). Note the existing flakiness caveat in that file
  (userEvent under coverage instrumentation): keep new interactions minimal
  and prefer `fireEvent` where the existing block does.

## Part 2: Reward expiry default of 90 days

### Behavior

- `reward_expiry_days` semantics after this change:
  - a positive integer: earned rewards expire that many days after being
    granted (unchanged)
  - `null`: earned rewards never expire (unchanged meaning, but now only
    reached by the vendor deliberately clearing the field)
- The setup form pre-fills `reward_expiry_days` with `90` for a **new** stamp
  program. For an existing program the field shows the program's current
  value (`program.reward_expiry_days ?? ""`), unchanged from today.
- `create_program` RPC default for `p_reward_expiry_days` becomes `90` (was
  `null`), as defense in depth for any caller that omits the argument. The
  form always sends the field explicitly, so this mainly matters for
  completeness and future callers.
- **No backfill.** Existing programs with `reward_expiry_days = null` keep
  "never expires". Seed data only, zero real vendors
  (project_merqo_no_vendors_yet_breaking_changes_ok).
- **No change to `grant_reward_voucher` or the redeem path.** They already do
  the right thing: `null` -> `null`, `N` -> `now() + N days`.

### Migration 0046

`supabase/migrations/0046_loopkit_reward_expiry_default.sql`:

- `create or replace function loopkit.create_program(...)` with the identical
  signature and body from 0027 except `p_reward_expiry_days int default 90`.
- Re-issue the existing `grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int, int)
  to authenticated;` (signature unchanged, but `create or replace` keeps the
  grant anyway; include it for clarity, matching prior migrations' style).
- A comment line at the top: what changed and why (one line).

### Form change

`src/app/setup/setup-form.tsx`, the `reward_expiry_days` field (~line 1330):

- `defaultValue`: `isEdit ? (program?.reward_expiry_days ?? "") : 90`. Keep the
  `replacingId`/`prepping` cases pre-filled with `90` too (they are new
  programs).
- Helper text under the field: replace "Leave blank so an earned reward never
  expires." with "Pre-filled to 90 days. Clear the box if you want earned
  rewards to never expire."

### Testing

- `test/db/reward-expiry-default.test.ts` (static SQL string-match, same
  pattern as `test/db/reward-cost-schema.test.ts`): the 0046 file contains
  `create or replace function loopkit.create_program`, contains
  `p_reward_expiry_days int default 90`, and does **not** contain any
  `update loopkit.programs set reward_expiry_days` (guards against an
  accidental backfill).
- `src/app/setup/setup-form.dom.test.tsx`: a new program renders the
  `reward_expiry_days` input with value `90`; editing a program whose
  `reward_expiry_days` is `null` renders it blank.
- pgTAP: not required. The RLS surface is unchanged; `create_program` is
  `security definer` and its auth checks are covered by the existing
  `test/db` pgTAP for 0023/0027. If the db check's harness diffs function
  bodies, the string-match test above plus a green `db` CI run is sufficient.

## File-change summary

Create:
- `docs/superpowers/specs/2026-09-09-program-edit-safety-design.md` (this file)
- `docs/superpowers/plans/2026-09-09-*.md` (from writing-plans)
- `src/lib/program-edit-impact.ts` + `test/lib/program-edit-impact.test.ts`
- `src/app/setup/edit-impact-dialog.tsx` + `src/app/setup/edit-impact-dialog.dom.test.tsx`
- `supabase/migrations/0046_loopkit_reward_expiry_default.sql`
- `test/db/reward-expiry-default.test.ts`

Modify:
- `src/app/setup/setup-form.tsx` (dialog wiring, expiry field default + copy)
- `src/app/setup/page.tsx` (pass `activeCardCount` to the edit `<SetupForm>`)
- `src/lib/cards.ts` (`programActiveCardCount`)
- `src/app/setup/setup-form.dom.test.tsx` (two new blocks)
- READMEs: `src/lib/`, `src/app/setup/`, `test/lib/`, `test/db/`,
  `supabase/migrations/`, root; `CHANGELOG.md`

## Rollout

Feature-branch PR into `main`. Merge on core CI green (`check + unit`,
`build`, `db`, `e2e`), consistent with the dashboard-redesign run. Apply
`0046` to prod after merge (`/supabase-migrate` or manual), then regenerate
`src/lib/types.ts` if the generator picks up the changed function default
(it should not: function defaults are not in the generated types, so likely
no `types.ts` change).
