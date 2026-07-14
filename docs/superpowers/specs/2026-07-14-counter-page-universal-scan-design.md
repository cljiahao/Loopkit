# Counter page + universal QR scan

Date: 2026-07-14

## Problem

The dashboard card grid embeds the full `ServeCustomer` widget (phone entry,
add-stamp/play, lookup, redeem, regenerate, and a per-card `ScanButton`)
directly on every `ProgramCard`. User feedback: this is too much on the
card — add-stamp/lookup should live on its own page, reached by clicking
the card, with a back button (qkit-style). Separately: since every loyalty
card already carries a QR (`card_token`), scanning should work the same way
regardless of which program a customer's card actually belongs to — today,
scanning from inside one program's card silently acts on the wrong program
if the customer's actual card is in a different program.

Investigation found the backend already supports this: `card_by_token`
already resolves `program_id` from the token alone (no program passed in),
but `resolveTokenAction` discards it and the caller always acts against
whatever program it happened to be embedded in. This is Spec B of three
(brainstormed together): A (header nav + vendor-level Activity/Stats,
shipped), B (this spec), C (stamp redeem-carryover, separate spec after
this).

## Decisions (from brainstorming)

- New page: `/dashboard/counter?p=<id>` (matches the existing `?p=`
  convention used by Customers/Activity/Stats). Contains a back button (new
  shared `BackButton` component, mirrors qkit's exact pattern — `ghost`
  button, `ArrowLeft` icon, label), the program's name/type badge, and the
  `ServeCustomer` widget moved here unchanged — no new serve/lookup logic,
  pure relocation.
- `ProgramCard` drops the embedded `ServeCustomer` — replaced by an "Open
  Counter" button/link to `/dashboard/counter?p=<id>`, kept as the card's
  one visually-primary action (same weight the inline widget had). Edit and
  the footer Customers/Activity/Stats links are unchanged.
- New global "Scan a customer" entry point on `/dashboard`, above the card
  grid, not tied to any one program. Reuses the existing QR-decode logic
  from `ScanButton` (relocated, not duplicated). On successful scan:
  resolves both `program_id` and `phone` (extending `resolveTokenAction`'s
  return type — the underlying RPC already returns `program_id`, today's
  action just drops it) and navigates to
  `/dashboard/counter?p=<program_id>&phone=<phone>`.
- Counter page pre-fills the phone from `?phone=` but does **not**
  auto-submit — the vendor still presses the action button. Chosen over
  auto-submit for safety (no accidental double-stamp if a scan event fires
  twice).
- The Counter page's own (in-page) scan button gets the same fix: if the
  resolved `program_id` doesn't match the program currently open, redirect
  to the correct Counter page (with phone pre-filled) instead of silently
  acting on the wrong program. Closes the mismatch loophole everywhere
  scanning happens, not just the new global entry point.
- No RPC/schema changes — `card_by_token` already returns everything
  needed. This is entirely an application-layer wiring fix plus new pages.

## A. `BackButton` (new shared component)

`src/components/back-button.tsx`, mirroring qkit's exact pattern:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="rounded-lg">
      <Link href={href}>
        <ArrowLeft className="size-4" />
        {label}
      </Link>
    </Button>
  );
}
```

## B. Counter page

`src/app/dashboard/counter/page.tsx`: reads `?p=<id>` (redirect to `/setup`
if missing/invalid, same `currentProgram` pattern every other `?p=` page
uses) and optional `?phone=<phone>`. Renders `BackButton` (→ `/dashboard`),
program name + type badge (reusing `PROGRAM_TYPE_BADGE`/`describeProgram`
from `program-display.ts`, same as `ProgramCard`), then `ServeCustomer`
unchanged, passed an optional `initialPhone` prop (new, small addition to
`ServeCustomer` — sets the phone input's `defaultValue`, does not
auto-submit).

## C. `ProgramCard` changes

Remove the `<ServeCustomer>` render. Add an "Open Counter" link/button in
its place, `href={scoped("/dashboard/counter")}`, same visual treatment
(primary action) the serve widget occupied.

## D. Global scan on `/dashboard`

New component wrapping the existing scan logic (moved out of the
per-program-only `ScanButton`, generalized — not tied to a `programId`
prop). Rendered once, above the card grid. On scan success: call the
extended `resolveTokenAction` (now returns `{ phone, programId }`), then
`router.push(\`/dashboard/counter?p=${programId}&phone=${encodeURIComponent(phone)}\`)`.

## E. Mismatch redirect on the Counter page's own scan

The Counter page's `ServeCustomer` instance (which still has its own
in-context `ScanButton` for convenience once already on the page) checks
the resolved `programId` against the page's current `?p=`. Match → behaves
as today (fills the phone field in place). Mismatch → redirect to the
correct Counter page with `?phone=` set, same as the global entry point.

## F. Testing

- `BackButton`: `back-button.dom.test.tsx`, renders label/href.
- Counter page: `counter-page.dom.test.tsx` — back button present, correct
  program header, `ServeCustomer` receives the right `programId`, `?phone=`
  pre-fills without auto-submitting.
- `ProgramCard`: extend existing test — "Open Counter" link present with
  correct `?p=` href, `ServeCustomer` no longer rendered on the card.
- `resolveTokenAction`: extend existing test coverage for the new
  `programId` field in its return value.
- Global scan component: dom test for the resolve-then-navigate flow
  (mocked router), and the mismatch-redirect branch.

## Out of scope

- Stamp redeem-carryover mechanics — Spec C.
- Any RPC/migration change — `card_by_token` already returns what's needed.
- Changing `ServeCustomer`'s internal serve/lookup/redeem logic — pure
  relocation plus one new optional prop (`initialPhone`).
