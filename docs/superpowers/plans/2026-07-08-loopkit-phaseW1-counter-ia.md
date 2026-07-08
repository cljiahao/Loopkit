# loopkit Phase W1 — Counter-first Dashboard IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Split the vendor dashboard's one crowded page into a bottom-tab workspace — Counter (the identify+act job, and only that), Customers (exists), Activity (moved), Grow (moved, reframed as self-serve onboarding). Make Scan the primary counter action over typing a phone.

**Architecture:** Pure UI reorganization — no new server actions, no schema, no behavior change to stamp/lucky/plant/redeem. Move existing JSX/queries verbatim into new route files; add a tab-bar nav component.

**Tech Stack:** Next 16, TS strict, Vitest, pnpm 11. No migration.

## Global Constraints

- TS strict; no `any`/`@ts-ignore`; no inline comments; match existing tokens/style.
- Do NOT change `stampAction`/`recordVisitAction`/`lookupAction`/`redeemAction`/`redeemPlantAction`/`resolveTokenAction` — reuse as-is.
- Every moved section keeps its exact current query/logic — this is relocation + reframing, not a rewrite.
- Every task ends green: `pnpm check && pnpm test && pnpm build`.
- Spec: `docs/superpowers/specs/2026-07-08-loopkit-counter-first-design.md` Part 1–2.

---

### Task 1: Tab bar + layout

**Files:** Create `src/app/dashboard/dashboard-tabs.tsx`; Modify `src/app/dashboard/layout.tsx`.

- [ ] Create `DashboardTabs` (`"use client"`): four links — Counter (`/dashboard`), Customers (`/dashboard/customers`), Activity (`/dashboard/activity`), Grow (`/dashboard/grow`) — each carrying the current `?p=` query param through (read via `useSearchParams`, append to each href). `usePathname` active state (icon + label, lucide icons e.g. `Store`/`Users`/`History`/`QrCode`). Fixed to the bottom on narrow viewports (`fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur sm:static sm:border-t-0`), a plain top row on wider ones — mirror the existing `dashboard-nav.tsx` responsive technique if one exists, else a simple `sm:` breakpoint swap.
- [ ] `layout.tsx`: keep the existing header (wordmark + sign-out) as-is; add `<DashboardTabs />` right below it (or the bottom-fixed variant renders itself at `bottom-0` regardless of DOM position — verify no overlap with page content via bottom padding on the content wrapper, e.g. `pb-16 sm:pb-0`).
- [ ] `pnpm check && pnpm build` green (no test needed for a static nav); commit `feat: dashboard tab bar`.

### Task 2: Counter — shrink `/dashboard` to identify+act only

**Files:** Modify `src/app/dashboard/page.tsx`.

- [ ] Remove the "Your customer card" QR panel block and the "Recent activity" block (their JSX + the `events`/`cards`/`phoneByCardId`/`cardQr`/`cardLink` computations) from `page.tsx` — they move verbatim to Tasks 3–4. Keep: `requireVendor`, `listPrograms`/`currentProgram`/redirect, the program bar (name/type badge/switcher), and the `<ServeCustomer>` card.
- [ ] Condense the program bar to a single slim row: switcher (if `>1`) + name + type badge on one line, Edit as a small icon-button (keep `/setup?edit=` link) — no separate multi-line block. Keep the reward-description subtitle (one line) under it.
- [ ] `pnpm check && pnpm test && pnpm build` green (existing `serve-customer`/dashboard tests should be unaffected since `ServeCustomer` itself doesn't move); commit `feat: shrink Counter to identify+act`.

### Task 3: `/dashboard/activity` — move the recent-activity list

**Files:** Create `src/app/dashboard/activity/page.tsx`.

- [ ] Move the exact events query + rendering block removed from `page.tsx` in Task 2 into this new route (same `requireVendor`/`listPrograms`/`currentProgram`/redirect pattern, reading `?p=` the same way). Heading: "Activity". No logic change — copy the query, the `phoneByCardId` map, and the `<ul>` rendering verbatim.
- [ ] `pnpm check && pnpm build` green; commit `feat: /dashboard/activity route`.

### Task 4: `/dashboard/grow` — move + reframe the customer-card panel

**Files:** Create `src/app/dashboard/grow/page.tsx`.

- [ ] Move the exact QR/link panel (origin derivation via `headers()`, `qrSvg`, `CardLinkActions`) removed from `page.tsx` in Task 2 into this new route. Reframe copy: heading "Get customers to join", body: "Print this QR at your counter or till — new customers scan it to join **{program.name}** themselves, no typing needed from you. Returning customers use the same link to check their card." Keep the QR tile + link + Copy/Print buttons unchanged.
- [ ] `pnpm check && pnpm build` green; commit `feat: /dashboard/grow route with self-serve framing`.

### Task 5: Scan-first `ServeCustomer`

**Files:** Modify `src/app/dashboard/serve-customer.tsx`.

- [ ] Reorder the identify row: `<ScanButton>` first and visually primary (larger, e.g. `size="lg"`, full-width on mobile, camera icon + "Scan to serve" label — the button already exists, just restyle/reposition it first in the JSX and give it the prominent treatment). The phone `Input` + its Label become a secondary row below, introduced by a small "or enter phone manually" caption. The primary type-action button (Add stamp/Play/Water) and the "Look up" button stay tied to the phone-entry row as today (Scan still auto-submits on decode via `requestSubmit()` — unchanged behavior).
- [ ] Update `test/app/serve-customer.test.tsx` only if it asserts DOM order/roles that changed (labels/roles themselves are unchanged, so likely no change needed — verify).
- [ ] `pnpm check && pnpm test && pnpm build` green; commit `feat: make Scan the primary counter action`.

### Task 6: `/c` join framing (cosmetic)

**Files:** Modify `src/app/c/page.tsx`, `src/app/c/check-form.tsx`.

- [ ] `c/page.tsx`: when no card exists yet for a typed phone is unknown at page-load (server can't know pre-submit), keep the existing shop-name `<h1>`; add a one-line subheading under it: "New here? Enter your phone to join — no app needed." (purely additive copy, no logic change).
- [ ] `check-form.tsx`: when `checkStatusAction` returns `status:"none"` (no existing card — meaning this submission just enrolled them fresh, since `enroll_card` always creates one), the copy this action already returns is a generic message — leave that logic untouched (out of scope: it's a message string) UNLESS trivially adjustable to "Welcome — you're now part of {shop's} loyalty program!" Only change if it's a one-line string swap; do not alter control flow.
- [ ] `pnpm check && pnpm build` green; commit `feat: sharpen /c join copy`.

---

## Self-Review

**Spec coverage (Part 1–2):** tab bar + 4 tabs (Task 1); Counter shrunk to identify+act (Task 2); Activity + Grow moved verbatim (Tasks 3–4); Scan-first (Task 5); join framing (Task 6). No schema, no new actions — matches "pure reorg" scope. qkit auto-earn explicitly out of scope (spec Part 2).

**Placeholder scan:** every task names the exact source block being moved and its exact destination; no "handle appropriately" language.

**Type consistency:** no new types — `ServeCustomer`, `stampAction` etc. signatures are unchanged throughout; only JSX position/route location moves.
