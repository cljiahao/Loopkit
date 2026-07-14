# Dashboard card readability + profile page parity with qkit

Date: 2026-07-14

## Problem

Two independent pieces of feedback arriving in the same batch, after this
session's shadcn conversions shipped:

1. Dashboard program cards read as too small/sparse. User: "each of the
   loyalty card is quite small... maybe like some quick information or
   stats on it? or add more description to the card or change to 3
   columns instead of 4."
2. Profile page should match qkit's layout: "amended to be similar to
   how qkit is, where qkit has 2 columns. also add a display name card
   too."

Both are independent — different pages, no shared files — bundled here
as one spec since both are small.

## Investigation

**Dashboard cards.** `ProgramCard` (`src/app/dashboard/program-card.tsx`)
is currently header (name, type badge, Edit pencil) + one-line
`describeProgram()` blurb + Open Counter button. Its stat line and
Customers/Activity/Stats footer links were both deliberately removed
earlier this session — the stats/counts are now reached via each of
those pages' own program picker instead, and re-adding a live stat here
would partially undo that. The dashboard grid
(`src/app/dashboard/page.tsx`) is
`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.

Confirmed with the user directly: **no live stat** — richer description
text using data already on the `program` row (no new per-card query),
plus dropping to 3 columns max.

**Profile page.** loopkit's `src/app/dashboard/profile/{page,profile-form}.tsx`
has 3 sections (Stall name, Photo, Change password), stacked vertically,
`max-w-2xl`. qkit's actual profile page
(`qkit/src/app/dashboard/profile/{page,profile-form}.tsx` — read directly,
not guessed) has **4** sections in a `md:columns-2 md:gap-5` masonry:
Stall name, Profile icon, **Display name**, Change password. qkit's
Display name is a genuinely separate field from Stall name — stored in
`auth.users.user_metadata.display_name`, saved client-side via
`supabase.auth.updateUser({ data: { display_name } })` (same channel
loopkit's own Photo card already uses for `avatar_url`), described as
"How QKit addresses you. Customers never see this." Confirmed via grep:
qkit's own `DashboardNav` does **not** consume `display_name` anywhere —
it's a private, decorative-only field in qkit too, not wired into any
other UI. loopkit has no such field today.

## Decisions

- **Dashboard cards**: grid caps at 3 columns
  (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, `xl:grid-cols-4` removed).
  `ProgramCard` gains one additional detail line below the existing
  description, built purely from fields already on `Program`
  (`expiry_days`, `head_start`) — no new query, no live stat, no reversal
  of the earlier stat-line removal.
- **Profile page — Display name**: added as a genuinely new field,
  matching qkit's exact storage/save mechanism
  (`user_metadata.display_name`, client-side `auth.updateUser`, no new
  server action, no DB migration). Like qkit's, it is private/decorative
  only — not wired into `DashboardNav` or anywhere else.
- **Profile page — layout**: matches qkit's `md:columns-2 md:gap-5`
  masonry mechanism exactly. The _component_ used for each section stays
  loopkit's own already-installed shadcn `Card`/`CardHeader`/`CardTitle`/
  `CardContent` — not a port of qkit's bespoke `Section`
  (`@/components/ticket-section`), which isn't a shadcn primitive and
  doesn't exist in loopkit. This matches qkit's layout _behavior_ while
  staying consistent with loopkit's own shadcn-first component usage.

## A. Dashboard cards

`src/app/dashboard/page.tsx`: the grid's class changes from

```
grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```

to

```
grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3
```

`src/app/dashboard/program-display.ts` gets a new function alongside
`describeProgram`:

```ts
export function programDetails(program: {
  expiry_days?: number | null;
  head_start: boolean;
}): string[] {
  const details: string[] = [];
  details.push(
    program.expiry_days
      ? `Resets after ${program.expiry_days} days`
      : "Never expires",
  );
  if (program.head_start) {
    details.push("New customers get a head start");
  }
  return details;
}
```

`ProgramCard` renders these as a small muted-text list under the existing
description line (below `describeProgram(program)`, still inside the
same header block, above the Open Counter button) — plain text lines,
not badges, since there can be 1-2 of them and this isn't a status
indicator, just supplementary detail.

## B. Profile page

`src/app/dashboard/profile/page.tsx`: reads `display_name` the same way
it already reads `avatar_url`:

```ts
const rawDisplayName = user.user_metadata?.display_name;
const displayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
```

Passes `displayName` as a new prop to `ProfileForm`. Wrapper `<main>`
class changes to accommodate the wider 2-column layout at `md`+ (matching
qkit's `max-w-lg md:max-w-4xl` — loopkit's current `max-w-2xl` centered
single column becomes `max-w-lg md:max-w-4xl` to give the masonry room).

`src/app/dashboard/profile/profile-form.tsx`:

- New `displayName: string` prop.
- New local state (`display`/`setDisplay`), mirroring the existing
  `stallName` state pattern exactly.
- New `saveDisplayName()` function: trims and caps at 60 chars (same
  bound as Stall name), calls
  `supabase.auth.updateUser({ data: { display_name: trimmed } })`
  directly (same client already in scope for the avatar save — no new
  server action), toasts success/error, `router.refresh()` on success.
- New `<Card>` block for "Display name", placed after the "Photo" card
  and before "Change password" (matching qkit's section order), same
  `Input`/`Label`/`Button` structure as the existing "Stall name" card.
- The outer wrapper changes from `<div className="space-y-5">` to
  `<div className="md:columns-2 md:gap-5">` — each `<Card>` becomes one
  masonry item (Tailwind's `columns` utility already handles per-item
  `break-inside-avoid` concerns adequately for this repo's card sizes,
  matching qkit's identical unmodified usage of the same utility).

## Testing

- `program-display.ts` (already has test coverage per this session's
  precedent) gets new test cases for `programDetails`: expiry set,
  expiry null, head_start true/false, and combinations.
- `program-card.dom.test.tsx` (exists) gets a new assertion that the
  detail line(s) render for a sample program.
- `profile-form.tsx` — check for existing test coverage before writing
  new tests; extend whatever pattern already exists (or note if none
  exists, matching this session's repeated precedent of no dedicated
  test for some form components) to cover the new Display name card:
  renders with the given `displayName`, save button disabled when
  unchanged, calls `auth.updateUser` with `{ display_name }` on save.
- No test needed for the dashboard grid class change (CSS breakpoint,
  not meaningfully unit-testable, matching this session's established
  precedent for similar layout-only changes).

## Out of scope

- Any change to `DashboardNav` or anywhere else in the app to surface
  `display_name` — it stays private/decorative, matching qkit's own
  scope exactly.
- Any live/queried stat data on dashboard cards.
- Any change to `ProgramCard`'s Edit pencil, Open Counter button, or
  type badge.
