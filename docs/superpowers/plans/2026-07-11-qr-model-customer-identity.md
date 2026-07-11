# QR model + customer identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the standalone "Grow" page (vendor-level join-QR display) into
the Counter page (`/dashboard`), and drop the now-redundant "Grow" nav
entry. **This is the entire scope of this plan.** The spec's other two
decisions — whether the join QR should be per-program instead of
vendor-level, and whether customers should get real login accounts — were
both resolved to "no change" (`docs/superpowers/specs/2026-07-11-qr-model-customer-identity-design.md`,
Decisions 1 and 2). No new QR system, no new auth subsystem, no schema
change. This plan is a UI relocation, not a QR/identity redesign.

**Architecture:** `src/app/dashboard/grow/page.tsx`'s QR-fetch-and-render
block moves into `src/app/dashboard/page.tsx` (the Counter page) as a
second, native-`<details>`-collapsed card below "Serve a customer" — no new
client component, no new query (the Counter page already fetches
`listPrograms()`; the QR section reuses that same array instead of
re-fetching). The `grow/` route directory is deleted; its nav entry is
dropped from `DashboardNav`'s `LINKS`.

**Tech Stack:** Next.js 16 App Router (Server Components), existing
`qrSvg`/`CardLinkActions` helpers, Tailwind v4. No new dependency.

## Global Constraints

- `card_token`/`qrSvg`/`resolveTokenAction`/`ScanButton` stamp-issuing flow
  — untouched. This plan only moves the join-QR (`/c?v=<vendor_id>`)
  display; the separate per-card stamping QR flow is not part of this
  scope at all.
- `cards`/`stamp_events` schema, engine `Strategy` code — untouched, no
  migration in this plan.
- Phone number stays the customer's sole identity key — no new auth,
  session, or login concept introduced anywhere in this plan.
- The join QR itself is unchanged: still `/c?v=<user.id>`, still
  vendor-level, still auto-enrolls into every active program via
  `vendor_join`. Only where it's _displayed_ changes.
- No RPC or migration changes — `qrSvg(cardLink)` and `CardLinkActions` are
  reused exactly as `grow/page.tsx` already calls them.

---

### Task 1: Merge Grow's QR display into the Counter page, drop the Grow route + nav entry

**Files:**

- Modify: `src/app/dashboard/page.tsx` (Counter page — add the QR section)
- Modify: `src/app/dashboard/dashboard-nav.tsx` (`LINKS` array, line 26 —
  drop the Grow entry)
- Delete: `src/app/dashboard/grow/page.tsx` (and the now-empty
  `src/app/dashboard/grow/` directory)

**Interfaces:**

- Produces: nothing new — reuses `qrSvg` (`src/lib/qr.ts`) and
  `CardLinkActions` (`src/app/dashboard/card-link.tsx`) exactly as
  `grow/page.tsx` already imports and calls them.
- Consumes: `listPrograms()` (`src/lib/program.ts`), already called once in
  `DashboardPage` — the new QR section filters that same `programs` array
  for `active` entries instead of issuing a second `listPrograms()` call.

- [ ] **Step 1: Add the QR section to the Counter page**

  In `src/app/dashboard/page.tsx`, add the imports `headers` (from
  `next/headers`), `qrSvg` (from `@/lib/qr`), and `CardLinkActions` (from
  `@/app/dashboard/card-link`) alongside the existing imports. Inside
  `DashboardPage`, after computing `program` (and before the `return`),
  build the same `cardLink`/`cardQr` values `grow/page.tsx` builds today
  (lines 15-22 of that file — same `NEXT_PUBLIC_BASE_URL`-or-request-host
  fallback, same `/c?v=${user.id}` link, same `qrSvg(cardLink)` call). This
  needs `user.id`, which `requireVendor()` already returns — destructure
  `{ user }` instead of discarding it (currently `await requireVendor();`
  discards the result on line 13).

  Compute `activePrograms = programs.filter((p) => p.active)` from the
  `programs` array already fetched on line 15 — no new query.

  Add a second card below the existing "Serve a customer" card, wrapped in
  a native `<details>` element (no new client component needed — this is
  static content, not interactive state):

  ```tsx
  <details className="group rounded-2xl border bg-card shadow-sm">
    <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground [&::-webkit-details-marker]:hidden">
      Get new customers
    </summary>
    <div className="space-y-4 px-6 pb-6">
      <p className="text-xs text-muted-foreground">
        One QR for your whole shop — print this at your counter or till. New
        customers scan it once and join{" "}
        {activePrograms.length > 0
          ? activePrograms.map((p) => p.name).join(", ")
          : "your programs"}{" "}
        automatically, no typing needed from you. Returning customers use the
        same link to check their cards.
      </p>
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div
          className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-24"
          dangerouslySetInnerHTML={{ __html: cardQr }}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
            {cardLink}
          </code>
          <CardLinkActions link={cardLink} />
        </div>
      </div>
    </div>
  </details>
  ```

  Keep `grow/page.tsx`'s "none of your programs are active" note too —
  render it inside the `<details>` body when `activePrograms.length === 0`,
  same message, same styling as the original (lines 41-46 of
  `grow/page.tsx`).

- [ ] **Step 2: Drop the Grow nav entry**

  In `src/app/dashboard/dashboard-nav.tsx`, remove line 26 (
  `{ href: "/dashboard/grow", label: "Grow", scoped: false },`) from the
  `LINKS` array. No other change needed in this file — `LINKS` is mapped
  generically in both the desktop nav (line 139-155) and the mobile panel
  (line 234-251), so removing the array entry removes it from both
  automatically.

- [ ] **Step 3: Delete the Grow route**

  Delete `src/app/dashboard/grow/page.tsx`. Confirm (via `git status` or a
  directory listing) that `src/app/dashboard/grow/` contains no other files
  before removing the directory — it shouldn't, per the Step 0 grep below.

- [ ] **Step 0 (verification, done before Step 1): confirm no other references**

  Already checked: `grep -r "dashboard/grow\|GrowPage" src/ test/` returns
  only `src/app/dashboard/grow/page.tsx` itself and the `LINKS` entry in
  `dashboard-nav.tsx` — no test files, no other nav/redirect references
  Grow. Re-run this grep after Steps 1-3 to confirm it now returns zero
  hits (`grep -r "dashboard/grow\|GrowPage" src/ test/`).

- [ ] **Step 4: Manual verification**

  This task has no new business logic to unit-test (it's a UI relocation
  of already-correct code — `qrSvg`/`CardLinkActions`/the QR-link
  construction are unchanged, just called from a new location). Verify by
  running the dev server and checking:
  - `/dashboard` now shows a collapsed "Get new customers" section below
    "Serve a customer"; expanding it shows the same QR/link/copy-actions
    `/dashboard/grow` used to show.
  - The QR encodes the same `/c?v=<vendor_id>` link as before (scan it or
    compare the `<code>` text against the vendor's `user.id`).
  - The nav (desktop and mobile burger panel) no longer shows a "Grow"
    link.
  - Visiting `/dashboard/grow` directly now 404s (route deleted).
  - `pnpm check` (prettier + eslint + tsc) passes with no new errors from
    the moved JSX.

## Out of scope (confirmed by the spec this plan implements)

- Any change to the join QR being vendor-level (Decision 1, resolved:
  keep as-is).
- Any customer login/account system (Decision 2, resolved: keep today's
  phone-is-the-credential model).
- Any change to the per-card stamping QR (`card_token`/`ScanButton`/
  `resolveTokenAction`) — untouched, out of scope, already correct.
