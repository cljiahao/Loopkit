# /setup live preview: auto-playing animation with confetti

Date: 2026-07-15

## Problem

`/setup`'s live preview (shipped 2026-07-14/15) shows a single static
snapshot of the current form values — a customer's card at one fixed
instant (fresh, or head-start-seeded). User wants it to "feel like a
working product": tick forward automatically every few seconds, show a
completion celebration (confetti) when a customer would earn their reward,
then loop.

## Investigation

- Confetti already exists and needs no new dependency:
  `src/components/confetti-burst.tsx` exports `ConfettiBurst({ active:
boolean })`, pure CSS-animated (`confetti-fall` keyframe in
  `src/app/globals.css`), already fully disables itself under
  `prefers-reduced-motion: reduce`.
- Every other animation in this codebase (`Plant`, `Wheel`, `ScratchCard`,
  `StampDots`) uses `motion-safe:`-prefixed Tailwind CSS transitions —
  those alone can't stop a JS-driven interval from advancing real data
  every few seconds, so this feature needs its own explicit
  `prefers-reduced-motion` check (see Decisions).
- `src/app/setup/preview-state.ts`'s `buildPreviewProgress(input:
PreviewInput): Progress` is pure and stateless — one instant, no concept
  of elapsed time or an in-progress animation.
- `src/lib/engine/index.ts` exports both `getProgress()` (already used by
  the static preview) and `applyVisit(program: ProgramLike, card: CardLike,
event: EngineEvent, now: Date): { state: unknown; rewardUnlocked:
boolean }` — the same function real customer visits go through
  (`src/app/c/actions.ts` and the `record_visit`/`enroll_card` RPCs'
  TypeScript-side counterpart). Neither file imports anything server-only —
  confirmed safe to import from a Client Component (this is the same
  module the static preview already imports from without issue).
- `applyVisit`'s per-type `rewardUnlocked` return value is the uniform
  "this visit completed the goal" signal across all 6 types — but each
  type's own `Progress.rewardReady` (from `getProgress()`) is NOT uniform:
  stamp/plant/streak's `rewardReady` persists as `true` once crossed;
  lucky/wheel/scratch's is hardcoded `false` always (no persistent "ready"
  concept for a one-shot tap/spin). The animation needs its own explicit
  "just completed" signal, not `Progress.rewardReady`.
- `luckyStrategy.apply`/`makeChanceStrategy(...).apply` read
  `event.payload?.roll` (a number in `[0,1)`) to resolve win/no-win — the
  caller supplies the roll, the engine doesn't generate it internally. This
  is exactly the hook this feature needs for genuine, non-scripted
  randomness matching the vendor's actual configured odds/weights.
- `streakStrategy.apply` advances the streak based on real elapsed time
  between the supplied `now` and the stored `window_start` — one period
  elapsed = +1 streak, two-or-more periods elapsed = reset to 1. There's no
  way to make this progress via real wall-clock ticks in a few-second
  animation loop; the animation must advance a synthetic clock instead.

## Decisions

- **Scope**: all 6 program types animate, via one uniform mechanism —
  every tick, the hook calls the real `applyVisit()` with a synthetic
  visit event, exactly the function a real customer visit goes through.
  This was a deliberate widening from the user's original stamp+plant-only
  ask, made possible because `applyVisit` already generalizes across every
  type — lucky/wheel/scratch get authentic win/lose variance from their
  real configured odds (not a scripted "win every Nth tick"), and streak
  gets correct date-window math, all via the exact same tick loop with no
  type-specific animation logic beyond how each tick's synthetic `now`
  advances.
- **Tick interval**: 3 seconds. After a tick's `rewardUnlocked` is `true`,
  a 2-second "celebrating" pause (confetti + the completed visual stays
  on-screen) before the loop resets and restarts.
- **Streak's synthetic clock**: each tick advances the simulated `now` by
  `periodDays × 1.5` days from the previous tick's `now` (guarantees
  landing in `streakStrategy`'s "one period elapsed → +1" band, never the
  "reset to 1" band, every single tick). Every other type just uses real
  wall-clock time per tick — a few real seconds is negligible against
  plant's 5-day grace period, so no visible false wilting.
- **Head-start interaction**: when the head-start toggle is on, every
  loop's "beginning" is the head-start-seeded position (matching what a
  real head-started customer actually experiences — they never see an
  empty card), not zero.
- **Field-edit interaction**: any field edit (including switching card
  type) immediately resets and restarts the loop from the (possibly
  head-start-seeded) initial position with the new values — no "finish the
  current loop with stale values" grace period.
- **Reduced motion**: under `prefers-reduced-motion: reduce`, the preview
  falls back to today's static, non-ticking snapshot (one
  `buildPreviewProgress` call, no interval, no confetti) — matching every
  other animation in this codebase.
- **Runs regardless of field focus** — the preview is a separate column
  from the form fields, so an update there isn't the same kind of
  distraction as text changing at the cursor.
- **Architecture**: `preview-state.ts` splits its existing per-type
  branches into two reusable pure functions — `buildPreviewProgram(input)`
  (the `ProgramLike` config-assembly switch) and `buildInitialCard(input)`
  (the head-start-aware `CardLike` seed) — so both the existing static
  `buildPreviewProgress` (unchanged signature/behavior, now a thin
  composition of the two) and the new animation hook build their
  program/card the exact same way, with zero duplicated per-type logic.
  The new `usePreviewAnimation` hook then repeatedly calls the real
  `applyVisit`/`getProgress` to evolve state tick by tick — the animation
  can never show a transition a real customer's card couldn't actually
  produce, the same non-drift guarantee the static preview already has.

## A. `src/app/setup/preview-state.ts` — extract two pure functions

- `export function buildPreviewProgram(input: Omit<PreviewInput,
"headStart">): ProgramLike` — exactly the type-switch logic currently
  inline in `buildPreviewProgress` (stamp/plant/streak/lucky/wheel/scratch
  branches), returning only the assembled `ProgramLike`, no card, no
  `getProgress` call.
- `export function buildInitialCard(input: Pick<PreviewInput, "type" |
"stampsRequired" | "visitsToBloom" | "periodDays" | "targetStreak" |
"headStart">): CardLike` — exactly the head-start-seeded-or-`FRESH_CARD`
  logic currently inline per branch (the `headStartStampSeed`/
  `headStartPlantGrowth` helpers and the streak literal-seed object are
  unchanged, just relocated here).
- `buildPreviewProgress(input: PreviewInput): Progress` keeps its existing
  exact signature and behavior, now implemented as: `const program =
buildPreviewProgram(input); const card = buildInitialCard(input); return
getProgress(program, card, new Date());` — every existing test in
  `test/app/preview-state.test.ts` keeps passing unmodified, since the
  public contract doesn't change.

## B. New `src/app/setup/preview-animation.ts`

```ts
export function usePreviewAnimation(input: PreviewInput): {
  progress: Progress;
  celebrating: boolean;
};
```

A client-only React hook (`"use client"` file, consumed only from
`SetupForm`, an already-`"use client"` component):

- Checks `window.matchMedia("(prefers-reduced-motion: reduce)").matches`
  once on mount (and re-checks on the media query's `change` event, same
  pattern this codebase doesn't yet have elsewhere but is standard). When
  reduced motion is preferred, returns `{ progress: buildPreviewProgress(input),
celebrating: false }` with no interval ever started.
- Otherwise, holds `card: CardLike`, `simulatedNow: Date`, and `phase:
"ticking" | "celebrating"` in `useState`. `program` and `initialCard` are
  `useMemo`'d from `input`'s primitive fields (type, rewardText,
  stampsRequired, visitsToBloom, winPercent, pityCeiling, periodDays,
  targetStreak, `JSON.stringify(input.segments)`, headStart) — object
  identity of `input` itself is NOT a valid dependency (a fresh object
  literal every render), so every dependency array in this hook lists these
  primitive fields explicitly, never `input` itself.
- A `useEffect` keyed on `initialCard` resets `card`/`simulatedNow`/`phase`
  whenever the recipe changes (any field edit or type switch) — satisfies
  the field-edit-resets-immediately decision.
- A second `useEffect` (keyed on `phase`, `card`, `simulatedNow`, `program`,
  `initialCard`, `input.type`, `input.periodDays`) runs a `setTimeout` (not
  `setInterval`, so the delay can differ between the 3000ms ticking phase
  and the 2000ms celebrating phase) that either:
  - (`celebrating`) resets to `initialCard`/fresh `simulatedNow`/`"ticking"`
    phase — the loop-restart.
  - (`ticking`) computes `nextNow` (real `new Date()` for every type except
    streak, which advances `simulatedNow` by `periodDays × 1.5` days),
    builds `{ kind: "visit", payload: { roll: Math.random() } }`, calls
    `applyVisit(program, card, event, nextNow)`, sets the returned `state`
    into `card`, sets `simulatedNow` to `nextNow`, and sets `phase` to
    `"celebrating"` if `rewardUnlocked` was `true`.
  - Cleans up the timeout on unmount/re-run, same as any interval-driven
    hook.
- Returns `{ progress: getProgress(program, card, simulatedNow), celebrating:
phase === "celebrating" }` every render.

## C. `src/app/setup/setup-form.tsx` wiring

- Replace the `buildPreviewProgress({...})` call with `const { progress:
previewProgress, celebrating } = usePreviewAnimation({...})` — same input
  shape, same call site, same variable name for the progress result so
  nothing downstream (the `<PreviewCard progress={previewProgress} ...>`
  call) needs to change.
- Import `ConfettiBurst` from `@/components/confetti-burst` and render
  `<ConfettiBurst active={celebrating} />` alongside `<PreviewCard>` in the
  left column (confetti is a `fixed inset-0` overlay per its existing
  implementation — exact placement in the tree doesn't affect where it
  visually renders).
- `PreviewCard` itself is NOT modified — it stays a pure presentational
  component taking `{ progress, name, rewardText }`, so its 5 existing dom
  tests need no changes.

## Testing

- `test/app/preview-state.test.ts`'s existing 8 tests keep passing
  unmodified (public `buildPreviewProgress` contract unchanged). New tests
  added for `buildPreviewProgram`/`buildInitialCard` covering the same
  per-type cases the existing tests already cover, now testable in
  isolation.
- New `test/app/preview-animation.test.ts` (or a jsdom dom-test, given this
  is a hook — using `@testing-library/react`'s `renderHook` +
  `vi.useFakeTimers()`): ticks advance the returned `progress` every 3s
  (verified via `vi.advanceTimersByTime`); `rewardUnlocked` triggers
  `celebrating: true` for at least one tick per type (stamp: force via a
  small `stampsRequired`; lucky/wheel/scratch: seed `Math.random` to a
  fixed low value via `vi.spyOn(Math, "random")` so the win is
  deterministic in the test, not flaky); after the 2s celebrating pause,
  the loop resets to `initialCard`'s position (0, or the head-start seed
  when `headStart: true`); changing any input field restarts the loop
  immediately; `prefers-reduced-motion: reduce` (mocked via
  `window.matchMedia`) returns the static `buildPreviewProgress` result
  with no interval ever firing (assert via `vi.advanceTimersByTime` +
  checking `progress` never changes).
- `setup-form.dom.test.tsx`'s existing 8 tests: the 3 "live preview" tests
  currently assert an exact preview label immediately after render/type —
  these need `vi.useFakeTimers()` (or asserting before the first tick
  fires) so the animation's first tick doesn't race the assertion; exact
  approach decided during planning once the hook's actual tick-triggering
  mechanism is implemented.

## Out of scope

- Any change to the real customer-facing `/c` page or
  `program-card-status.tsx` — this is a vendor-side `/setup` preview
  feature only. A real customer's actual card must never auto-advance on
  its own; that would be a serious bug, not a feature.
- Vendor-configurable head-start amount, and any new program type (points,
  fill-the-cup) — queued as their own separate future specs, in that
  order, per the user's existing sequencing decision.
- Any change to `applyVisit`, `getProgress`, or any engine strategy file —
  the animation only _consumes_ the existing engine, exactly like the
  static preview already does.
