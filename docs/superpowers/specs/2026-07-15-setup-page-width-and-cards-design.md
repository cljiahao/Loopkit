# /setup page: wider layout, card details split into two cards

Date: 2026-07-15

## Problem

The just-shipped `/setup` redesign (commits `f951165..770356f`) split the
page into a left column (type picker + preview) and a right column ("Card
details" form), switching to two columns at `sm` (640px). This introduced a
real bug: every inner field-pair grid in the right column (`win_percent` +
`pity_ceiling`, `name` + `stamps_required`, `name` + `visits_to_bloom`,
`period_days` + `target_streak`) also switches to 2 columns at `sm` — a
viewport media query, not a container query — so once the _outer_ split
also activates at the same breakpoint, the right column is only half the
page width, and every inner pair is squeezed into roughly a quarter of the
original space. On Lucky Tap this reads as "Win chance" and "Guaranteed win
by" breaking onto separate rows instead of sitting side by side; the same
squeeze affects every other type's paired fields and the wheel/scratch
segment row (label input + weight input + reward toggle + remove button, 4
elements in one flex row).

User's own diagnosis, confirmed correct: widen the page and split "Card
details" into separate cards, the way `/dashboard/profile` already does.

## Decisions

- **Width**: `/setup`'s `<main>` wrapper moves from `max-w-md sm:max-w-2xl`
  to `max-w-lg md:max-w-4xl` — the exact scale `/dashboard/profile` already
  uses (`src/app/dashboard/profile/page.tsx`). No other change to `<main>`'s
  classes (`flex min-h-screen flex-col justify-center` stays as-is).
- **Outer column split moves from `sm:` to `md:`**: `SetupForm`'s top-level
  wrapper grid (`grid grid-cols-1 gap-6 sm:grid-cols-2 sm:items-start`)
  becomes `grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start`. This is
  what actually fixes the row-break bug: the inner field-pair grids keep
  their existing `sm:grid-cols-2` untouched, and since the outer split no
  longer activates until `md` (768px), the right column has genuine room
  again by the time its own inner pairs go 2-column.
- **Right column splits into two `Card` components**, matching
  `/dashboard/profile`'s exact header pattern (icon badge + eyebrow +
  `CardTitle` + `CardDescription`, `src/app/dashboard/profile/profile-form.tsx`):
  - **"Basics"** (icon `Tag`, eyebrow "Every card needs this"): card name,
    the type-specific primary field block (unchanged content — stamp's
    stamps-required+chips, plant's visits-to-bloom, lucky's win-chance+
    guaranteed-win-by, wheel/scratch's segment editor+guaranteed-win-by,
    streak's period+target), and reward text.
  - **"Rules"** (icon `SlidersHorizontal`, eyebrow "How it works"):
    head-start toggle, carry-over toggle (when shown), expiry, the error
    message, and the submit button.
  - The `<form>` element wraps both cards (one submission covers both) —
    the hidden `id`/`replacing`/`type` inputs stay at the top of `<form>`,
    outside either card, unchanged from today.
- **Wheel/scratch segment row**: no structural change beyond what the width
  fix already provides — the row's 4 elements (label, weight, reward
  toggle, remove) get real room again once the right column widens; no
  separate restructuring needed.
- Out of scope for this spec (queued separately, in this order): animated
  auto-playing preview with confetti; vendor-configurable head-start
  amount; new program types (points accumulation, "fill the cup").

## A. `src/app/setup/page.tsx`

`<main>`'s `className` changes from
`"mx-auto flex min-h-screen max-w-md flex-col justify-center p-5 sm:max-w-2xl"`
to
`"mx-auto flex min-h-screen max-w-lg flex-col justify-center p-5 md:max-w-4xl"`.
No other change to this file.

## B. `src/app/setup/setup-form.tsx`

- Import `Card`, `CardContent`, `CardDescription`, `CardHeader`,
  `CardTitle` from `@/components/ui/card`, and `Tag`, `SlidersHorizontal`
  from `lucide-react`.
- Outer wrapper: `sm:grid-cols-2 sm:items-start` → `md:grid-cols-2
md:items-start` (left column and its contents unchanged otherwise).
- `<form>`'s contents restructure into two `Card`s:
  - `<form>` still opens with the three hidden inputs (`id`, `replacing`,
    `type`) exactly as today, then the standalone `<h3>Card details</h3>`
    heading is removed (each card's own `CardTitle` replaces it).
  - Card 1 ("Basics"): header icon `Tag`, eyebrow "Every card needs this",
    title "Basics", description "The name and reward customers see." —
    `CardContent` holds the existing `name`/type-specific-block/`reward_text`
    JSX unchanged (same conditional structure, same field code, just
    relocated inside `CardContent`).
  - Card 2 ("Rules"): header icon `SlidersHorizontal`, eyebrow "How it
    works", title "Rules", description "Head start, carry-over, and how
    long a card lasts." — `CardContent` holds the existing head-start
    toggle / carry-over toggle / expiry / error message / submit button
    JSX unchanged.
  - `</form>` closes after both cards.

## Testing

- `src/app/setup/setup-form.dom.test.tsx`'s existing 8 tests are updated
  only where they assumed a single continuous form region — re-run as-is
  first (the fields' labels/roles don't change, only their DOM ancestor
  structure, so most should pass unmodified); any that specifically assert
  on the removed `<h3>Card details</h3>` text get updated to check for
  "Basics"/"Rules" `CardTitle` text instead.
- New test: both card titles ("Basics", "Rules") render.
- No test coverage needed for the pure Tailwind breakpoint/width changes
  (`page.tsx`'s `<main>` classes, the outer grid's `sm:`→`md:` swap) —
  matches this session's established precedent for layout-only CSS
  changes.

## Out of scope

- Animated auto-playing preview, confetti, vendor-configurable head-start
  amount, and any new program type — all queued as separate future specs,
  in that order, per the user's explicit sequencing decision.
- Any change to the actual field logic, validation, or server actions —
  this spec only moves existing JSX into new card containers and adjusts
  breakpoints/widths.
