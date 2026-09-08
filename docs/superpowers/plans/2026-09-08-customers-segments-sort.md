# Customers segments and sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the vendor-level Customers list (no `?p=`), add segment chips (all / reward ready / new this week / not seen 30d+), a sort control (last visit / longest away / closest to reward), and a "Serve" action on every row that opens that customer at the counter.

**Architecture:** `listVendorCustomers` fetches a little more per customer (first-seen date, per-card stamp progress, the most-recent card's program). `aggregateCustomers` computes two derived fields (`rewardReady`, `bestGap`). Pure `customerSegment` / `sortCustomers` functions in a new `customer-segments.ts` do the filtering and ordering. `customers/page.tsx`'s vendor branch reads `?seg=` and `?sort=` from `searchParams`, renders the chips as links and the sort as a `<Select>`, and `VendorCustomerList` takes the already-filtered-and-sorted rows plus renders a Serve `Link` per row. The program-scoped branch (`?p=`) is untouched.

**Tech Stack:** Next.js 16 server components, shadcn `Select` (installed), Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-09-08-vendor-dashboard-redesign-design.md` (sub-plan 5 of 5)

**Depends on:** nothing. Independent of sub-plans 1-4. (The Serve link points at `/dashboard/counter?p=...&phone=...`; that route works today and is only polished by sub-plan 4.)

**Visual source of truth:** the approved mockup, Customers screen (`<div class="screen" data-name="customers">`, lines ~853-943): the `search-bar`, `cust-controls` (`seg-chips` + `cust-sort`), and `cust-list` with per-row `init` avatar, name, sub line, mini progress, and `serve-btn`.

## Global Constraints

- Pin exact dependency versions. This plan adds none.
- **No em dashes** in user-facing copy or code comments. The current `customers/page.tsx` uses the literal `"—"` as a fallback program name in `aggregateCustomers`; convert any line you touch to `"unknown"` or similar words.
- TypeScript strict.
- Validate `?seg=` / `?sort=` against a known set (fall back to the default on anything else) - a `z.enum` or a plain allowlist.
- Authorization in RLS. `listVendorCustomers` is already RLS-scoped. No service-role.
- No `isPro()` checks.
- CI gate: changed-line coverage >= 80%. Pure functions in `test/lib/`, the component in `customers-page.dom.test.tsx` with plain props.
- Every PR touches `CHANGELOG.md` and keeps every changed folder's `README.md` current in the same commit, including a root `README.md` running-narrative sentence.

## Metric definitions (from the spec, research-checked)

- **reward ready** = the customer has at least one card at or past its program's `stamps_required`.
- **new this week** = `first_seen_at` within the last 7 days.
- **not seen 30d+** = `last_seen_at` is older than 30 days.
- **all** = every customer.
- These segments are not mutually exclusive in principle (a new customer could also be reward-ready); the chip filters are independent views, not a partition. Counts on each chip are that segment's size.
- **closest to reward** sort = ascending by `bestGap` (fewest stamps from a reward first); customers with no card / no gap sort last.

## File Structure

- `src/lib/customers.ts` (modify) - `VendorCustomerRow` gains `firstSeenAt`, `rewardReady`, `bestGap`, `recentProgramId`, `recentProgramName`; `aggregateCustomers` computes them; `listVendorCustomers` fetches `first_seen_at` and `stamp_count` is already fetched, add `program_id` ordering data.
- `test/lib/customers.test.ts` (modify) - the new derived fields.
- `src/lib/customer-segments.ts` (create) - `CustomerSegment`, `CustomerSort`, `customerSegment`, `filterBySegment`, `sortCustomers`, `segmentCounts`.
- `test/lib/customer-segments.test.ts` (create).
- `src/app/dashboard/customers/page.tsx` (modify) - vendor branch only: read `?seg=`/`?sort=`, render chips + sort, pass filtered/sorted rows to `VendorCustomerList`.
- `src/app/dashboard/customers/customers-page.dom.test.tsx` (modify).
- `src/app/dashboard/customers/customer-controls.tsx` (create) - `"use client"` sort `<Select>` that pushes `?sort=` (the chips can be plain server-rendered `<Link>`s; only the `<Select>` needs client for the onChange navigation). + test.
- `CHANGELOG.md`, `src/lib/README.md`, `src/app/dashboard/customers/README.md`, root `README.md` (modify).

---

### Task 1: `VendorCustomerRow` derived fields

**Files:** `src/lib/customers.ts`, `test/lib/customers.test.ts`

**Interfaces:**

- `VendorCustomerRow` gains:
  - `firstSeenAt: string` (from `customers.first_seen_at`)
  - `rewardReady: boolean` - any of this phone's cards has `stamp_count >= that program's stamps_required`
  - `bestGap: number | null` - `min` over the phone's cards of `max(0, stamps_required - stamp_count)`; `null` when the phone has no cards
  - `recentProgramId: string | null`, `recentProgramName: string | null` - the program of the card with the latest `updated_at` (for the Serve link target); `null` when no cards
- `aggregateCustomers` signature gains a `programsById: Record<string, { name: string; stampsRequired: number }>` argument (replacing / extending the current `programNameById: Record<string, string>`). Update all call sites (`listVendorCustomers`).
- `CardFields` gains `stamps_required` is NOT on the card row; it is on the program. Pass program data in. `CardFields` gains `updated_at: string` and keeps `stamp_count`, `program_id`, `phone`.

- [ ] **Step 1: Update the failing test** `test/lib/customers.test.ts` (`aggregateCustomers` describe):

```ts
it("derives rewardReady, bestGap, and the most-recent program", () => {
  const customers = [
    {
      phone: "+6591110000",
      name: "A",
      first_seen_at: "2026-09-01T00:00:00Z",
      last_seen_at: "2026-09-08T00:00:00Z",
    },
  ];
  const cards = [
    {
      phone: "+6591110000",
      program_id: "p1",
      stamp_count: 7,
      updated_at: "2026-09-05T00:00:00Z",
    },
    {
      phone: "+6591110000",
      program_id: "p2",
      stamp_count: 9,
      updated_at: "2026-09-08T00:00:00Z",
    },
  ];
  const programsById = {
    p1: { name: "Stamp Card", stampsRequired: 8 },
    p2: { name: "Sprout Club", stampsRequired: 10 },
  };
  const [row] = aggregateCustomers(customers, cards, programsById);
  expect(row.bestGap).toBe(1); // p1: 8-7=1, p2: 10-9=1
  expect(row.rewardReady).toBe(false);
  expect(row.recentProgramId).toBe("p2"); // latest updated_at
  expect(row.recentProgramName).toBe("Sprout Club");
  expect(row.firstSeenAt).toBe("2026-09-01T00:00:00Z");
});

it("rewardReady is true when a card is at or past its requirement", () => {
  const [row] = aggregateCustomers(
    [
      {
        phone: "+6591110001",
        name: null,
        first_seen_at: "2026-09-01T00:00:00Z",
        last_seen_at: "2026-09-08T00:00:00Z",
      },
    ],
    [
      {
        phone: "+6591110001",
        program_id: "p1",
        stamp_count: 8,
        updated_at: "2026-09-08T00:00:00Z",
      },
    ],
    { p1: { name: "Stamp Card", stampsRequired: 8 } },
  );
  expect(row.rewardReady).toBe(true);
  expect(row.bestGap).toBe(0);
});

it("null progress fields when the phone has no cards", () => {
  const [row] = aggregateCustomers(
    [
      {
        phone: "+6591110002",
        name: null,
        first_seen_at: "2026-09-01T00:00:00Z",
        last_seen_at: "2026-09-08T00:00:00Z",
      },
    ],
    [],
    {},
  );
  expect(row.bestGap).toBeNull();
  expect(row.rewardReady).toBe(false);
  expect(row.recentProgramId).toBeNull();
});
```

Update the existing `aggregateCustomers` tests in that file for the new `programsById` argument shape and the added row fields.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** in `customers.ts`:
  - Widen `CustomerFields` with `first_seen_at: string`.
  - `CardFields` = `{ phone: string; program_id: string; stamp_count: number; updated_at: string }` (drop `reward_count` if unused after this change - check the current `totalRewards` computation; keep `reward_count` in the query + type if still needed).
  - `aggregateCustomers(customers, cards, programsById)`: per phone, over its cards compute `rewardReady` (any `stamp_count >= programsById[program_id]?.stampsRequired`), `bestGap` (min of `max(0, req - count)`, `null` if no cards or no matching program), and `recentProgramId`/`recentProgramName` (card with max `updated_at`). Keep `programNames`, `totalStamps`, `totalRewards`, `lastSeenAt`, sort by `lastSeenAt` desc as today.
  - `listVendorCustomers`: select `phone,name,first_seen_at,last_seen_at` from `customers`; select `phone,program_id,stamp_count,reward_count,updated_at` from `cards`; build `programsById` from `listPrograms()` (`{ name, stampsRequired: p.stamps_required }`).

- [ ] **Step 4: Run `pnpm exec vitest run test/lib/customers.test.ts` + `tsc --noEmit`.** Green. Fix the `customers/page.tsx` `aggregateCustomers` / `VendorCustomerList` call sites so the build still compiles (full wiring is Task 3; here just keep it type-correct, e.g. pass the new arg).

- [ ] **Step 5: Commit** - `git commit -m "feat(customers): derive rewardReady, bestGap, recent program per customer"`

---

### Task 2: `customer-segments.ts`

**Files:** `src/lib/customer-segments.ts`, `test/lib/customer-segments.test.ts`

**Interfaces:**

```ts
import type { VendorCustomerRow } from "@/lib/customers";

export type CustomerSegment = "all" | "ready" | "new" | "lapsed";
export type CustomerSort = "recent" | "away" | "progress";

export const CUSTOMER_SEGMENTS: CustomerSegment[];
export const CUSTOMER_SORTS: CustomerSort[];

// Which segments a row belongs to (a row can be in several).
export function customerSegments(
  row: VendorCustomerRow,
  nowMs: number,
): CustomerSegment[];

export function filterBySegment(
  rows: VendorCustomerRow[],
  seg: CustomerSegment,
  nowMs: number,
): VendorCustomerRow[];

export function sortCustomers(
  rows: VendorCustomerRow[],
  sort: CustomerSort,
): VendorCustomerRow[];

export function segmentCounts(
  rows: VendorCustomerRow[],
  nowMs: number,
): Record<CustomerSegment, number>;

// Parse an untrusted query value, default when unknown.
export function parseSegment(v: string | undefined): CustomerSegment; // default "all"
export function parseSort(v: string | undefined): CustomerSort; // default "recent"
```

Rules:

- `customerSegments`: always includes `"all"`. Includes `"ready"` when `row.rewardReady`. Includes `"new"` when `Date.parse(row.firstSeenAt) >= nowMs - 7*86_400_000`. Includes `"lapsed"` when `Date.parse(row.lastSeenAt) < nowMs - 30*86_400_000`. Skip a segment on an unparseable date, never throw.
- `filterBySegment(rows, "all", ...)` returns rows unchanged (already `lastSeenAt`-desc from `aggregateCustomers`).
- `sortCustomers`:
  - `"recent"`: `lastSeenAt` desc (newest first).
  - `"away"`: `lastSeenAt` asc (oldest first).
  - `"progress"`: `bestGap` asc; `null` gaps last; tie-break `lastSeenAt` desc.
  - Return a new array; do not mutate the input.
- `segmentCounts`: one pass, `{ all, ready, new, lapsed }`.

- [ ] **Step 1: Failing tests** - fixtures with a fixed `now = Date.UTC(2026, 8, 8, 4, 0, 0)` and an `iso(daysAgo)` helper (mirror `test/lib/stats.test.ts`'s pattern). Cover:
  - a row seen 2 days ago, first seen 3 days ago -> segments `["all","new"]`.
  - a row `rewardReady:true` seen today -> `["all","ready"]`.
  - a row last seen 31 days ago -> `["all","lapsed"]`; last seen exactly 30 days ago -> NOT lapsed (half-open).
  - first seen exactly 7 days ago -> still "new" (`>=`); 8 days -> not.
  - `sortCustomers` `"progress"`: `[gap 3, gap null, gap 1]` -> order `[gap1, gap3, null]`.
  - `sortCustomers` `"away"`: oldest `lastSeenAt` first.
  - `segmentCounts` totals.
  - `parseSegment("garbage")` -> `"all"`; `parseSort(undefined)` -> `"recent"`; `parseSegment("ready")` -> `"ready"`.
  - unparseable `firstSeenAt` -> row still in `"all"`, not in `"new"`, no throw.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(customers): pure segment + sort helpers"`

---

### Task 3: `customer-controls.tsx` + wire `customers/page.tsx`

**Files:** `src/app/dashboard/customers/customer-controls.tsx`, `customer-controls.dom.test.tsx`, `src/app/dashboard/customers/page.tsx`, `customers-page.dom.test.tsx`

**Interfaces:**

- `<CustomerControls sort={CustomerSort} basePath="/dashboard/customers" preservedParams={Record<string,string>} />` - `"use client"`. A shadcn `Select` (installed) bound to `sort`; on change, `router.push` with `sort` set and the preserved params (`q`, `seg`) kept. Label "Sort". Options: "Last visit" (`recent`), "Longest away" (`away`), "Closest to reward" (`progress`).
- `VendorCustomerList` gains a `nowMs` prop (for relative-time display, if not already) and renders per row: the `init` avatar (first letter of `name` or `#`), name-or-phone `Link` to the detail page, a sub line `"{recentProgramName ?? programNames[0]} , last seen {relative}"` or `"joined {relative}"` for new rows, a mini progress indicator (`bestGap === 0` -> a "Ready" badge; else `"{req - gap}/{req}"` - but we do not have `req` on the row; **add `recentProgramStampsRequired: number | null` to `VendorCustomerRow` in Task 1**, OR show `bestGap` as `"{bestGap} to go"` which needs no requirement. Prefer `"{bestGap} to go"` / `"Ready"` / no indicator when `bestGap === null`.), and a "Serve" `Link` to `/dashboard/counter?p=${recentProgramId}&phone=${encodeURIComponent(phone)}` shown only when `recentProgramId !== null`.

Simplify the mini progress: use `bestGap`. `null` -> nothing. `0` -> "Ready" badge. `n` -> `"{n} to go"`. This avoids needing `stamps_required` on the row. (If a nicer seals visual is wanted, that is a follow-up.)

- [ ] **Step 1: Failing tests**
  - `customer-controls.dom.test.tsx` (jsdom, mock `next/navigation`): renders 3 options; changing the select to "Closest to reward" calls `router.push` with `sort=progress` and keeps a passed `q`/`seg`.
  - `customers-page.dom.test.tsx`: mock `@/lib/customers` `listVendorCustomers` to return a small fixed row set, mock `@/features/auth`, `@/lib/program` `listPrograms` (2 programs so the vendor branch renders). Assert:
    - the 4 segment chips render with counts, `?seg=ready` link present.
    - `?seg=lapsed` in `searchParams` -> only lapsed rows shown.
    - `?sort=away` -> rows in oldest-last-seen-first order.
    - each shown row has a "Serve" link to `/dashboard/counter?p=...&phone=...`.
    - the program-scoped branch (`?p=` set) is unchanged (a smoke assertion that it still renders the card list).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement**
  - `customers/page.tsx` vendor branch (`!p`):
    - `const { q, p, seg: segRaw, sort: sortRaw } = await searchParams;` widen the `searchParams` type with `seg?: string; sort?: string`.
    - `const seg = parseSegment(segRaw); const sort = parseSort(sortRaw); const nowMs = Date.now();`
    - `const all = await listVendorCustomers(q);`
    - `const counts = segmentCounts(all, nowMs);`
    - `const rows = sortCustomers(filterBySegment(all, seg, nowMs), sort);`
    - Render the search form (unchanged), then a `cust-controls` row: the 4 chips as `<Link>`s (`?seg=<x>` preserving `q` and `sort`), `aria-current` / a selected style on the active one, each with its count from `counts`; and `<CustomerControls sort={sort} preservedParams={{ q, seg }} />`.
    - `<VendorCustomerList customers={rows} nowMs={nowMs} />`.
    - Keep the `programs.length === 1` redirect and the `!p`-with-`ProgramSwitcher` handling as today (the `ProgramSwitcher` "All programs" control stays).
  - Sweep em dashes / `"—"` from the file.
- [ ] **Step 4: `pnpm build` + `pnpm check` + `pnpm test`.** Green.
- [ ] **Step 5: Commit** - `git commit -m "feat(customers): segment chips, sort control, Serve per row"`

---

### Task 4: CHANGELOG + READMEs

- [ ] **`CHANGELOG.md`** `### Added`: `The vendor Customers list has segment chips (all / reward ready / new this week / not seen 30d+), a sort control (last visit / longest away / closest to reward), and a Serve action on every row.`
- [ ] **`src/lib/README.md`** - update the `customers.ts` entry (new `VendorCustomerRow` fields, `aggregateCustomers` signature) and add a `customer-segments.ts` entry.
- [ ] **`test/lib/README.md`** - add/adjust the `customers.test.ts` and new `customer-segments.test.ts` entries.
- [ ] **`src/app/dashboard/customers/README.md`** - describe the segment/sort controls, `customer-controls.tsx`, and the per-row Serve link; note the `?p=` branch is unchanged.
- [ ] **Root `README.md`** - one sentence: `Sub-plan 5 landed: the Customers list has segment chips, a sort control, and Serve on every row. The vendor-dashboard redesign (spec 2026-09-08) is complete.`
- [ ] **Commit** - `git commit -m "docs: Customers segments and sort across CHANGELOG and folder READMEs"`

---

## Self-Review

- **Spec coverage:** segment chips all/reward-ready/new/lapsed (Task 2, 3), sort last-visit/longest-away/closest-to-reward (Task 2, 3), Serve on every row -> counter for that customer's program (Task 1's `recentProgramId`, Task 3's link). The spec also says "Customers list sorts by last visit (add a sort control)" - default `sort` is `recent` (last visit), matching today's `aggregateCustomers` order. Covered.
- **Scope:** only the vendor-level branch (`!p`) changes. The program-scoped branch and `getCustomerDetail` / `customers/[phone]` are untouched.
- **Type consistency:** `CustomerSegment` / `CustomerSort` defined once in `customer-segments.ts`. `VendorCustomerRow`'s new fields defined once in `customers.ts`, consumed by `customer-segments.ts` and `VendorCustomerList`. `aggregateCustomers`'s new `programsById` arg shape (`{ name, stampsRequired }`) is consistent between Task 1's implementation and `listVendorCustomers`.
- **Placeholder scan:** the mini-progress indicator was simplified to `bestGap`-only after noticing `stamps_required` is not on the row; the plan states the choice rather than leaving "show progress somehow".

## Execution Handoff

Subagent-driven. Cheap model for Task 2, 4. Standard model for Tasks 1, 3.
