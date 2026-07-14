# Dashboard multi-program card revamp

Date: 2026-07-14

## Problem

`/dashboard` today shows one program at a time, switched via a cramped
dropdown squeezed beside the logo in `DashboardNav`. It doesn't scale to
vendors with multiple programs, the "Serve a customer" section is
oversized relative to its actual frequency, the shop QR is split into a
separate section from the serve action, and Edit lives off the card
entirely (`/setup`'s list). Not vendor-friendly, not readable.

## Decisions (from brainstorming + research)

- Two specs, this one first: dashboard/card/header revamp only. The
  `/setup` edit-form revamp (back button, per-type segregation, less
  wordy) is a separate future spec — untouched here.
- All of a vendor's **active** programs render as cards on `/dashboard` at
  once (grid, not one-at-a-time). Inactive programs stay in `/setup`'s
  list only — not on the dashboard.
- Per-card "Serve a customer": compact phone input + one button, not a
  standalone huge section. Research consensus (button-hierarchy sources):
  one primary action per container, visually first but not
  dashboard-dominating — compact ≠ demoted to equal weight with Edit/links.
- QR code: **stays one shared shop-wide QR** (not per-program) — a
  per-program QR would need a new scoped join RPC (`vendor_join` today
  enrolls a phone into every active program at once; no per-program
  equivalent exists) and new `/c` route shape. Out of scope; flagged as a
  possible future spec if still wanted. The shared QR moves to one
  compact block at the top of `/dashboard`, above the card grid, with an
  explicit one-line instruction next to it (QR-UX sources flag a bare
  code with no CTA as a common failure).
- Customers/Activity/Stats: each card links into its own `?p=<id>`-scoped
  version of those pages (existing scoping logic untouched). These links
  move out of the header entirely — no duplication.
- Edit lives on each card (top-right icon button → `/setup?edit=<id>`),
  not on the dashboard shell or `/setup`'s list.
- "+ New program" is a tile at the end of the card grid — Pro-gated the
  same way `/setup`'s create flow already is (`canCreateProgram`/`ProLock`).
- Header (`DashboardNav`) drops the program switcher and all four scoped
  page links (Counter/Customers/Activity/Stats). Plan moves into the
  account dropdown (it's account-level, not program-scoped). Header
  becomes brand + account menu only; mobile burger becomes unnecessary
  and is removed.
- Research-driven layout choices: card grid `auto-fill, minmax(240px,1fr)`;
  every card renders its fields in the same order (name/badge/edit →
  stat → serve action → footer links) — consistent order matters more for
  scan speed than raw density, per NN/g-style guidance on orderly-vs-sparse
  layouts.

## A. `DashboardNav` (`src/app/dashboard/dashboard-nav.tsx`)

Remove: the `programs.length > 1` switcher (desktop dropdown + mobile
list block), the `LINKS` array and its rendered nav (`sm:flex` row +
mobile burger panel), the burger button/`mobileOpen` state entirely (no
scoped nav left to collapse).

Keep: brand link, account dropdown (avatar/initials, `TierBadge`,
Profile, Sign out) — add a **Plan** item above Profile.

Props shrink to `{ signOut, email, vendorName, avatarUrl, tier }` —
drop `programs` and `activeByProgramId`. `layout.tsx` stops passing them
through (still fetches `pro` for `tier`; no longer needs `programs` for
nav — `page.tsx` fetches its own).

## B. `/dashboard` page (`src/app/dashboard/page.tsx`)

Server component, one fetch pass:

- `listPrograms()` filtered to `active`.
- `isPro()`.
- Per-program stats (whatever the current counter section reads today),
  fetched with `Promise.allSettled` — one program's stat failure shows a
  `—` placeholder on that card, does not fail the page.
- Shop QR payload (unchanged source, new placement).

Renders, top to bottom:

1. Shared QR block: QR image + one instruction line ("Customers scan
   this to join"), compact, above the grid.
2. `ProgramGrid` (server): CSS grid, `auto-fill, minmax(240px, 1fr)`,
   maps active programs to `ProgramCard`, appends one trailing tile:
   `NewProgramTile` (Pro or under free cap → `+ New program` → `/setup`)
   or a locked upsell tile (`ProLock`-style, at free cap) — same
   `canCreateProgram(getEntitlement(pro), activeCount)` gate `/setup`
   already uses.

Zero active programs: skip the grid/QR block, existing first-run
redirect to `/setup` is unchanged (out of scope).

## C. `ProgramCard` (new, `src/app/dashboard/program-card.tsx`)

Client component (owns the serve-form's `useActionState`), one per
active program, props are server-fetched (`program`, `stat`, no internal
fetching). Field order, fixed on every card:

1. Header row: program name, type badge (reuse `typeLabel` map from
   `/setup`: stamp/plant/streak/wheel/scratch/lucky), Edit icon-button
   top-right → `/setup?edit=<id>`.
2. Stat line: today's count / active-cards snapshot (small, one line).
3. Serve a customer: phone input + submit button, inline row, styled as
   the card's visually-primary action (not shrunk to equal weight with
   Edit/footer links). On submit error (bad phone / no card), inline
   error text under the input, scoped to that card only.
4. Footer: `Customers` · `Activity` · `Stats` text links, secondary
   weight, each `href` carrying `?p=<program.id>` — reuses the existing
   scoped pages/logic untouched.

## D. Testing

- `program-card.dom.test.tsx`: renders name/badge/edit-href; serve-form
  submit success + error paths; footer links carry correct `?p=`.
- `page.dom.test.tsx` (extend existing pattern): multiple active
  programs → multiple cards; zero active → empty/redirect state;
  free-tier cap → locked tile; Pro/under-cap → `NewProgramTile`.
- `dashboard-nav.dom.test.tsx`: trim switcher/link assertions, add
  Plan-in-account-menu assertion.
- No new backend/RPC work — this spec is presentation-layer only, reuses
  `listPrograms`/`isPro`/the existing serve-customer action and
  `Customers`/`Activity`/`Stats` scoping as-is.

## Out of scope

- `/setup` edit-form revamp (back button, per-type segregation,
  wordiness) — future Spec B.
- Per-program QR codes — would need a new scoped join RPC + new `/c`
  route shape; flagged as a possible future spec, not this one.
- Inactive programs appearing on `/dashboard` — they stay in `/setup`'s
  list only.
- Any change to `vendor_join`, `/c`, or the customer-facing join flow.
