# Points Club: configurable per-visit amount, Stamp variant

Date: 2026-07-15

## Problem

Every current program type earns exactly one unit per visit — one stamp,
one spin, one growth tick. A vendor may want a traditional points program
where each visit earns a vendor-set amount greater than one (e.g. "10
points per visit"), accumulating toward a single reward threshold. No
current type supports a per-visit amount other than a fixed +1.

## Investigation

- `EngineEvent`'s `payload` field exists but is never used for a variable
  quantity anywhere in the engine — lucky/chance read `payload.roll` (a
  0–1 float for probability), nothing reads an amount. Every strategy's
  `apply()` increments by a fixed, program-config-level constant.
- **Real production stamp increments happen in Postgres, not the TS
  engine.** `loopkit.add_stamp` (migration 0022) hardcodes
  `stamp_count = stamp_count + 1` with no config lookup at all. The TS
  `stampStrategy.apply()` (`src/lib/engine/stamp.ts`) is only exercised by
  the `/setup` live preview simulation, never by a real customer scan —
  this is why Flame Club/Fill the Cup never needed a migration: they kept
  the +1 mechanic exactly, only changing what was displayed. Points
  cannot avoid this: to actually award more than one point per visit in
  production, `add_stamp` itself must change.
- `qkit_earn`'s order-webhook auto-award path (`src/app/earn/actions.ts`)
  is hardcoded to a flat `+1` and explicitly restricted to
  `program_type === "stamp"` in a comment ("MVP scope"). No vendor-facing
  points-per-dollar config exists anywhere in that flow, and changing it
  is out of scope here (see Out of scope).

## Decisions

- **Fixed amount per visit** (vendor-configured constant, e.g. "10 points
  per visit"), not a variable amount tied to purchase value or manual
  entry — confirmed via brainstorm; this is architecturally Stamp's exact
  mechanic with a configurable per-visit increment instead of an implicit 1.
- **Redemption**: single threshold, like Stamp — one target point count,
  one reward, uncapped accumulation with carryover past the target
  (reuses Stamp's existing carryover/redeem semantics exactly, no new
  redemption logic).
- **Reuses Stamp's engine and type**: `type: "stamp"` + a new
  `variant: "points"` (alongside the existing `"dots"`/`"flame"`
  variants) — never a new `ProgramType`, following the established
  pattern from Flame Club/Fill the Cup.
- **The one real migration**: `add_stamp` is recreated to read
  `coalesce((v_program.config->>'points_per_visit')::int, 1)` and
  increment `stamp_count` by that amount instead of a hardcoded `1`. This
  is additive/backward-compatible — any program without
  `points_per_visit` in its config (i.e. every existing Stamp/Flame Club
  program) falls back to `1`, identical to today's behavior.
- **Visual**: number + horizontal progress bar (e.g. "740 / 1,000
  points"), not a dots grid — point totals can run into the hundreds or
  thousands where dots don't scale. This turns out to be the simplest
  case of the three Stamp/Plant reskins so far: a progress bar needs
  exactly `{filled, total}`, which is already the existing `"dots"` view
  kind's shape — no new fields needed beyond a `variant` tag on that view
  to pick the renderer.
- **Field ranges** (new, since Points' numbers are much larger than
  Stamp's 4–20 range):
  - `points_per_visit`: 1–1000, default 10.
  - Points target (reuses the `stamps_required` column/field, relabeled
    "Points required" in the UI when `variant === "points"`): 10–100,000,
    with quick-pick chips 100/500/1000 (mirroring Stamp's 5/10/15
    pattern). Stamp/Flame Club's existing 4–20 range and chips are
    **unchanged** — the wider range only applies when the schema branch
    detects `variant === "points"`.
- **Naming**: vendor-facing type picker tile is "Points Club".
- **`qkit_earn` stays out of scope**: the order-webhook auto-award flow
  keeps its flat +1, unaware of `points_per_visit`, and stays restricted
  to non-points Stamp programs implicitly (a Points Club program could
  technically be selected there today since it's still `type: "stamp"` —
  see Out of scope for why this is accepted as a known gap, not fixed
  here).

## A. Migration `0026_loopkit_points_per_visit.sql`

- Recreate `add_stamp` (currently defined in migration 0022): change
  `stamp_count = stamp_count + 1` (both the insert-on-conflict initial
  value and the update branch) to
  `stamp_count = stamp_count + coalesce((v_program.config->>'points_per_visit')::int, 1)`.
  Requires the function to first look up `v_program` (currently `add_stamp`
  doesn't join `programs` at all in its 0022 form beyond `owns_program`'s
  internal check) — add a `select config from loopkit.programs where id =
p_program into v_program_config` (or equivalent) before the insert/update.
- No column changes — `points_per_visit` lives entirely inside the
  existing `config` jsonb, no new `programs` column.
- New schema test confirming the migration's raw SQL text reads
  `points_per_visit` from `config` with a `coalesce(..., 1)` fallback, and
  that the fallback-to-1 preserves today's exact behavior for programs
  without the field.

## B. `src/lib/engine/stamp.ts` / `src/lib/engine/types.ts`

- `StampConfig` gains `variant?: "dots" | "flame" | "points"` (widening
  the existing Flame Club field) and `points_per_visit?: number`.
- `redeem`/`defaults` are **unchanged**. `apply()` is the one deliberate
  exception in this whole feature (see Section G for why): it gains one
  line reading `config.points_per_visit` (defaulting to 1) instead of a
  hardcoded `+1` — everything else about it stays the same. `progress()`'s
  `"dots"`-kind view additionally gains the `variant` tag, matching how
  Fill the Cup tagged the `"plant"` kind.
- The existing `"dots"` `ProgressView` case gains
  `variant: "dots" | "points"` (Flame Club already forked to its own
  `"flame"` kind rather than tagging `"dots"`, so `"dots"`'s variant only
  ever needs to distinguish dots vs. points — flame never reaches this
  branch).

## C. New component: `src/components/points-bar.tsx`

- Pure presentational: `{filled, total, className}` — the exact same
  shape `StampDots` already takes, since the view carries the same
  `filled`/`total` fields regardless of variant.
- Renders a number ("740 / 1,000 points") above a horizontal fill bar
  (`width: {min(filled/total, 1) * 100}%`).

## D. Wiring into existing render sites

Same 3 call sites Stamp/Flame Club already have a case in —
`src/app/c/program-card-status.tsx`, `src/app/dashboard/serve-customer.tsx`,
`src/app/setup/preview-card.tsx`. Each site's existing `view.kind ===
"dots"` branch adds one conditional: render `<PointsBar>` when
`view.variant === "points"`, else `<StampDots>` as today (Flame Club's
`"flame"` kind is a separate branch, untouched).

## E. `src/lib/program.ts` / `src/lib/program-config.ts` — save-path wiring

- `saveProgramSchema`'s stamp variant: `variant` widens to
  `z.enum(["dots", "flame", "points"])`; `stamps_required`'s validation
  becomes variant-conditional — `variant === "points" ? z.coerce.number()
.int().min(10).max(100000) : z.coerce.number().int().min(4).max(20)`
  (a Zod `.superRefine` or discriminated sub-schema, matching how this
  codebase already branches per-type); new optional
  `points_per_visit: z.preprocess(emptyToUndefined, z.coerce.number()
.int().min(1).max(1000).optional())`.
- `buildProgramFields`'s stamp branch's inline config object gains
  `points_per_visit: data.points_per_visit ?? 1` alongside the existing
  `variant` field.

## F. `src/app/setup/setup-form.tsx` — Points Club as a 9th tile

- New tile "Points Club" sets `type: "stamp"` + `variant: "points"` (vs.
  "Stamp Card" → `"dots"`, "Flame Club" → `"flame"`).
- `stamps_required` input's label/range/quick-picks become conditional on
  `variant === "points"`: label "Points required", range 10–100,000,
  chips 100/500/1000 (vs. "Stamps required", 4–20, chips 5/10/15).
- New conditional field `points_per_visit` (number input, range 1–1000,
  default 10), shown only when `variant === "points"`, with its own
  hidden mirror input — same pattern as the head-start percent field.
- Head-start toggle: already conditioned on `type === "stamp" ||
type === "plant"` — Points Club gets it for free. Head-start's seed
  formula (`stamps_required * head_start_percent / 100`) already scales
  correctly regardless of what `stamps_required` numerically represents
  (points vs stamps), no change needed there.

## G. `src/app/setup/preview-state.ts` / `preview-animation.ts`

- `PreviewInput.variant` widens to `"dots" | "flame" | "plant" | "cup" |
"points"`; a new `pointsPerVisit: number` field is threaded into
  `buildPreviewProgram`'s stamp branch config.
- No animation-timing changes needed — Points ticks exactly like Stamp
  (every 3s tick = one visit) via the same `applyVisit`/`stampStrategy
.apply` path the preview already uses for Stamp/Flame Club.
- **`apply()` is the one deliberate exception to "the TS mechanic never
  changes"**: Flame Club and Fill the Cup could leave `apply()` fully
  untouched because their underlying mechanic was byte-identical to what
  it reskinned — only the display differed. Points' entire point is a
  different increment, so the live preview must reflect it too, or a
  vendor configuring Points would see a preview that silently lies about
  how fast the bar fills. `apply()` gains one line —
  `const inc = config.points_per_visit ?? 1;` replacing the hardcoded
  `+1` — mirroring exactly how `add_stamp`'s SQL computes its increment
  (Section A). `redeem()` is unaffected (still carries over `stamp_count`
  however large it is, unchanged from Stamp/Flame Club).

## Testing

- `test/db/points-per-visit-schema.test.ts`: `add_stamp`'s recreated SQL
  reads `points_per_visit` with a `coalesce(..., 1)` fallback.
- `test/lib/engine/stamp.test.ts`: `apply()` increments by
  `config.points_per_visit` when set, defaults to 1 when absent (existing
  dots/flame tests keep passing unchanged since they never set the
  field); `progress()`'s `"dots"`-kind view carries `variant: "points"`
  correctly.
- New `test/components/points-bar.test.tsx`: renders the number and bar
  width correctly at a few `filled`/`total` combinations, clamps width at
  100% when `filled > total` (carryover case).
- `test/app/preview-state.test.ts`: points variant threads
  `pointsPerVisit` into the built config.
- `src/app/setup/setup-form.dom.test.tsx`: Points Club tile sets
  `type=stamp`+`variant=points`, wider `stamps_required` range/labels
  apply, `points_per_visit` field renders only for this variant and
  submits correctly.
- `test/lib/save-program-schema.test.ts` / `build-program-fields.test.ts`:
  variant-conditional `stamps_required` range enforced correctly for both
  branches; `points_per_visit` accepted/defaulted/range-validated.

## Out of scope

- `qkit_earn` order-webhook integration respecting `points_per_visit` —
  stays a flat +1, unaware of the new field. A vendor could technically
  select a Points Club program in that flow today (it's still
  `type: "stamp"`) and get +1 per order instead of the configured amount
  — a known, accepted gap for this first version, not fixed here.
- Variable/purchase-value-based point amounts — explicitly rejected in
  favor of a fixed vendor-set amount per visit.
- Multi-tier "spend points anytime" redemption — explicitly rejected in
  favor of Stamp's existing single-threshold model.
- Any change to Stamp Card's or Flame Club's own default (`points_per_
visit` implicitly 1, unaffected) behavior.
