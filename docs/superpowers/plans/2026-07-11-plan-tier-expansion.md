# Plan/pricing tier expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-purpose `canCreateProgram(count, pro)` gate
with a small `Entitlement` resolver (`getEntitlement(pro)` → `{ tier,
maxActivePrograms }`), then use that object to back a richer, honest
Free/Pro comparison table on `/dashboard/plan`.

**Architecture:** Two tiers only (`free`/`pro`), no third tier — a
loyalty program has no natural time-boxed unit of sale the way qkit's
per-event "pass" tier does, so that part of qkit's model doesn't port.
What does port is qkit's split between "read the vendor's raw plan state"
(`isPro()`, unchanged) and "resolve it to capabilities" (`getEntitlement`,
new, pure). The object starts at one axis (`maxActivePrograms`) because
that's the only thing Pro actually gates in this codebase today — no
speculative fields.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Vitest.

## Global Constraints

- Two tiers: `free` / `pro`. No third tier is added by this plan.
- `vendor_pro` stays the source of truth for Pro status
  (`src/lib/program.ts:313-322`, `isPro()`) — unchanged, no
  `licenseExpiresAt`/time-boxed license concept.
- The free-tier cap itself (1 active program) is not touched — only how
  the cap is represented in code.
- No new Pro-gated capability beyond program count — the comparison table
  only lists features that are genuinely identical across tiers today
  (no invented differentiation).
- `canCreateProgram`'s two call sites (`src/app/setup/page.tsx`,
  `src/app/setup/actions.ts`) keep the same call shape — `getEntitlement(pro)`
  then `canCreateProgram(ent, count)` — behavior identical to today's
  `canCreateProgram(count, pro)`, only the signature changes.

---

### Task 1: `Entitlement` object + `canCreateProgram` signature change

**Files:**

- Modify: `src/lib/program.ts` (add `Tier`/`Entitlement`/`getEntitlement`
  above `canCreateProgram` at line 307-310; change `canCreateProgram`'s
  signature)
- Modify: `test/lib/program-access.test.ts` (existing `canCreateProgram`
  tests at lines 44-59 — update call shape; add `getEntitlement` tests)
- Modify: `src/app/setup/page.tsx` (call site at lines 39-43)
- Modify: `src/app/setup/actions.ts` (call site at lines 88-92)

**Interfaces:**

- Produces: `Tier = "free" | "pro"`; `Entitlement { tier: Tier;
maxActivePrograms: number | null }`; `getEntitlement(pro: boolean):
Entitlement`; `canCreateProgram(ent: Entitlement, activeCount: number):
boolean` (replaces the old `(count: number, pro: boolean)` signature —
  this is a breaking rename of an exported function's parameters, both
  call sites must update in the same commit or the build fails).
- Consumes: nothing new.

- [ ] **Step 1: Add the entitlement type + resolver, change
      `canCreateProgram`'s signature**

  In `src/lib/program.ts`, replace the existing `canCreateProgram` (lines
  307-310) with:

  ```typescript
  export type Tier = "free" | "pro";

  export interface Entitlement {
    tier: Tier;
    maxActivePrograms: number | null; // null = unlimited
  }

  const FREE: Entitlement = { tier: "free", maxActivePrograms: 1 };
  const PRO: Entitlement = { tier: "pro", maxActivePrograms: null };

  // Resolves a vendor's raw plan state (isPro's DB read) to what they can
  // actually do. Starts at one axis because program count is the only
  // thing Pro gates today — add fields here, not new ad-hoc isPro()
  // branches, when a second gate is actually needed.
  export function getEntitlement(pro: boolean): Entitlement {
    return pro ? PRO : FREE;
  }

  // Pure: whether the vendor can create another active program under
  // their entitlement.
  export function canCreateProgram(
    ent: Entitlement,
    activeCount: number,
  ): boolean {
    return (
      ent.maxActivePrograms === null || activeCount < ent.maxActivePrograms
    );
  }
  ```

  Leave `isPro()` (lines 313-322) untouched — it's still the DB read;
  `getEntitlement` is a pure layer on top.

- [ ] **Step 2: Update `test/lib/program-access.test.ts`**

  Replace the `canCreateProgram` describe block (lines 44-59) with:

  ```typescript
  import {
    currentProgram,
    canCreateProgram,
    getEntitlement,
  } from "@/lib/program";

  describe("getEntitlement", () => {
    it("free vendor gets a 1-active-program cap", () => {
      expect(getEntitlement(false)).toEqual({
        tier: "free",
        maxActivePrograms: 1,
      });
    });

    it("pro vendor gets unlimited", () => {
      expect(getEntitlement(true)).toEqual({
        tier: "pro",
        maxActivePrograms: null,
      });
    });
  });

  describe("canCreateProgram", () => {
    it("lets a free vendor create their first program", () => {
      expect(canCreateProgram(getEntitlement(false), 0)).toBe(true);
    });

    it("blocks a free vendor at the one-program limit", () => {
      expect(canCreateProgram(getEntitlement(false), 1)).toBe(false);
      expect(canCreateProgram(getEntitlement(false), 2)).toBe(false);
    });

    it("lets a Pro vendor create regardless of count", () => {
      expect(canCreateProgram(getEntitlement(true), 0)).toBe(true);
      expect(canCreateProgram(getEntitlement(true), 1)).toBe(true);
      expect(canCreateProgram(getEntitlement(true), 50)).toBe(true);
    });
  });
  ```

  Same import line already brings in `currentProgram` — just add
  `getEntitlement` to it (existing `currentProgram` describe block,
  lines 17-42, is untouched).

- [ ] **Step 3: Update `src/app/setup/page.tsx`'s call site**

  Line 7: add `getEntitlement` to the `@/lib/program` import alongside
  `canCreateProgram`. Lines 39-43:

  ```typescript
  const pro = await isPro();
  const canCreate = canCreateProgram(
    getEntitlement(pro),
    programs.filter((p) => p.active).length,
  );
  ```

- [ ] **Step 4: Update `src/app/setup/actions.ts`'s call site**

  Line 12: add `getEntitlement` to the `@/lib/program` import alongside
  `canCreateProgram`. Lines 88-92:

  ```typescript
  const programs = await listPrograms();
  const pro = await isPro();
  if (
    !canCreateProgram(
      getEntitlement(pro),
      programs.filter((p) => p.active).length,
    )
  ) {
    return { error: UPSELL_ERROR };
  }
  ```

- [ ] **Step 5: Verify**

  Run `pnpm test` — `program-access.test.ts` passes, and grep the repo
  for any other `canCreateProgram(` call site the search above didn't
  catch (`test/app/save-program-action.test.ts` and
  `test/app/change-type-action.test.ts` call `saveProgramAction`/
  `changeTypeAction` directly and mock Supabase, not `canCreateProgram`
  itself — confirm they don't also assert on the old two-arg call shape
  before moving on). Run `pnpm check` (prettier + eslint + tsc). Commit:
  `refactor: entitlement object, canCreateProgram(ent, count) signature`.

---

### Task 2: Richer, honest comparison table — `/dashboard/plan`

**Files:**

- Modify: `src/app/dashboard/plan/page.tsx` (table at lines 83-94)

**Interfaces:**

- Consumes: nothing new — purely presentational, no new data fetch. The
  page already has `pro` from `isPro()` (line 26); no need to fetch
  `getEntitlement` here since the table's Free/Pro columns are static
  copy, not derived from the signed-in vendor's own tier.

- [ ] **Step 1: Replace the one-row table**

  Replace lines 83-94 with a 4-row table covering every real,
  user-visible Free/Pro difference confirmed to exist in the codebase
  today (program count only differs; templates/type-change/stats are
  identical on both tiers — listed for completeness, not as gates):

  ```tsx
  const FEATURES = [
    { label: "Loyalty programs", free: "1", pro: "Unlimited" },
    { label: "Loyalty card templates", free: true, pro: true },
    { label: "Change card type", free: true, pro: true },
    { label: "Stats dashboard", free: true, pro: true },
  ] as const;
  ```

  ```tsx
  <div className="overflow-hidden rounded-2xl border">
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <span>Feature</span>
      <span className="text-center">Free</span>
      <span className="text-center">Pro</span>
    </div>
    {FEATURES.map((f) => (
      <div
        key={f.label}
        className="grid grid-cols-[1fr_auto_auto] items-center gap-x-5 border-t px-5 py-3 text-sm"
      >
        <span>{f.label}</span>
        <span className="text-center text-muted-foreground">
          {typeof f.free === "string" ? f.free : <Cell on={f.free} />}
        </span>
        <span className="text-center">
          {typeof f.pro === "string" ? f.pro : <Cell on={f.pro} />}
        </span>
      </div>
    ))}
  </div>
  ```

  `Cell` (lines 8-18) is reused as-is, no change needed. Placing the
  `pro` column's string branch outside `Cell` matches `Cell`'s existing
  contract (it renders a check/dash, not arbitrary text) — the "Unlimited"
  string needs its own branch same as "1" does today.

- [ ] **Step 2: Verify**

  Run `pnpm dev`, open `/dashboard/plan` as both a free and Pro vendor
  (toggle via the admin `vendor_pro` table or existing test fixture),
  confirm all 4 rows render correctly in both states, no layout shift
  from the 3-column grid. Run `pnpm check`. Commit:
  `feat: expand plan comparison table with real Free/Pro differences`.
