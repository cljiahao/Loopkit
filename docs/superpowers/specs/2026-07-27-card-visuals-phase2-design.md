# Card visuals — Phase 2 (Flame/Cup/Sprout redesign + stamp-as-logo)

Date: 2026-07-27

## Context

`2026-07-25-loyalty-card-animation-polish-design.md` (merged in #35) explicitly
researched and rejected three.js for making loopkit's cards feel "cooler" —
no evidence of real loyalty/wallet-card UIs using it, and the tilt/holographic
effects it would buy are already achievable in CSS on hardware-accelerated
transforms. That pass shipped the shared `CardShell` sheen/tilt plus
reveal-moment polish (scratch shine, wheel settle, lucky shimmer), and
explicitly deferred "steady-state visual redesigns of the 8 individual view
components (flame layers, plant/cup growth illustrations, stamp dots, points
bar)" to a later round.

This is that later round — scoped to the 3 growth visuals that were flagged as
looking bad (Flame Club, Fill the Cup, Sprout) plus a stamp-card personalization
idea that came up alongside it. Iterated via a Claude.ai artifact preview
against the real component structure/engine before any code was written; this
spec reflects what was approved there.

## Non-goals

- **three.js** — reconfirmed rejected, same reasoning as the prior spec.
- **stamp-dots.tsx / points-bar.tsx** layout changes beyond the new logo
  feature — no complaint was raised about their current look.
- **Points redemption mechanic** (accumulate & redeem, points-milestone) —
  a separate, independent spec, brainstormed right after this one.

## 1. Flame Club — 3 → 5 stages

**Current state:** `flameStageFor()` in `src/lib/engine/stamp.ts` buckets into
3 stages (`FLAME_STAGE_NAMES = ["Spark", "Inner Flame", "Full Blaze"]`), and
`flame-layers.tsx` renders 2 overlapping Lucide `<Flame>` icons with
opacity/color swapped between them. `progress()`'s `flame` view kind hardcodes
`totalStages: 3`.

**Engine change** (`src/lib/engine/stamp.ts`):

- `flameStageFor(filled, total)` moves from 2 hardcoded ratio comparisons to 5
  even buckets, mirroring Plant's `stageIndexFor` pattern: thresholds at 0%,
  20%, 40%, 60%, 80% of `total`, returning index 0–4.
- `FLAME_STAGE_NAMES` becomes
  `["Ember", "Spark", "Small Fire", "Medium Fire", "Full Campfire"]`.
- `totalStages: 5` in the `flame` view kind's return value.
- TS-only change, no migration — mirrors how Plant/Cup already derive 5
  stages from a single vendor-facing threshold, no new config field needed.

**Visual** (`flame-layers.tsx`): 3 layered `<Flame>` icons (not 2), with
per-stage size/opacity/color:

- Stage 1 (Ember): no flame icon shown — a small dim glow/coal dot instead.
- Stage 2 (Spark): one small icon, low opacity, flickering.
- Stage 3 (Small Fire): yellow.
- Stage 4 (Medium Fire): yellow-orange, bigger.
- Stage 5 (Full Campfire): red-orange-yellow, biggest, sitting on a small
  drawn log/woodpile base (present from stage 1, an ember needs wood under it;
  a 3rd log joins at stage 5).
- A subtle `motion-safe`-gated flicker animation (scale/skew oscillation) on
  the flame wrapper.
- **Fire's palette is fixed regardless of vendor brand color** — same
  category as the fixed-gold reward-moment convention (see below), not
  overridden by theming.

## 2. Fill the Cup — redrawn shape, on-brand structure, real coffee color

**Current state:** `cup.tsx` is already SVG, already takes a generic
`{stage, totalStages}` fill-fraction — **no engine change needed**. The
liquid fill uses the vendor's brand color (`fill-primary/60`); the "done"
flourish is 2 gold circles + a triangle.

**Visual, rebuilt in 3 iterations against artifact feedback — final shape:**

- Trapezoid mug body, cappuccino proportions (shorter/wider than a tall
  glass): top width ~52 units, bottom width ~34, roughly 44 units tall in a
  100×100 viewBox.
- The rim is **one continuous outline path** — up the left wall, a single
  dip-arc across the front of the rim, down the right wall — not a separate
  full `<ellipse>` floating on top of the walls. (First attempt used a full
  stroked ellipse for the rim; its far/upper half touched nothing else in the
  drawing and read as a disconnected floating shape — this is why.)
- Sits on a **saucer**, which itself sits on a small **pedestal foot** (two
  side edges + a base ellipse, drawn before the saucer so the saucer's own
  disc naturally occludes the top of the foot, peeking out only at the
  bottom) — like a soy-sauce dish. Two overlapping/stacked objects in space
  is most of what actually reads as "3D" here, more than any single shape's
  own rendering trick.
- **The whole structural cup — outline, rim, base, handle, saucer — is
  themed to the vendor's brand color**, not left neutral. This matches
  Plant's convention (see below) and was an explicit ask: the first pass only
  colored the liquid, leaving the glass/mug itself neutral ink/grey, which
  read as inconsistent once Plant's fully-themed silhouette was compared
  against it.
- **The liquid's own color shifts by fill stage** — dark espresso at Empty→Sip,
  warming through a richer coffee tone, to a lighter caramel-tan "latte" as it
  approaches Full. This is a literal, fixed coffee palette (not brand-colored)
  — the same category as Flame's fixed fire palette: the substance being
  depicted, not overridden by theming. Exact color stops are a first pass,
  called out as still-tunable in the artifact.
- The liquid is a trapezoid inscribed in the same taper as the walls, capped
  with its own surface ellipse that narrows/widens to match the current fill
  width — this surface ellipse is what the tulip sits on.
- The "done" flourish becomes an actual tulip-pour pattern (nested shallow
  crescents + a stem, gold) sitting on the liquid's surface ellipse at Full,
  replacing the old 2-circles-and-triangle shape.
- **Bug found and fixed during preview iteration**: the liquid surface
  ellipse never had `cx` set (on the element or via JS) — SVG defaults an
  `<ellipse>` with no `cx` to `cx=0`, pinning it to the far-left edge of the
  viewBox the whole time. Worth a specific note in the implementation plan so
  it isn't silently reintroduced when this gets ported into real component
  code — always set `cx` explicitly on any dynamically-positioned ellipse.

## 3. Sprout — real gaps only, restaged so each stage is one clear change

**Current state:** `plant.tsx`/`plant.ts` already has 5 stages
(`PLANT_STAGE_NAMES = ["Seed", "Sprout", "Leafing", "Budding", "Bloom"]`), a
decorative pot (not a plain bar), a seed dot at stage 0, up to 3 progressive
leaf pairs (`leafPairs = min(stage, 3)`), and a full 6-petal bloom — closer to
finished than the earlier throwaway mockup assumed. **No engine change.**

**Real gap found:** "Budding" (stage index 3) is today visually
indistinguishable from "Leafing" (stage index 2) — it just shows one more
leaf pair, nothing that reads as "a bud is forming."

**Fix, iterated through several rounds of feedback:**

- Each stage now introduces exactly **one** new visual thing, rather than
  leaves/stem/bud all partially overlapping across multiple stages:
  - **Seed**: seed dot in the soil, no stem.
  - **Sprout**: the stem alone shoots up — bean-sprout style, topped with a
    small pale, still-closed tip nub. No leaves yet (an earlier iteration
    had the first leaf pair already appearing here, which is what prompted
    this restage).
  - **Leafing**: both leaf pairs arrive together in one moment (not staggered
    across 2 more stages) — stem height doesn't change further from here.
  - **Budding**: adds only a small closed bud at the stem's tip. Leaves stay
    exactly as they were.
  - **Bloom**: the bud opens into the full 6-petal flower. Leaves stay
    visible (a bug in an intermediate iteration hard-hid leaves at Bloom via
    a stray `&& stage < 5` condition — real flowers keep their leaves).
- **Timing bug found and fixed**: the Sprout-stage tip nub was fading in via
  opacity on the same timeline as the stem's own height transition, so it
  visually appeared at its final height while the stem was still catching up
  — "sprouting in thin air." Fixed with a transition-delay on the tip's
  fade-in matching the stem's grow duration, so it only appears once the stem
  has actually finished growing to meet it.
- **Color convention**: stem/leaves/bud stay on the vendor's brand color
  (matches how the real component already themes the whole plant); the
  bloom stays fixed gold — this is the shared "reward-moment accent" pattern
  also used by Cup's tulip. Confirmed explicitly: growth visuals stay
  on-brand rather than a forced literal palette, because the point of these
  cards is matching each vendor's chosen theme.

## 4. Stamp cards — logo or preset, not just a dot

**Motivation:** letting a vendor stamp their own logo/photo instead of a
generic dot. Infra already exists and is unused for this: the
`vendor-images` public-read Storage bucket + RLS policies
(`0017_loopkit_vendor_profile.sql`, added "because the stamp card / /c pages
are unauthenticated and may eventually show a vendor photo to customers"),
the generic `ImageUploader` component (browser resize-to-WebP, already used
on `/profile`), and `avatar_url` already settable via Supabase Auth user
metadata on the profile page. **No new bucket, no new RLS.**

**Decisions:**

- **Three choices, not a binary toggle**: Plain dot (today's default) /
  Preset icon (a small built-in gallery — gift box, coffee cup, star, heart)
  / My photo.
- **Opt-in, per program** — not automatic reuse of the vendor's profile
  photo. A vendor's profile photo might be a personal headshot, not
  something they'd want stamped 10 times across a card; forcing an explicit
  choice avoids that mismatch. This needs one new config field (mode +
  optional preset key), decided at plan time whether it lives in
  `programs.config` (matching the `points_per_visit` precedent) or a
  dedicated column.
- The gift-box icon is the suggested default within the preset gallery — a
  loyalty reward reads naturally as "a present." (Flagged during review as an
  interpretation of "the old present" — confirm before implementation.)
- `stamp-dots.tsx` gets an optional mark-source prop: filled stamps render
  the chosen icon/photo (small, rounded); unfilled stamps show a faded,
  greyscale version of the same mark. Falls back to today's plain dots with
  no prop set.
- Both the customer `/c` page and the `/setup` live preview need to fetch and
  pass the resolved mark (icon key or photo URL) down — neither currently
  fetches the vendor's `avatar_url` at all.

## Testing

Same convention as the rest of the repo: `*.dom.test.tsx` assertions on
class names/rendered content, not pixel-level visual testing.

- `test/lib/engine/stamp.test.ts` (or equivalent): cover the new 5-bucket
  `flameStageFor` boundaries and the renamed `FLAME_STAGE_NAMES`.
- New/updated `dom.test.tsx` coverage for `flame-layers.tsx`, `cup.tsx`,
  `plant.tsx` reflecting the new stage-to-visual mapping.
- `stamp-dots.dom.test.tsx` (or equivalent): the 3 mark-source modes, filled
  vs. unfilled rendering.
- Server Action / config validation for the new stamp-mark field needs a
  Zod schema entry and success + invalid-value test coverage, per this
  repo's standing rule for new Server Action fields.

## Rollout

Feature branch, standard PR flow (loopkit is single-branch trunk — see
AGENTS.md). No RLS/migration review checklist needed for Flame/Cup/Sprout
(pure TS/component changes); the stamp-mark config field, if it becomes a new
column rather than a `config` JSON key, needs the usual migration + regenerated
`src/lib/types.ts`.
