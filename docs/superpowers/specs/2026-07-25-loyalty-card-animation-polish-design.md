# Loyalty Card Animation Polish — Design

## Context

The user wants loopkit's loyalty-card visuals to feel more "cool" — engaging
enough that customers want to keep opening their card, and impressive enough
that a small vendor sees it as a real selling point when evaluating loopkit.
The opening ask referenced "good loyalty cards out there," some using
three.js.

## Research summary

(Deep-research pass; see chat transcript for full citations.)

- The specific visual language people associate with "cool" card UI —
  holographic shine sweep, 3D tilt-on-touch, 3D flip reveal — is achievable
  in pure CSS (`conic-gradient` + blend modes + `transform: perspective()`)
  with zero or minimal JavaScript. Verified directly against a working
  reference implementation (Effect Labs' CSS card-effects page): the
  holographic effect is explicitly "zero JavaScript," the tilt effect needs
  only a light pointer-position handler, and 3D flip needs only
  `backface-visibility` + a CSS transition.
- three.js is real and growing in production (~150k-240k sites per crawler
  stats) but is built for actual 3D scenes (geometry/lighting/cameras/
  particles) — no evidence found of production loyalty/wallet-card UIs using
  it for a single flat card element. Reaching for it here would mean shipping
  a WebGL context and a substantially larger dependency for an effect CSS
  already does natively, on hardware-accelerated `transform`s that already
  run fine on low-end mobile.
- Two commonly-cited engagement stats ("22% retention from gamification,"
  "88% won't return after a bad microinteraction") were checked against
  their sources and found unsourced/unattributable — treat as UX folklore,
  not evidence.
- The one credible, specific finding: loyalty-UX writing consistently
  prioritizes clarity and friction-reduction (easy redemption, clear
  next-reward visibility) over visual polish; animation is a secondary
  "delight" layer, not a substitute. Variable/surprise rewards are the one
  gamification mechanic that shows up with real backing — which is already
  Lucky Tap's actual mechanic.
- SMB buying-decision research turned up no mention of animation/visual
  polish as a stated purchase factor for loyalty software (cost, setup ease,
  integrations, and whether customers redeem dominate) — polish likely helps
  the _demo-moment_ impression, not a checkbox vendors evaluate against.

**Implication:** invest in polish as a secondary delight layer using the
cheapest, most broadly-applicable technique (CSS), not a new heavy
dependency, and prioritize the actual "wow" instants (reveals/celebrations)
over steady-state view polish.

## Decision

**No new dependency.** Pure CSS (Tailwind v4 keyframes/utilities) + a small
amount of vanilla JS for pointer tracking, mirroring the existing pattern in
`usePreviewAnimation`. No three.js, no Framer Motion/GSAP.

## Scope (Phase 1 of this pass)

Two independent layers:

### 1. Shared card-shell polish (`src/components/card-shell.tsx`)

A new shared wrapper component replacing the plain `<div>` both
`PreviewCard` (`/setup` live preview) and `ProgramCardStatus` (real `/c`
card) use as their outer container. Gives every card type (stamp, flame,
points, plant, cup, wheel, scratch, lucky) the same "premium trading card"
treatment via one shared change instead of eight:

- An idle CSS `conic-gradient` holographic sheen, slowly drifting
  (`card-shell-sheen-drift`, 5s ease-in-out alternate).
- A capped (±6°) pointer-tracking 3D tilt (`perspective(800px) rotateX()
rotateY()`), computed from pointer position within the card's bounding
  box, reset to flat on pointer-leave.

Both are skipped entirely (sheen element not mounted, no pointer listeners
attached) under `prefers-reduced-motion` — this is a continuous effect, not
a one-shot reveal, so it needs to never engage rather than just play once.

### 2. Reveal-moment upgrades

Targeted, per the "reveals matter more than steady-state" research finding:

- `lucky-box.tsx` — previously had zero animation. Adds an idle shimmer
  sweep (`lucky-box-shimmer`, 2.2s loop) inviting the tap.
- `wheel.tsx` — the settle transition (once `landedId` resolves) swaps its
  flat `ease-out` for a "back-out" `cubic-bezier(0.34,1.56,0.64,1)` — the
  wheel slightly overshoots the landed angle then rocks back, reading as
  physical momentum instead of a CSS snap. Free-spin phase (`animate-spin`)
  is untouched.
- `scratch-card.tsx` — a one-shot shine sweep (`scratch-reveal-shine`,
  0.9s) plays across the revealed prize once `revealed` flips true.

All three new keyframes get their own `prefers-reduced-motion: reduce`
override in `globals.css`, following the existing pattern for
`card-burst-piece`/`scratch-stroke`.

### Out of scope for this pass

- `card-burst.tsx` (reward celebration) — left as-is this round.
- Steady-state visual redesigns of the 8 individual view components
  themselves (flame layers, plant/cup growth illustrations, stamp dots,
  points bar) — the research take was that reveal moments matter more than
  steady-state polish; a candidate for a later round if wanted.
- A 3D flip-reveal transition — not built this pass; CSS-only and
  straightforward to add later if the tilt/sheen treatment alone doesn't
  land as "cool" enough.

## Testing

Same convention as the rest of the repo: `*.dom.test.tsx` assertions on
class names / `data-testid` hooks and reduced-motion branching, not
pixel-level visual testing. `CardShell` gets its own test file; `lucky-box`
and `scratch-card` get additional assertions for their new elements.

## Rollout

Pushed to a feature branch so Vercel deploys a preview for the user to look
at directly, rather than a full spec-review-gate cycle before any code
exists — an explicit, faster-iteration choice for this round given the
visual nature of the work (best judged by looking at it, not reading about
it).
