# Flame Club: Streak Club mechanic redesign

Date: 2026-07-15

## Problem

Streak Club's current mechanic (`src/lib/engine/streak.ts`) is period-window
based: a visit only advances the streak if it lands in the "grace" window
(one to two periods after the last visit); missing more than one full period
hard-resets the streak to 1. This is considered too difficult for vendors'
customers to realistically achieve, and the value of a strict
consecutive-period requirement is questionable versus a simpler accumulation
model. There is no live Streak Club data in production, so this is a clean
replacement, not a migration.

## Decision: reuse Stamp's engine, not a new mechanic

The desired mechanic — visits accumulate toward a reward, no decay, carries
over past the target — is already exactly Stamp's mechanic
(`src/lib/engine/stamp.ts`, uncapped accumulation + redeem-carryover per
migration 0022). Rather than build a new engine or duplicate Stamp's logic
into a rewritten `streak.ts`, Flame Club is a **visual variant of the Stamp
program type**, matching this codebase's existing wheel/scratch precedent
(`ChanceConfig.variant: "wheel" | "scratch"`, one shared strategy, two
picker tiles).

Consequence: **no database migration is needed.** `programs.type` stays
`"stamp"` for Flame Club cards; `config` is a jsonb blob with no fixed
schema at the DB layer, so a new `variant` field is purely additive at the
application layer. All existing SQL (`add_stamp`, `redeem`, `enroll_card`,
`create_program`) is unchanged and applies to Flame Club automatically —
including uncapped accumulation/carryover and the vendor-configurable
head-start percentage shipped in the previous feature.

## Decisions

- **No decay**: unlike Plant, growth never shrinks. Every visit adds one,
  same as Stamp today.
- **Naming**: the vendor-facing type is called "Flame Club" (not "Streak
  Club" — the mechanic no longer involves consecutive-period streaks, so
  keeping the old name would be misleading).
- **Stages**: 3 fixed, non-vendor-configurable stages, matching Plant's
  precedent of fixed stage names/thresholds (`buildPlantConfig` hardcodes 5
  stages regardless of the vendor's target count) — vendors only set the
  target visit count, never the stage thresholds themselves:
  - **Spark** — 0% of target
  - **Inner Flame** — 50% of target
  - **Full Blaze** — 100% of target (reward-ready)
- **Field reuse**: Flame Club reuses Stamp's existing `stamps_required`
  field (range 2–20, same quick-pick chips 5/10/15) and `reward_text` field
  verbatim — no new form fields. Label copy becomes "Visits for full blaze"
  instead of "Stamps required" when the flame variant is selected.
- **Old Streak Club removal**: full deletion of the old mechanic —
  application code (engine strategy, config builder, UI, tests) _and_ the
  database surface (the `programs_type_check` constraint's `'streak'`
  value, and `enroll_card`'s streak branch). No product has been onboarded
  yet (zero live vendors of any kind, not just zero Streak Club vendors),
  so this migration is exempt from the usual purely-additive/never-remove
  convention — there is no live-data risk to weigh against a fully clean
  removal, and this codebase's standing "no dead code" rule wins by
  default in the absence of that risk.

## A. `src/lib/engine/stamp.ts` — variant-aware progress

- `StampConfig` gains `variant?: "dots" | "flame"` (absent/`"dots"` =
  today's behavior, unchanged).
- `apply`/`redeem`/`defaults` are **unchanged** — the mechanic itself
  doesn't change, only how `progress()` describes it for rendering.
- `progress()` branches on `config.variant`:
  - `"dots"` (or absent): today's `{kind:"dots", filled, total}`, byte
    identical to current behavior.
  - `"flame"`: `{kind:"flame", filled, total, stage, stageName,
totalStages: 3}` where `stage`/`stageName` are computed via the same
    threshold-lookup shape Plant uses (`stageIndexFor`), against fixed
    thresholds `[0, round(stamps_required * 0.5), stamps_required]` and
    names `["Spark", "Inner Flame", "Full Blaze"]`.

## B. `src/lib/engine/types.ts` — new view kind

- The `View` union gains
  `{ kind: "flame"; filled: number; total: number; stage: number;
stageName: string; totalStages: number }` alongside the existing `dots`
  variant.

## C. New component: `src/components/flame-layers.tsx`

- Mirrors `StampDots`'s role: pure presentational, takes `{filled, total,
stage, stageName, className}`.
- Renders two layered flame shapes (inner fire, outer fire) using the same
  `lucide-react` `Flame` icon approach as the deleted `StreakFlame` —
  inner-fire layer scales/brightens from Spark→Inner Flame, outer-fire
  layer fades in from Inner Flame→Full Blaze. Below the icon, a label
  matching `StampDots`'s text style: `{stageName} — {filled}/{total}`.

## D. Wiring into existing render sites

Same 3 call sites every existing view kind already has a case in:

- `src/app/c/program-card-status.tsx` — new `view.kind === "flame"` branch
  rendering `<FlameLayers .../>`.
- `src/app/dashboard/serve-customer.tsx` — result panel's per-kind switch
  gains the same branch.
- `src/app/setup/preview-card.tsx` — the `/setup` live preview's view-kind
  switch gains the same branch (inside the existing `h-36` centered
  wrapper).

## E. `src/lib/program-config.ts` / `src/lib/program.ts` — save-path wiring

- `saveProgramSchema`'s stamp variant gains an optional
  `variant: z.enum(["dots", "flame"]).optional()`.
- `buildProgramFields`'s stamp branch's inline config object gains
  `variant: data.variant ?? "dots"`.
- No new column in `PROGRAM_COLUMNS` — `variant` lives entirely inside the
  existing `config` jsonb.

## F. `src/app/setup/setup-form.tsx` — Flame Club as a 7th tile

- `TYPE_OPTIONS` gains a `flame` entry ("Flame Club", "Build a flame with
  every visit", flame icon) alongside the existing 6.
- This is a **UI-only** discriminator, not a new `type` value: `pickType`
  for the `flame` tile sets `type` state to `"stamp"` and a new
  `variant` state to `"flame"`; the existing `stamp` tile sets `variant`
  to `"dots"`. A hidden mirror input `name="variant"` submits alongside
  the existing `stamps_required`/`reward_text` inputs.
- The `stamps_required` field's `<Label>` text becomes conditional:
  `variant === "flame" ? "Visits for full blaze" : "Stamps required"`.
  Quick-pick chips (5/10/15) and validation range (2–20) are unchanged and
  shared between both tiles.
- Head-start toggle: already conditioned on `type === "stamp" ||
type === "plant"` for the percent input (per the previous feature) — no
  change needed, Flame Club gets it for free since `type` is `"stamp"`.

## G. `src/app/setup/preview-state.ts` / `preview-animation.ts`

- `PreviewInput` gains `variant: "dots" | "flame"`, threaded into
  `buildPreviewProgram`'s stamp branch config.
- `buildInitialCard`'s head-start seeding is unchanged (still the stamp
  branch, keyed on `input.type === "stamp"`).
- The streak-specific clock-jump special case in the animation's tick
  effect (`periodDays * 1.5 * MS_PER_DAY`) is **deleted** — Flame Club
  ticks exactly like Stamp (a real visit every 3s tick), which is simpler
  than what it replaces and needs no special-casing.

## H. Deletions (old Streak Club, dead code)

- `src/lib/engine/streak.ts`, `test/lib/engine/streak.test.ts`
- `src/components/streak-flame.tsx`
- `buildStreakConfig` and `StreakConfig`/`StreakState` types from
  `program-config.ts` (or wherever they're re-exported)
- The `"streak"` switch-cases in `src/lib/engine/index.ts`
  (`resolveStreakConfig`/`resolveStreakState`/dispatch in `applyVisit`/
  `getProgress`)
- `streak` entries in `setup-form.tsx`'s `TYPE_LABELS`/`TYPE_OPTIONS`, and
  the `period_days`/`target_streak` field block + their controlled state
  (`periodDays`/`targetStreak`)
- The streak branch in `saveProgramSchema` (program.ts) and in
  `buildProgramFields`
- The streak branches in `preview-state.ts`'s `buildPreviewProgram`/
  `buildInitialCard`

## I. Migration `0025_loopkit_remove_streak_type.sql`

Zero live vendors of any kind exist yet, so this migration removes the old
type outright instead of leaving it dormant:

- `alter table loopkit.programs drop constraint programs_type_check;`
  followed by `add constraint programs_type_check check (type in
('stamp','lucky','plant','wheel','scratch'))` — drops `'streak'` from the
  allowed values (mirrors migration 0011's exact style, which added it).
- Recreate `enroll_card` (currently defined in migration 0024) with the
  `elsif v_program.type = 'streak' then ...` branch (lines 104–112 of 0024) deleted — the `if`/`elsif` chain for stamp/plant becomes a plain
  `if`/`else` with no third branch, matching how a two-way conditional
  looks anywhere else in this file.
- `create_program` is **not** recreated — nothing in its body references
  `'streak'` by name (the type value is just data it inserts, not a
  branch), so no change is needed there.
- New schema test `test/db/remove-streak-type-schema.test.ts`: asserts the
  migration's raw SQL text drops+recreates `programs_type_check` without
  `'streak'` in the allowed list, and that the recreated `enroll_card` no
  longer contains a `type = 'streak'` branch.

## Testing

- `test/lib/engine/stamp.test.ts`: new cases for `progress()` with
  `variant: "flame"` — stage boundaries at 0%, 50%, 100% of
  `stamps_required`, including a non-round `stamps_required` (odd number)
  to confirm the 50% threshold rounds sensibly. `apply`/`redeem` behavior
  confirmed unchanged (existing tests already cover this; no variant
  branching there).
- New `test/components/flame-layers.test.tsx` (or co-located
  `.dom.test.tsx` per this repo's convention): renders correctly at each
  of the 3 stages, label text matches `stageName — filled/total`.
- `test/app/preview-state.test.ts`: stamp branch gains a `variant: "flame"`
  case confirming it flows into the built program's config; existing
  streak tests deleted.
- `src/app/setup/setup-form.dom.test.tsx`: new Flame Club tile selection
  sets `type=stamp` + `variant=flame` in submitted FormData, label reads
  "Visits for full blaze"; existing streak-specific tests deleted.
- `test/lib/save-program-schema.test.ts` / `build-program-fields.test.ts`:
  stamp variant field accepted/defaulted; streak cases deleted.
- `test/db/remove-streak-type-schema.test.ts`: constraint no longer
  permits `'streak'`, `enroll_card` no longer branches on it.
- Full repo-wide grep for `streak`/`Streak` after deletion to confirm no
  orphaned references survive outside this spec/plan and historical
  ledger/docs, plus migration 0011/0014/0024's own text (kept, as
  historical record — migrations are never edited retroactively, only
  superseded by a later one).

## Out of scope

- New program types beyond Flame Club (points accumulation — still
  queued, scope not yet clarified; "fill the cup" — still queued, plant
  reskin).
- Any change to Stamp Card's own default (`variant: "dots"`) behavior or
  visual.
