# /setup mobile wrap fix

Date: 2026-07-16

## Problem

On narrow (mobile) viewports, three rows in `/setup` fail to wrap and
either squeeze content unreadably thin or force horizontal overflow
instead of stacking. The dashboard's QR code block
(`shop-qr-block.tsx`) was investigated and found already correctly
responsive (`flex-col` by default, `sm:flex-row` at ≥640px) — not part
of this fix.

## Investigation

- `src/app/setup/page.tsx:124` — each loyalty card's `<li>` in the "Your
  programs" list is `flex items-center justify-between gap-3`, no
  `flex-wrap`.
- `src/app/setup/page.tsx:144` — that `<li>`'s right-hand action-link
  group is `flex shrink-0 items-center gap-3 text-sm font-medium`,
  holding up to 5 conditionally-rendered links/buttons (Edit, Change
  type, Prep replacement, Activate/Schedule retirement, Manage).
  `shrink-0` forbids it from shrinking, and with no `flex-wrap` on
  either it or its parent `<li>`, a narrow viewport has no way to
  reflow this row — it forces overflow.
- `src/app/setup/setup-form.tsx:274` — the card-type picker grid is
  hardcoded `grid grid-cols-2 gap-2`, always exactly 2 columns
  regardless of viewport width (the _outer_ wrapper at line 266 is
  already correctly responsive: `grid-cols-1 md:grid-cols-2`; only this
  inner picker grid is hardcoded).
- `src/app/setup/setup-form.tsx:483` — each wheel/scratch segment row is
  `flex items-center gap-2`, holding a `flex-1` label input, a fixed
  `w-20` weight input, and two `shrink-0` buttons (Reward/No win toggle,
  Remove) — no `flex-wrap`, so the fixed/shrink-0 elements squeeze the
  label input to near-unusable width on narrow screens.

## Decision

Pure Tailwind class changes only — no logic/behavior/markup-structure
change, no new components:

1. `page.tsx:124` — add `flex-wrap` to the `<li>`.
2. `page.tsx:144` — add `flex-wrap`, drop `shrink-0` from the action
   row, so it drops onto its own line(s) under the name/badge on narrow
   viewports instead of squeezing or overflowing.
3. `setup-form.tsx:274` — `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`,
   matching the outer wrapper's existing `sm:`/`md:` responsive
   convention used everywhere else in this file.
4. `setup-form.tsx:483` — add `flex-wrap` to the segment row.

## Testing

- Existing DOM tests for `/setup`'s page and `setup-form.tsx` continue
  passing unchanged — these are pure className additions, not behavior
  changes, so no new test assertions are needed beyond a quick manual
  visual check at a narrow viewport width (this repo has no existing
  visual-regression/viewport-width test tooling, and adding one is out
  of scope for a 4-line CSS fix).

## Out of scope

- The dashboard QR block — already correctly responsive, confirmed via
  investigation.
- Any other responsive gaps not identified above — this is a targeted
  fix for the specific rows found, not a full responsive audit.
