# Live loyalty card preview on /setup

Date: 2026-07-14

## Problem

`/setup` is pure data entry — a vendor configuring a card has no visual
feedback of what a customer actually sees. User: "can we like have a
preview to show how the loyalty card would look like to the vendors? if
not i also dk if its working."

## Investigation

The pipeline is genuinely wired correctly — no bug. Traced end to end:
the public card-check page (`/c?v=<vendor_id>`) resolves each active
program's `CardStatus` (`src/app/c/status-state.ts`,
`src/app/c/actions.ts`) via the same `getProgress()` used everywhere else
(`src/lib/engine/index.ts`), and `ProgramCardStatus`
(`src/app/c/program-card-status.tsx`) renders the result through one of
four real visual components, switched on `ProgressView.kind`:

| Setup type | `ProgressView.kind`                         | Component     |
| ---------- | ------------------------------------------- | ------------- |
| `stamp`    | `dots`                                      | `StampDots`   |
| `lucky`    | `dots` (pity counter toward guaranteed win) | `StampDots`   |
| `plant`    | `plant`                                     | `Plant`       |
| `streak`   | `streak`                                    | `StreakFlame` |
| `wheel`    | `chance` (`variant: "wheel"`)               | `Wheel`       |
| `scratch`  | `chance` (`variant: "scratch"`)             | `ScratchCard` |

`getProgress(program: ProgramLike, card: CardLike, now: Date): Progress`
is the single function every one of these six types already funnels
through — `ProgramLike = {type, config, stamps_required, reward_text}`,
`CardLike = {state, stamp_count, reward_count}`. This is the reuse
surface the preview is built on (see Architecture below) — the preview
does not reimplement any per-type visual or progress logic.

`SetupForm` (`src/app/setup/setup-form.tsx`) is entirely uncontrolled
today: `name`, `stamps_required`, `visits_to_bloom`, `win_percent`,
`pity_ceiling`, `period_days`, `target_streak`, `reward_text` are plain
inputs read via `defaultValue`, remounted on template pick via a
`key={prefillGeneration}` hack. `type` (the selected card type),
`segments` (wheel/scratch prize list), and `headStart`/`carryOverStamps`
(the two toggles) are already controlled state. A true live preview
requires the remaining fields to become controlled too.

## Decisions

- **Placement**: side-by-side panel at `lg:` and up (matching this
  session's established tablet-breakpoint convention), stacked below the
  form on mobile. `SetupForm` renders both halves itself — all the
  relevant state already lives inside this one client component, so
  there's no reason to lift it to the server-rendered `page.tsx`.
- **Timing**: true live — every keystroke. The uncontrolled→controlled
  conversion this requires is done anyway as a genuine simplification:
  it replaces the `key={prefillGeneration}` remount hack with direct
  `setState` calls in `pickTemplate`/`pickCustomType`, not extra
  complexity purely in service of the preview.
- **Head-start reflection**: confirmed with the user — when the
  head-start toggle is on, the preview shows the actual seeded state
  (some stamps/growth/streak already filled in), not a fresh zero card.
  This directly answers the exact "does head start actually look right"
  question from earlier this session. Lucky/wheel/scratch never offer
  head-start (the toggle only renders for stamp/plant/streak today,
  unchanged) — those three types always preview at their true
  zero/unplayed state.
- **Architecture**: the preview computes a synthetic `ProgramLike` +
  `CardLike` from the form's current controlled state, then calls the
  real `getProgress()` — not a new function that independently derives
  what the card "should" look like. This guarantees the preview can
  never drift from what `/c` actually renders, since it's the same
  code path. The only genuinely new logic is porting the head-start seed
  formula from `migration 0014`'s SQL into a small TS helper (nothing
  else in the codebase does this client-side today).
- Applies uniformly to every flow `SetupForm` already serves (create,
  edit, migrate/change-type, prep) — no special-casing, since it's driven
  by the same state that already exists per flow.

## A. Controlled-field conversion

Every currently-uncontrolled text/number input in `SetupForm` gets a
`useState` + `value`/`onChange`:
`name`, `stamps_required`, `visits_to_bloom`, `win_percent`,
`pity_ceiling`, `period_days`, `target_streak`, `reward_text`.
`pickTemplate`/`pickCustomType` set these directly from the chosen
template's defaults (or reset to blank/placeholder-driven values for
`pickCustomType`) instead of relying on the `key`-remount trick, which is
removed. Existing `type`/`segments`/`headStart`/`carryOverStamps` state
is unchanged. Form submission is unaffected — inputs still carry `name`
attributes read by the existing server actions via `FormData`, just now
`value={state}` instead of `defaultValue={...}`.

## B. Preview state computation

New pure module, e.g. `src/app/setup/preview-state.ts`:

- `buildPreviewProgress(input: { type: ProgramType; name: string; rewardText: string; stampsRequired: number; visitsToBloom: number; winPercent: number; pityCeiling: number | undefined; periodDays: number; targetStreak: number; segments: {label: string; weight: number; is_reward: boolean}[]; headStart: boolean }): Progress`
- Assembles the type-appropriate `config` the exact same way
  `buildProgramFields` (`src/lib/program.ts`) already does for the real
  save path (reusing `buildPlantConfig`/`buildStreakConfig`/
  `buildChanceConfig` directly for plant/streak/wheel/scratch; stamp and
  lucky's config objects are assembled inline, matching
  `buildProgramFields`'s existing shapes for those two).
- Builds the `CardLike`'s `state`/`stamp_count`: when `headStart` is
  true and the type is stamp/plant/streak, ports `enroll_card`'s exact
  seed math (stamp: `round(stamps_required * 0.2)`, floored at 1, capped
  below the requirement; plant: `growth` floored at the Sprout threshold
  (25%) per the existing comment in migration 0014; streak: one full
  banked period). Otherwise (`headStart` false, or type is
  lucky/wheel/scratch), builds the same all-zero/empty state
  `getProgress` already treats as "fresh" for every type.
- Calls `getProgress(program, card, new Date())` and returns its result
  directly — no new view-computation logic.

## C. `PreviewCard` component

New `src/app/setup/preview-card.tsx`: takes the `Progress` from (B) plus
`name`/`rewardText`, and renders through the same `kind`-switch
`ProgramCardStatus` already uses (`Plant`/`StreakFlame`/`Wheel`/
`ScratchCard`/`StampDots`), wrapped in a card-shaped container styled
consistently with `/c`'s actual presentation (name label, the visual,
reward text below). No redeem/regenerate interactivity — this is a
preview, not a live card.

## D. Layout

`SetupForm`'s returned JSX wraps the existing `<form>` and the new
`<PreviewCard>` in `grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start`
— form column first, preview column second, stacking on mobile/tablet
below `lg`.

## Testing

- `preview-state.ts`'s `buildPreviewProgress` gets full unit-test
  coverage (plain node test, no jsdom) — one case per type, with and
  without `headStart` where applicable, asserting the exact `view` shape
  matches what the real seed math would produce for representative
  inputs (e.g. `stampsRequired: 10, headStart: true` → `filled: 2`).
- `PreviewCard` gets jsdom component tests: renders the right visual
  component per `Progress.view.kind`, renders `name`/`rewardText`.
- `SetupForm`'s existing test coverage (if any — check before assuming)
  is updated for the controlled-field conversion; no new test needed
  purely for the 2-column layout split (CSS breakpoint, not meaningfully
  unit-testable, matching this session's established precedent for
  layout-only changes).

## Out of scope

- Any change to the real `/c` page, `ProgramCardStatus`, or any engine
  strategy file — the preview only _consumes_ `getProgress()`, it
  changes nothing about how real cards behave.
- Any change to `enroll_card`'s actual SQL — the TS port in (B) mirrors
  it for preview purposes only; the real seed still happens server-side
  in Postgres exactly as today.
- Animating the preview to simulate visits/plays over time — it shows
  one static snapshot (fresh, or head-started) per current form values,
  not a simulated progression.
