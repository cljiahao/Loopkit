# /setup preview animation polish

Date: 2026-07-15

## Problem

User feedback on the shipped `/setup` live preview animation
(`SETUP-PREVIEW-ANIMATION` plan, commits `1f429ad..392c602`):

1. Tick pace feels slow (3s per visit).
2. The reward celebration is a full-browser `ConfettiBurst` overlay,
   visually decoupled from the small preview card — reads as "confetti
   fell somewhere on the screen" rather than "this card just won."
3. Scratch Card's live preview never animates.
4. Spin the Wheel has no per-spin win/lose feedback beyond the wheel's
   resting position.

## Investigation

- `TICK_MS = 3000`, `CELEBRATE_MS = 2000` in
  `src/app/setup/preview-animation.ts`.
- `ConfettiBurst` (`src/components/confetti-burst.tsx`) renders
  `className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"`
  — viewport-fixed regardless of where it's mounted in the tree. It has
  exactly two call sites: `src/app/setup/setup-form.tsx:298` (the
  preview, as a JSX sibling of `<PreviewCard>`, not a child/overlay of
  it) and `src/components/reward-celebration.tsx:27` (wrapped as
  `RewardCelebration`, used by the dashboard's real "serve customer"
  redeem flow at `src/app/dashboard/serve-customer.tsx:595`). It is
  **not** used anywhere on the real customer-facing `/c` page — that
  page's only win signal is a static "🎉 Reward ready!" text line
  (`program-card-status.tsx:140-144`).
- **Scratch Card's "no animated preview" is a genuine rendering bug, not
  a missing feature.** `src/lib/engine/chance.ts`'s `apply()` genuinely
  picks a fresh landed segment every tick using the loop's
  `Math.random()` roll — the engine data is correct. But
  `preview-card.tsx`'s scratch branch hardcodes
  `<ScratchCard revealed={false} label="" reward={false} />`, completely
  discarding the real `view.landedId`/`segments` every tick. The real
  customer page (`program-card-status.tsx:117-127`) wires this correctly
  (`revealed={view.landedId !== null}`, real label/reward) — the preview
  just never copied that wiring.
- `Wheel` (`src/components/wheel.tsx`) IS correctly wired
  (`landedId` passed through) and does re-spin via a 1.4s CSS
  `transform: rotate(...)` transition on every tick. It has no win/lose
  text/popup of its own — the only signal is which color segment (gold =
  reward, muted = non-reward) the pointer stops on.
- `ScratchCard`'s "reveal" is a static 500ms opacity-fade between two
  pre-rendered layers — there is no scratch-wipe/gesture animation
  anywhere in this codebase (confirmed via grep for
  `onPointerMove`/`onTouchMove`/canvas — zero hits). Neither the real
  customer page nor the preview has ever had an actual drag-to-scratch
  interaction; "scratching" has always been a binary
  revealed/not-revealed state swap.
- `usePreviewAnimation`'s `celebrating` boolean is computed correctly but
  never passed into `PreviewCard` — it's only consumed by the
  page-wide-fixed `ConfettiBurst` sibling.

## Decisions

- **Speed**: `TICK_MS` 3000 → 2000. `CELEBRATE_MS` stays 2000 — already
  a clean round number matching the new tick pace, no reason to shrink
  it further.
- **Contained celebration, replacing `ConfettiBurst` everywhere it's
  used** (both the `/setup` preview and the dashboard's real redeem
  flow, per explicit confirmation — not preview-only): a new component,
  `CardBurst`, renders as an absolutely-positioned overlay _inside_ a
  `relative`-positioned card container instead of `fixed inset-0` —
  particles burst from the card's center and stay contained within its
  bounds (a fireworks-style radiating burst, not confetti raining from
  the top of the viewport). Same lightweight CSS-only approach as
  `ConfettiBurst` (no new dependencies) — repositioned/restyled, not a
  new animation technology.
- **Scratch Card preview bug fix**: `preview-card.tsx`'s scratch branch
  gets the exact same wiring `program-card-status.tsx` already has —
  `revealed={view.landedId !== null}`, real `label`/`reward` derived
  from `view.segments.find(...)`. No engine change needed; the data was
  already correct.
- **Per-visit win/lose popup, wheel AND scratch, `/setup` preview
  only**: a small popup/toast appears briefly after each tick's result
  lands, reading "🎉 You won!" or "Try again," then auto-dismisses
  before the next tick. Applies to both chance-based types (same
  win/lose mechanic, same treatment, per explicit confirmation). Scoped
  to the preview only — the real customer `/c` page's existing plain-text
  "Reward ready!" banner is untouched, out of scope here.

## A. `src/app/setup/preview-animation.ts`

- `TICK_MS` constant: `3000` → `2000`. `CELEBRATE_MS` unchanged.
- `usePreviewAnimation`'s return shape gains no new fields for the
  celebration itself (`celebrating` already exists and becomes the input
  to `CardBurst`) — but gains a new transient field surfacing the
  latest chance-type result for the win/lose popup: something like
  `lastChanceResult: { won: boolean } | null`, set on each ticking
  timeout when `program.type === "wheel" || "scratch"` (derived from the
  same `applyVisit` call's `rewardUnlocked` return plus a "did this
  individual roll land on ANY reward-eligible outcome" check — note this
  is a per-visit win/lose, not the same as `rewardUnlocked`, which only
  fires once the overall multi-visit reward threshold is crossed; for
  chance types, `chanceStrategy`'s state already tracks per-visit
  win/loss via `total_wins`/`landed_segment_id` — the popup reads
  whether the just-landed segment had `reward_text`, independent of the
  pity/cooldown-gated `rewardUnlocked` flag), cleared automatically after
  a short display window (e.g. 1500ms) via its own timer, separate from
  the tick/celebrate state machine so it doesn't interfere with it.

## B. New component: `src/components/card-burst.tsx`

- Adapted from `confetti-burst.tsx`: same particle-generation approach
  (random `left`/`animationDelay`/`animationDuration`, 5-color palette),
  but positioned `absolute inset-0` (not `fixed inset-0`) with particles
  originating from the container's center and radiating outward
  (fireworks-style), rather than falling from a fixed top edge. Caller
  is responsible for wrapping its card container in `relative` (or
  `relative isolate` if stacking context matters) so the burst is
  visually clipped to that box.
- `confetti-burst.tsx`/`reward-celebration.tsx` are deleted once
  `CardBurst` replaces both call sites — no dead code left behind.

## C. `src/app/setup/preview-card.tsx`

- Scratch branch fix: replace the hardcoded
  `<ScratchCard revealed={false} label="" reward={false} />` with the
  same expression `program-card-status.tsx` uses:
  ```tsx
  <ScratchCard
    revealed={view.landedId !== null}
    label={view.segments.find((s) => s.id === view.landedId)?.label ?? ""}
    reward={view.segments.find((s) => s.id === view.landedId)?.reward ?? false}
  />
  ```
- `PreviewCard`'s props gain `celebrating: boolean` (threaded from
  `usePreviewAnimation`'s existing return value, wired by the caller in
  `setup-form.tsx`) and `lastChanceResult: { won: boolean } | null`. The
  root card container becomes `relative`; `<CardBurst active={celebrating} />`
  renders as an overlay child; a small win/lose popup renders when
  `lastChanceResult` is non-null and the current `view.kind === "chance"`.

## D. `src/app/setup/setup-form.tsx`

- Removes the sibling `<ConfettiBurst active={celebrating} />` call
  (moved inside `PreviewCard` per Section C) and passes `celebrating`/
  `lastChanceResult` as props to `<PreviewCard>` instead.

## E. `src/components/reward-celebration.tsx` / `src/app/dashboard/serve-customer.tsx`

- `RewardCelebration` is rewritten to wrap `CardBurst` instead of
  `ConfettiBurst`, positioned relative to whatever result/card container
  it's already rendered next to in `serve-customer.tsx` — the existing
  call site (`serve-customer.tsx:595`) stays structurally the same, only
  the underlying celebration visual changes.

## Testing

- `src/app/setup/preview-animation.dom.test.tsx`: `TICK_MS` timing
  updated to 2000ms in fake-timer advances; new test for
  `lastChanceResult` populating on a chance-type win/loss and clearing
  after its display window.
- `src/app/setup/preview-card.dom.test.tsx`: scratch branch now asserts
  `revealed`/`label`/`reward` reflect `view.landedId`/`segments`
  (previously asserted the hardcoded false/empty state — that assertion
  is replaced, not just added to); new test for `CardBurst` rendering
  when `celebrating` is true; new test for the win/lose popup appearing
  for a chance-type result.
- `test/components/card-burst.test.tsx`: new, mirrors
  `confetti-burst.test.tsx`'s existing coverage (renders particles when
  active, renders nothing when inactive) adjusted for the new
  `absolute`-positioning assertion.
- `src/app/dashboard/serve-customer.test.tsx` (or wherever
  `RewardCelebration`'s dashboard usage is covered): confirms
  `CardBurst` renders on the redeem-success path, replacing the old
  `ConfettiBurst` assertion.
- Full repo-wide grep for `ConfettiBurst`/`confetti-burst` after deletion
  to confirm zero remaining references outside historical
  docs/specs/plans.

## Out of scope

- Any change to the real customer-facing `/c` page's win/reward
  indicators (stays the plain-text "Reward ready!" banner).
- An actual drag/scratch gesture interaction for Scratch Card (neither
  the real page nor the preview has ever had this — out of scope for
  both).
- The QR code / edit loyalty cards mobile-width wrapping issue raised in
  the same message — unrelated area (dashboard layout, not the preview
  animation), tracked as a separate follow-up item, not part of this
  spec.
