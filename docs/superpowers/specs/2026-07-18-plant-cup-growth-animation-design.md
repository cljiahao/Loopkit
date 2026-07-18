# Plant/Cup slow-growth animation — Design

## Context

`Plant` (`src/components/plant.tsx`) and `Cup` (`src/components/cup.tsx`) are
the two `plant`-type program view variants (Sprout and Fill the Cup). Both
take an integer `stage`/`totalStages` and render a snapshot of current
growth. Every time `stage` changes — a real stamp on `/dashboard`'s
serve-customer screen, a real visit reflected on the customer's `/c` card, or
a simulated visit in `/setup`'s live preview (`usePreviewAnimation`, ticking
every 2s) — the shape jumps straight to the new stage. Cup softens this with
a 500ms CSS transition on its liquid fill; Plant has no transition at all.
The ask: make growth look like it's actually happening over time, not
stepping.

## Current state (verified against the actual components)

- **Cup**: liquid fill is a `<rect>` whose `y`/`height` are set directly from
  `frac = stage / (totalStages - 1)`, with
  `motion-safe:transition-all motion-safe:duration-500`. `y`/`height` are
  real CSS-animatable SVG geometry properties, so this transition already
  works — it's just too fast (500ms) to read as "filling", more of a snap.
- **Plant**: stem is a `<line x1="50" y1="74" x2="50" :y2={stemTopY}>` with
  no transition class at all. `x1/y1/x2/y2` are **not** CSS-animatable
  properties (they never got promoted to real CSS properties the way
  `x/y/width/height/cx/cy/r/rx/ry` did) — so even adding
  `transition-all` here would silently do nothing. This is a real technical
  constraint, not an oversight: the fix has to change _how_ the stem's
  height is represented, not just add a class.
- **Leaves**: `leafPairs = Math.min(stage, 3)`, and each visible pair's
  position is `t = (i + 1) / (leafPairs + 1)` — the denominator is the
  _current_ visible count, so every existing leaf pair silently shifts
  position up the stem each time a new pair appears. Combined with no
  transition, this reads as an instant reflow-and-pop.
- **Bloom** (Plant, `isBloom`) and **latte-art** (Cup, `isFull`) appear
  unconditionally once the final stage is reached — instant pop, no
  transition.
- A separate, unrelated celebration overlay (`CardBurst`/`RewardCelebration`)
  already fires on reward-unlock in all three call sites — this spec doesn't
  touch that; it's about the ambient growth of the shape itself between
  visits, not the reward-unlock burst.
- **Call sites** (all three get this for free — it's a change to the shared
  components, not any call site): `src/setup/preview-card.tsx` (2s simulated
  ticks), `src/app/dashboard/serve-customer.tsx` (one real stamp), `src/features/card-check/components/program-card-status.tsx`
  (one real visit, page load).
- **Tests today**: `src/components/cup.dom.test.tsx` (5 tests: renders svg,
  no-fill at stage 0, fill-rect once growth starts, latte-art only at final
  stage, dimmed fill when wilting). **No `plant.dom.test.tsx` exists.**
- **No animation library** in the project (`package.json` has no
  framer-motion/gsap/etc.) — everything animated today is plain Tailwind
  `motion-safe:transition-*` utilities. This spec keeps that pattern; no new
  dependency.

## Design

### Duration & easing

A single shared timing, duplicated as a literal in both files (only two call
sites — not worth extracting a shared constant per YAGNI):

```
motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out
```

1600ms against the preview's 2000ms tick leaves a short, visible pause at
each new stage before the next visit fires, rather than one animation
bleeding into the next. `ease-out` (fast start, settling at the end) reads
more like organic growth than linear. This same duration is reused, unmodified, for the leaf fade-in stagger and the bloom/latte-art fade-in below — one consistent "growth speed" across the whole component, not several different timings.

### Cup: widen the existing transition

Only the duration/easing values on the existing liquid `<rect>` change,
from `duration-500` to the shared `duration-[1600ms] ease-out`. `y`/`height`
already animate correctly — this needs no other structural change.

Add a fade+scale-in to the latte-art group (`isFull`) instead of its current
instant appearance: wrap the two circles + path in a `<g>` with
`opacity-0`/`scale-0` → `opacity-100`/`scale-100` (Tailwind `data-[state]`
isn't warranted here — a plain conditional class driven by `isFull` is
enough, matching the existing conditional-render style) and the same shared
transition timing, `transform-origin` pinned at the cup's center so it
scales in from the middle rather than the top-left corner.

### Plant: stem as a scaled transform, not a resized line

Render the stem `<line>` **unconditionally, always at its maximum length**
(soil at y=74 up to y=18, the bloom position — the fixed max of the range
`stemTopY` spans today), dropping today's `{frac > 0 && <line .../>}` guard.
Represent current growth with `transform: scaleY(frac)` and
`transform-origin: 50px 74px` (anchored at the soil, so it grows upward, not
from the center) — the exact same anchored-transform technique the file
already uses for the wilt rotation on the outer `<g>`. `transform` _is_
CSS-animatable, so this gets the shared `motion-safe:transition-all
duration-[1600ms] ease-out` for free. The `frac === 0` seed-dot fallback
stays exactly as today, rendered alongside the (now `scaleY(0)`, so
invisible) line — no visible difference from today's 0-height line, so no
extra branching needed.

**Knock-on effect on leaf positioning**: today's leaf-Y formula
(`74 - (74 - stemTopY) * t`) is relative to `stemTopY`, which used to track
_current_ growth. Since the stem's DOM geometry is now always fixed at
maximum height (growth is a visual transform only, not a geometry change),
leaf slot positions must be computed against that same fixed maximum, not
against `frac`: `74 - (74 - 18) * t`, with `t` from the fixed
`MAX_LEAF_PAIRS` denominator below. Leaves are separate elements from the
stem `<line>` — they do **not** sit inside the stem's `scaleY` transform,
so their own fixed Y position is unaffected by the stem's current growth
fraction.

### Leaves: fixed slots, no reflow, staggered fade-in

Change the position formula from a _current-count_-relative denominator to a
**fixed** one, so a leaf pair's position is permanent from the moment it's
computed, regardless of how many pairs are visible:

```ts
const MAX_LEAF_PAIRS = 3;
const leafPairs = Math.min(stage, MAX_LEAF_PAIRS);
// t is now independent of leafPairs — position never shifts once assigned
const t = (i + 1) / (MAX_LEAF_PAIRS + 1);
```

Render all `MAX_LEAF_PAIRS` slots unconditionally (not just the visible
`leafPairs` count), each gated by `opacity-0`/`opacity-100` (+ a matching
`scale-0`/`scale-100`, transform-origin at that leaf's stem attachment
point) driven by `i < leafPairs`, with the shared transition timing plus a
small per-index stagger (`transition-delay: ${i * 200}ms`, inline style —
Tailwind has no arbitrary-per-index delay utility, so this one value is a
plain style prop) so leaf pairs visibly unfurl one after another rather than
all fading in at once. This is the only per-leaf inline style; everything
else stays as Tailwind classes.

### Bloom: fade+scale-in, matching Cup's latte-art

Same treatment as Cup's latte-art group: `opacity-0`/`scale-0` →
`opacity-100`/`scale-100` on the existing bloom `<g>`, shared transition
timing, `transform-origin` pinned at `50px {stemTopY}px` (already set on
that group today for the per-petal rotation — reused, not duplicated).

### Reduced motion

No change needed beyond keeping every new transition behind
`motion-safe:` (matching the existing wilt-rotation and Cup-fill classes) —
`prefers-reduced-motion` users see states change instantly, and the /setup
preview's own `usePreviewAnimation` already stops ticking entirely under
reduced motion, returning a single static snapshot instead of a running
loop. Both mechanisms already exist; this spec doesn't add or change either.

## Testing

- **New `src/components/plant.dom.test.tsx`**, mirroring `cup.dom.test.tsx`'s
  shape: renders an svg; no stem line rendered distinctly at stage 0 (seed
  dot only); leaf-pair count matches `min(stage, 3)`; bloom group renders
  only at the final stage; wilting dims the stem color. Plus one test
  specific to the reflow fix: render at `stage=1`, capture the first leaf
  pair's `d` attribute, re-render at `stage=2`, assert the first leaf pair's
  `d` is unchanged (only a second pair was added, nothing moved).
- **`cup.dom.test.tsx`**: existing 5 tests keep passing unmodified (duration
  change doesn't affect element structure/attributes, only the `class`
  string, which no existing test asserts on beyond the wilting-color test).
- No changes needed to `preview-animation.ts`, `preview-card.tsx`,
  `serve-customer.tsx`, or `program-card-status.tsx` — this is entirely
  contained inside the two leaf components.
- `pnpm check && pnpm test` must pass.

## Out of scope

- Stamp/Flame/Points (`stamp-dots.tsx`/`flame-layers.tsx`/`points-bar.tsx`),
  Wheel, and Scratch views — user asked specifically about Sprout (Plant)
  and Fill the Cup (Cup); the other view kinds keep their current instant
  rendering.
- The reward-unlock celebration overlay (`CardBurst`/`RewardCelebration`) —
  unrelated, already animated, not touched by this spec.
- Changing `usePreviewAnimation`'s 2000ms tick interval or the
  wilt/decay-rotation animation — out of scope; this spec is only about the
  growth direction (seed → sprout → bloom, empty → full).
- Any new animation library dependency.
