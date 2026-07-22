# Card Type Regroup + Chance Card Revamp — Design Spec

## Problem

`2026-07-19-card-type-family-picker-design.md` grouped `/setup`'s 8 leaf
options into 4 families (Stamp Card, Sprout, Chance Card, Lucky Tap) but
grouped by DB `type` column, not by what the family actually means to a
vendor. Two mismatches:

- Flame Club and Points Club sit under "Stamp Card" only because they share
  `type: "stamp"` in the DB. Visually/conceptually they aren't a literal
  stamp grid — Flame Club is a growth metaphor (same idea as Sprout/Fill the
  Cup); Points Club is a running numeric total, not a stamp collection
  either.
- Lucky Tap is its own family, but mechanically it's a random-roll-per-visit
  reward exactly like Wheel/Scratch — it just happens to render a `dots`
  progress view today (`src/lib/engine/lucky.ts`), which is a visual
  leftover, not a real distinction.

Separately, the Chance Card (Wheel/Scratch) Basics editor and live preview
have real UX gaps: the segment editor shows a raw odds-`weight` number with
no indication of actual win probability, and the live `/setup` preview snaps
straight to a result with no anticipation — no spin, no scratch motion, no
felt connection to the odds you just configured.

## Scope decomposition

Points Club's redemption model (a running point balance with a
vendor-defined reward catalog, replacing today's single-threshold
reset-on-redeem behavior) is **out of scope** for this spec — it needs a
migration, a new engine strategy, and a new redeem flow, and is being
designed separately once this ships. This spec touches Points Club's
**family placement only** (own family, not under Stamp Card).

In scope, as four independent pieces (separate implementation-plan phases,
each independently shippable):

- **A.** Family/style taxonomy regroup (picker-only, no type/variant change)
- **B.** Chance Card Basics: odds shown as a live percentage
- **C.** `/setup` preview: spin/scratch reveal animation, synced win/lose
  signal
- **D.** Lucky Tap: new chance-style visual (`LuckyBox`), replacing the
  `dots` view — **this one is not preview-only**, it changes the live
  customer-facing card for any vendor with an active Lucky Tap program today

## A. Family/style taxonomy regroup

| Family (tile) | Description | Styles inside |
| --- | --- | --- |
| **Stamp Card** | Collect stamps toward a reward | Classic dots only — single-style, no substep (same pattern Lucky Tap uses today) |
| **Growth** *(renamed from "Sprout")* | Visible progress that grows or fills with every visit | Flame Club *(moved out of Stamp Card)* · Sprout *(renamed from "Classic")* · Fill the Cup |
| **Points Club** | Earn points toward a reward | single-style, no substep |
| **Chance Card** | A random prize on every visit | Spin the Wheel · Scratch Card · **Lucky Tap** *(moved in)* |

Zero DB `type`/`variant` values change — this is purely `card-type-picker.ts`'s
`FAMILIES` data, `resolveFamilyAndStyle()`, and the `FamilyKey` union:

```ts
export type FamilyKey = "stamp" | "growth" | "points" | "chance";
```

`resolveFamilyAndStyle()` changes for two cases: `variant === "flame"` now
resolves to `{family: "growth", style: "flame"}` (was `stamp`), and
`variant === "points"` resolves to `{family: "points", style: "points"}` (was
`stamp`). `type === "lucky"` now resolves to `{family: "chance", style:
"lucky"}` (was its own `lucky` family key). `styleToTypeAndVariant()`'s
lookup table values are unchanged — same `{type, variant}` pairs, just keyed
under new family membership.

`isSingleStyleFamily()` is unchanged (checks `styles.length === 1`) — now
true for both `stamp` and `points` families, false for `growth` (3 styles)
and `chance` (3 styles).

Style label changes: the plant-family's `"Classic"` style becomes `"Sprout"`
(it needs its own name now that "Sprout" is the family name one level up).
Flame Club and Fill the Cup's labels/descriptions are unchanged, just
reparented.

`card-type-picker.test.ts` gets a full rewrite locking in the new
family/style shape (family count, per-family style count, the full
`resolveFamilyAndStyle`/`styleToTypeAndVariant` round-trip for every leaf).
`setup-form.dom.test.tsx`'s existing family/style picker tests (Flame Club,
Points Club, Fill the Cup, Sprout's Classic-now-"Sprout", Lucky Tap) get
updated to click through the new family tiles.

`PROGRAM_TYPE_BADGE`/`describeProgram()` in
`src/app/dashboard/program-display.ts` key off DB `type`, not family — no
change needed there.

## B. Chance Card Basics: odds as a live percentage

Add pure helpers to `src/lib/program-config.ts` (already the client-safe
home for segment-shape logic, imported by both `preview-state.ts` and
`setup-form.tsx`):

```ts
export function segmentWinPercent(segments: SegmentInput[]): number[];
export function overallWinPercent(segments: SegmentInput[]): number;
```

`segmentWinPercent` returns each segment's `weight / totalWeight` as a
rounded percentage, in input order. `overallWinPercent` sums the weights of
`is_reward` segments over the total weight — the same math
`chance.ts`'s `pickSegment` already does internally to pick a winner, just
surfaced for display. Both are pure functions over the segment list already
held in `setup-form.tsx`'s `segments` state — no new engine/config plumbing.

`setup-form.tsx`'s segment editor: each row keeps its weight `<Input>` (still
the actual value `buildChanceConfig` consumes) but adds a small `"≈NN%"`
read-only badge next to it, computed live via `segmentWinPercent`. An
"Overall win chance: NN%" line sits above the segment list, computed via
`overallWinPercent`. Row layout changes from one wrapping flex row to two
lines (label + Remove on line one; weight input + odds badge + Reward/No-win
toggle on line two) so it stops wrapping awkwardly on mobile.

## C. `/setup` preview: spin/scratch reveal animation

Confirmed while investigating: `Wheel`'s `spinning` prop is dead code today
— never passed by `preview-card.tsx` or `program-card-status.tsx`. That's
because the actual chance roll happens server-side at scan time (a visit
event); the customer's `/c` page only ever displays an already-resolved
result — there's no live "watch it spin" moment in production. So this
section's audience is the `/setup` preview only (which fakes a repeating
visit loop for demo purposes); it doesn't change production card behavior.

`usePreviewAnimation` (`src/app/setup/preview-animation.ts`) gets a new
`"revealing"` sub-phase for `type === "wheel" | "scratch"`, inserted between
rolling and showing the result:

1. On tick, compute the roll/result immediately via `applyVisit` (as today)
   but hold the new `card` state back in a `pendingCard` ref instead of
   calling `setCard` right away.
2. Enter `"revealing"` phase for `REVEAL_MS` (1400ms, matching `Wheel`'s
   existing `duration-[1400ms]` transition). During this phase the hook's
   returned `Progress.view` has `landedId` overridden to `null` (masking the
   previous result), and the hook's return shape grows a new `revealing:
   boolean` field alongside `progress`/`celebrating`/`lastChanceResult`.
3. `setup-form.tsx` forwards this new `revealing` value into a new
   `<PreviewCard revealing={revealing} .../>` prop. `PreviewCard` passes
   `spinning={revealing}` to `Wheel` (finally using the existing prop, only
   when `view.kind === "chance" && view.variant === "wheel"`) and a new
   `scratching={revealing}` to `ScratchCard`.
4. After `REVEAL_MS`, commit `pendingCard` via `setCard`, exit `"revealing"`,
   and fire `lastChanceResult`/`celebrating` exactly as today — so the
   win/lose pill now appears in sync with the animation completing, not
   before it.

`ScratchCard` gets a new `scratching?: boolean` prop: while true, render a
handful (4-5) of staggered diagonal "scratch stroke" divs sweeping across the
cover (construction mirrors `CardBurst`'s per-particle randomized-CSS-custom-property
pattern) before the existing opacity-fade reveal plays. `prefers-reduced-motion`
skips straight to the revealed state (no revealing phase at all), consistent
with the rest of this hook's existing reduced-motion handling.

## D. Lucky Tap: new chance-style visual

`LuckyConfig`'s `progress()` (`src/lib/engine/lucky.ts`) currently returns:

```ts
view: { kind: "dots", filled: visits_since_win, total: pity_ceiling }
```

New `ProgressView` member in `src/lib/engine/types.ts`:

```ts
| {
    kind: "lucky";
    visitsSinceWin: number;
    pityCeiling: number;
  }
```

`lucky.ts`'s `progress()` returns this new kind instead of `dots`. New
`src/components/lucky-box.tsx` (`LuckyBox`): a "tap for a surprise"
mystery-box visual (gift/sparkle icon, no dot grid) with a small text/ring
underneath showing pity progress (`visitsSinceWin`/`pityCeiling`) so the
guaranteed-win-by information isn't lost, just no longer the primary visual.
Wired into both `PreviewCard` (`src/app/setup/preview-card.tsx`) and
`ProgramCardStatus` (`src/features/card-check/components/program-card-status.tsx`),
replacing their `kind === "dots"` fallback path for Lucky Tap specifically —
`StampDots`/`PointsBar` remain for genuine stamp/points programs.

Reuses the same win/lose pill (`lastChanceResult`) pattern already built for
Wheel/Scratch in `PreviewCard` — Lucky Tap gains that pill too, since it's
now visually and conceptually a Chance-family member.

## Testing

- `card-type-picker.test.ts`: full rewrite for the new family/style shape.
- `setup-form.dom.test.tsx`: update existing family/style click-through
  tests for the new groupings; add odds-percentage assertions to the
  existing Spin the Wheel segment-editor test.
- New `src/lib/program-config.test.ts` cases (or extend the existing
  `program-config` test file if one exists) for `segmentWinPercent`/
  `overallWinPercent`.
- New `src/components/lucky-box.dom.test.tsx` (mirrors
  `flame-layers.dom.test.tsx`'s pattern): renders the mystery-box visual and
  the pity-progress text for a few `visitsSinceWin`/`pityCeiling` combinations.
- New `src/components/scratch-card.dom.test.tsx`: asserts the `scratching`
  prop renders the stroke elements and the existing `revealed` behavior is
  unchanged when `scratching` is absent/false.
- `preview-animation.dom.test.tsx`: new case(s) for the `"revealing"`
  sub-phase — `spinning`/`scratching` true during the delay window, result
  and `lastChanceResult` only committed after it; reduced-motion still skips
  straight to a settled result.
- `test/lib/engine/lucky.test.ts`: update `progress()` assertions for the
  new `kind: "lucky"` view shape.

## Out of scope

- Points Club redemption redesign (running balance, reward-tier catalog,
  new redeem flow) — separate follow-up spec.
- Any real interactive (drag-to-scratch) customer-facing scratch gesture —
  explicitly declined; animation is auto-playing/non-interactive only.
- Any change to how/when the chance roll actually happens (still
  server-side at scan time) — the `/setup` preview's "revealing" phase is a
  presentation-only simulation, matching how the rest of `preview-animation.ts`
  already fakes a visit loop.
- `PROGRAM_TYPE_BADGE`/`describeProgram()` copy changes — those key off DB
  `type`, unaffected by family regrouping.
