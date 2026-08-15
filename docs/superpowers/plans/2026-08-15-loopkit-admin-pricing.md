# loopkit Admin-Tunable Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give loopkit its first-ever live Pro price — **$4.99/mo**,
admin-tunable from `/admin` with no redeploy — via a new single-row
`loopkit.pricing` table, a `setPricing` server action, `@merqo/ui`'s new
generalized `PricingForm` component wired into the existing `/admin` page,
and a live price display on `/dashboard/plan` replacing today's "no card
needed yet" copy. The manual "ask us" grant flow (`requestUpgrade`,
`UpgradeCta`, `setVendorPro`, `resolveUpgradeRequest`) is untouched — this
is a display/expectation-setting change, not a checkout change.

**Spec:** `docs/superpowers/specs/2026-08-15-loopkit-admin-pricing-design.md`

**Architecture:** New `loopkit.pricing` table (migration `0034`), a
`PricingConfig`/`getPricing()`/`DEFAULT_PRICING` module (`src/lib/
pricing.ts`), a `pricingFormSchema` in the existing `src/lib/schemas.ts`, a
fifth admin action (`setPricing`) alongside the existing four in `src/app/
admin/actions.ts`, a thin client wrapper (`PricingFormClient`) around
`@merqo/ui`'s presentational `PricingForm`, and a live-price read on both
`/admin` and `/dashboard/plan`.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Zod ·
`@supabase/ssr` · Vitest + Testing Library (`@vitest-environment jsdom` for
dom tests) · pnpm.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every action boundary
  (`pricingFormSchema`).
- Authorization lives in RLS + `requireAdmin()`, never widened app-side.
  `setPricing` must 404 a non-admin via `requireAdmin()` before any read or
  write, exactly like `setProgramActive`/`setVendorPro`/`removeCard`/
  `resolveUpgradeRequest` already do in the same file.
- The `pricing` table has **no write RLS policy** — every write goes
  through the service-role client inside `setPricing`, never a direct
  client-side Supabase call.
- SQL migrations in this project are hand-verified, not automated-tested
  (no linked Supabase CLI in this environment) — the migration task ends
  with a manual review checklist, not a test-runner step. The user applies
  it by hand via the Supabase dashboard SQL editor.
- `src/lib/types.ts` is a hand-written mirror (no live codegen available) —
  update it in the same task as the migration, keeping the `loopkit`
  schema key in sync.
- **Do not touch** `requestUpgrade`, `UpgradeCta`, `setVendorPro`,
  `resolveUpgradeRequest`, or the `upgrade_requests` table. The manual
  grant flow is explicitly out of scope (see spec's "What stays
  unchanged").
- **Do not** add a day-pass/event-pass field. loopkit's `pricing` table has
  exactly one price field, `monthly_cents` — no `event_pass_cents` (qkit-only
  concept, per the cross-kit pricing doc).
- This plan has a hard cross-repo dependency: `@merqo/ui`'s `PricingForm`
  export must actually be published before Task 5 can start. Do not stub or
  fake the import — block on the real dependency (see Task 5, Step 0).
- Follow existing project conventions exactly: `ActionResult<T>`
  discriminated result type for server actions, `vi.hoisted` + `vi.mock`
  mocking style in tests (see `src/app/dashboard/profile/actions.test.ts`
  and `src/app/dashboard/plan/plan-page.dom.test.tsx` as the two closest
  precedents), Tailwind class patterns already used in the file being
  edited.
- Run `pnpm check` (prettier --check + eslint + tsc --noEmit) and `pnpm
  test` before every commit that touches app code. Run `pnpm build` before
  the final task's verification gate — `pnpm check`/`pnpm test` miss
  Next.js client/server bundle-boundary errors, and this plan adds a new
  Client Component (`PricingFormClient`) importing a Server Action.

---

### Task 0: Branch setup

**Files:** none

- [ ] **Step 1: Create and switch to a feature branch off `main`**

```bash
git fetch origin main
git checkout -b feat/admin-pricing origin/main
```

- [ ] **Step 2: Confirm baseline tests pass**

Run: `pnpm test`
Expected: all existing tests PASS.

---

### Task 1: `loopkit.pricing` migration + hand-updated types

**Files:**

- Create: `supabase/migrations/0034_loopkit_pricing.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**

- Produces: `loopkit.pricing` table (`id` pinned `1`, `monthly_cents`,
  `currency`, `updated_at`), seeded at 499 cents ($4.99); `Database["loopkit"]
["Tables"]["pricing"]` type; a new `Pricing` convenience alias (loopkit's
  `types.ts` has none yet — this is the first; qkit's own `types.ts` has the
  identical-shaped alias to follow).

- [ ] **Step 1: Write the migration**

```sql
-- 0034 — admin-editable pricing: a single-row config so the vendor plan
-- page can show a live price and admins can tune it without a deploy. id
-- is pinned to 1. Seeded at 499 (= $4.99/mo) — loopkit's first-ever live
-- price (see docs/superpowers/specs/2026-08-15-loopkit-admin-pricing-
-- design.md for why this seeds a real number, not 0).

create table loopkit.pricing (
  id            int primary key default 1 check (id = 1),
  monthly_cents int not null default 0,
  currency      text not null default 'SGD',
  updated_at    timestamptz not null default now()
);

insert into loopkit.pricing (id, monthly_cents) values (1, 499)
  on conflict (id) do nothing;

alter table loopkit.pricing enable row level security;

-- Prices aren't secret — anyone signed in may read (the plan page is
-- behind auth already; a public-read policy just keeps this simple and
-- leaks nothing). Writes go through the service-role setPricing action
-- only — no insert/update/delete policy.
create policy pricing_public_select on loopkit.pricing
  for select using (true);

-- Data-API grants (be explicit, matching 0003's admin_audit precedent).
grant select on loopkit.pricing to authenticated;
grant all on loopkit.pricing to service_role;
```

- [ ] **Step 2: Hand-update `src/lib/types.ts`**

Add a `pricing` entry alongside the other `Tables` members (near
`admin_audit`, same file section):

```ts
pricing: {
  Row: {
    id: number;
    monthly_cents: number;
    currency: string;
    updated_at: string;
  };
  Insert: {
    id?: number;
    monthly_cents?: number;
    currency?: string;
    updated_at?: string;
  };
  Update: {
    id?: number;
    monthly_cents?: number;
    currency?: string;
    updated_at?: string;
  };
  Relationships: [];
};
```

Add the convenience alias at the bottom of the file, next to any other
`Database["loopkit"]["Tables"][...]["Row"]`-shaped exports (loopkit has
none yet — this establishes the first, mirroring qkit's `export type
Pricing = Database["qkit"]["Tables"]["pricing"]["Row"];`):

```ts
export type Pricing = Database["loopkit"]["Tables"]["pricing"]["Row"];
```

- [ ] **Step 3: Manual review checklist (no automated test for SQL in this project)**

  - [ ] `id` is `int primary key default 1 check (id = 1)` — singleton
        pattern matches qkit's `pricing` table exactly.
  - [ ] Seed value is `499`, not `0` — confirms the "launch, not
        DB-read-failure-fallback" distinction from the spec.
  - [ ] No `insert`/`update`/`delete` policy exists — writes must fail
        under RLS for a normal `authenticated` client, only succeed via
        `service_role`.
  - [ ] `grant select ... to authenticated` present (public-read policy
        alone doesn't grant table-level access — both are required,
        matching every other RLS table in this schema).
  - [ ] The user applies this migration by hand via the Supabase
        dashboard SQL editor before Task 4 can be exercised against a
        real database (local dev / CI mocks the Supabase client for
        every other task in this plan, so this is not a hard blocker for
        Tasks 2–8, only for a real end-to-end smoke test).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0034_loopkit_pricing.sql src/lib/types.ts
git commit -m "feat: add loopkit.pricing table, seeded at \$4.99/mo"
```

---

### Task 2: `src/lib/pricing.ts` — config type, fallback, live read

**Files:**

- Create: `src/lib/pricing.ts`

**Interfaces:**

- Consumes: `Pricing` (Task 1), `createServerClient` (`@/lib/supabase/
server`).
- Produces: `PricingConfig`, `DEFAULT_PRICING`, `getPricing()` — consumed
  by Task 4 (admin page) and Task 6 (plan page).

No test file for this task — mirrors qkit's own untested `src/lib/
pricing.ts`, which is a type + constant + one thin read, exercised
indirectly through the pages that call it (Tasks 4 and 6's dom tests cover
the read path via mocks).

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/pricing.ts
import { createServerClient } from "@/lib/supabase/server";
import type { Pricing } from "@/lib/types";

/** Shape the plan page + admin form consume (subset of the `pricing` row). */
export type PricingConfig = Pick<Pricing, "monthly_cents" | "currency">;

/**
 * Fallback when the `pricing` row can't be read (e.g. pre-migration, or a
 * transient read failure). Zeroed so a page renders without throwing — this
 * is a safety net, not loopkit's real price. In steady state the DB row
 * (seeded at 499 = $4.99, admin-tunable from /admin) is what every page
 * actually reads.
 */
export const DEFAULT_PRICING: PricingConfig = {
  monthly_cents: 0,
  currency: "SGD",
};

/** The live, admin-tunable price row. RLS is public-select, so this is safe
 * to call from any signed-in context (vendor plan page, admin page) with
 * the ordinary cookie-scoped client — no service-role client needed here. */
export async function getPricing(): Promise<PricingConfig> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("pricing")
    .select("monthly_cents, currency")
    .eq("id", 1)
    .maybeSingle();
  return data ?? DEFAULT_PRICING;
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS — confirms `Pricing`/`Database["loopkit"]["Tables"]
["pricing"]` from Task 1 line up with this file's usage.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pricing.ts
git commit -m "feat: add PricingConfig/getPricing for the live loopkit price"
```

---

### Task 3: `pricingFormSchema` + `MAX_MONEY_CENTS`

**Files:**

- Modify: `src/lib/schemas.ts`

**Interfaces:**

- Produces: `MAX_MONEY_CENTS`, `pricingFormSchema`, `PricingFormInput` —
  consumed by Task 4's `setPricing`.

No dedicated schema test file (loopkit's `schemas.ts` has none today) —
`pricingFormSchema`'s validation behavior (rejects negative/oversized
input) is exercised directly through Task 4's `setPricing` tests, which is
this project's existing pattern for every other action-bound Zod schema in
this file (`loginSchema`, `supportMessageSchema` are both exercised only
through their consuming actions' tests, not standalone).

- [ ] **Step 1: Write the implementation**

Append to `src/lib/schemas.ts`:

```ts
// A generous but real ceiling (S$10,000) so a forged/garbled form payload
// can't write an absurd price — same sentinel value qkit's schemas.ts uses
// for every money field.
export const MAX_MONEY_CENTS = 10_000_00;

export const pricingFormSchema = z.object({
  monthly_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS),
});
export type PricingFormInput = z.infer<typeof pricingFormSchema>;
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat: add pricingFormSchema and MAX_MONEY_CENTS"
```

---

### Task 4: `setPricing` server action

**Files:**

- Modify: `src/app/admin/actions.ts`
- Create: `src/app/admin/actions.test.ts`

**Interfaces:**

- Consumes: `pricingFormSchema`/`PricingFormInput` (Task 3), `requireAdmin`
  (`@/lib/admin`), `createServiceClient` (`@/lib/supabase/server`),
  `ActionResult` (`@/lib/action-result`), this file's existing
  `recordAudit` helper.
- Produces: `setPricing(input: PricingFormInput): Promise<ActionResult>` —
  consumed by Task 5's `PricingFormClient`.

No test file exists yet for `admin/actions.ts` — this task creates
`actions.test.ts` scoped to `setPricing` only (backfilling tests for the
four pre-existing actions is out of scope for this plan).

- [ ] **Step 1: Write the failing tests first**

```ts
// src/app/admin/actions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireAdminMock,
  updateMock,
  eqMock,
  fromMock,
  insertMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  const eqMock = vi.fn(async () => ({ error: null }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const insertMock = vi.fn(async () => ({ error: null }));
  const fromMock = vi.fn((table: string) =>
    table === "pricing"
      ? { update: updateMock }
      : { insert: insertMock },
  );
  return {
    requireAdminMock: vi.fn(async () => ({ user: { id: "admin1" } })),
    updateMock,
    eqMock,
    fromMock,
    insertMock,
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("@/lib/admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { setPricing } from "./actions";

describe("setPricing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes monthly_cents to the pinned pricing row and records an audit entry", async () => {
    fromMock.mockImplementation((table: string) =>
      table === "pricing" ? { update: updateMock } : { insert: insertMock },
    );
    const res = await setPricing({ monthly_cents: 999 });

    expect(res.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ monthly_cents: 999 }),
    );
    expect(eqMock).toHaveBeenCalledWith("id", 1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "admin1",
        action: "set_pricing",
        detail: { monthly_cents: 999 },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/plan");
  });

  it("rejects a negative price without writing", async () => {
    const res = await setPricing({ monthly_cents: -100 });
    expect(res.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a price above MAX_MONEY_CENTS without writing", async () => {
    const res = await setPricing({ monthly_cents: 10_000_01 });
    expect(res.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the update fails, without throwing", async () => {
    eqMock.mockResolvedValueOnce({ error: { message: "db down" } });
    const res = await setPricing({ monthly_cents: 999 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("Could not update pricing");
  });

  it("404s via requireAdmin for a non-admin before touching pricing", async () => {
    requireAdminMock.mockImplementationOnce(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    await expect(setPricing({ monthly_cents: 999 })).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/admin/actions.test.ts`
Expected: FAIL — `setPricing` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Append to `src/app/admin/actions.ts` (after the existing four actions,
reusing the file's existing `recordAudit` helper):

```ts
import { pricingFormSchema, type PricingFormInput } from "@/lib/schemas";

/**
 * Update the single pricing row shown on the vendor plan page. Admin-only:
 * requireAdmin() 404s non-admins before any write. Service-role client,
 * since the pricing table has no write RLS policy at all.
 */
export async function setPricing(
  input: PricingFormInput,
): Promise<ActionResult> {
  const { user } = await requireAdmin();

  const parsed = pricingFormSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pricing")
    .update({
      monthly_cents: parsed.data.monthly_cents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    console.error("setPricing failed", error.message);
    return { success: false, error: "Could not update pricing" };
  }

  await recordAudit(user.id, "set_pricing", null, {
    monthly_cents: parsed.data.monthly_cents,
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard/plan");
  return { success: true };
}
```

(`pricingFormSchema`/`PricingFormInput` import added at the top of the
file alongside the existing `zod` import; no other existing import
changes.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/app/admin/actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/actions.ts src/app/admin/actions.test.ts
git commit -m "feat: add setPricing admin action"
```

---

### Task 5: Bump `@merqo/ui` and wire `PricingForm` into `/admin`

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/app/admin/pricing-form-client.tsx`
- Create: `src/app/admin/pricing-form-client.dom.test.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/admin-overview-page.dom.test.tsx`

**Interfaces:**

- Consumes: `PricingForm`, `PricingFormProps` from `@merqo/ui` (new
  export — see Step 0), `setPricing` (Task 4), `getPricing` (Task 2).
- Produces: `PricingFormClient` — a thin client wrapper, consumed only by
  `AdminOverviewPage`.

- [ ] **Step 0: Confirm the cross-repo dependency is actually available (hard blocker)**

This task cannot start until `@merqo/ui` publishes the `PricingForm`
export described in `Merqo Business/merqo-ui/docs/superpowers/plans/
2026-08-15-pricing-form.md`. Before writing any code:

1. Check the real latest tag: in the `merqo-ui` repo, run
   `git tag --sort=-v:refname | head -1`.
2. Confirm that tag's `dist`/`index.ts` actually exports `PricingForm`,
   `PricingFormProps`, `PricingFieldConfig` (e.g. `grep -r "PricingForm"
   node_modules/@merqo/ui/dist` after installing, or check the tagged
   commit directly).
3. If the tag doesn't exist yet or doesn't export `PricingForm`, **stop
   this task** and either wait for that plan to land or coordinate with
   whoever owns it — do not stub a local fake of the component to unblock
   this plan; that would diverge from the real shared-component contract.

- [ ] **Step 1: Bump the dependency**

In `package.json`:

```diff
-    "@merqo/ui": "github:cljiahao/merqo-ui#v0.11.1",
+    "@merqo/ui": "github:cljiahao/merqo-ui#v0.12.0",
```

(Use the real tag confirmed in Step 0 — `v0.12.0` is this plan's best
guess from the merqo-ui plan's own Task 2, not a guarantee.)

```bash
pnpm install
```

Expected: lockfile updates cleanly, `pnpm exec tsc --noEmit` still passes
project-wide (confirms nothing else broke from the bump).

- [ ] **Step 2: Write the failing test for `PricingFormClient`**

```tsx
// src/app/admin/pricing-form-client.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { setPricingMock, toastSuccessMock, toastErrorMock, refreshMock } =
  vi.hoisted(() => ({
    setPricingMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    refreshMock: vi.fn(),
  }));

vi.mock("./actions", () => ({ setPricing: setPricingMock }));
vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { PricingFormClient } from "./pricing-form-client";

describe("PricingFormClient", () => {
  it("saves the new monthly price, toasts success, and refreshes", async () => {
    setPricingMock.mockResolvedValue({ success: true });
    render(
      <PricingFormClient initial={{ monthly_cents: 499, currency: "SGD" }} />,
    );

    fireEvent.change(screen.getByLabelText(/monthly/i), {
      target: { value: "5.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(setPricingMock).toHaveBeenCalledWith({ monthly_cents: 599 }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("toasts the server error and does not refresh when setPricing fails", async () => {
    setPricingMock.mockResolvedValue({ success: false, error: "nope" });
    render(
      <PricingFormClient initial={{ monthly_cents: 499, currency: "SGD" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("nope"));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run src/app/admin/pricing-form-client.dom.test.tsx`
Expected: FAIL — `./pricing-form-client` doesn't exist yet.

- [ ] **Step 4: Write the implementation**

```tsx
// src/app/admin/pricing-form-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PricingForm } from "@merqo/ui";
import { setPricing } from "./actions";

const FIELDS = [{ key: "monthly_cents", label: "Monthly (SGD)" }];

/**
 * Thin client wrapper around @merqo/ui's presentational PricingForm — owns
 * the toast + router.refresh() side effects the component itself
 * deliberately doesn't (no `toast` import inside PricingForm; success/
 * failure surfaces via onSave resolving / onError firing). Matches this
 * admin surface's existing wrapper pattern (VendorProToggle,
 * ResolveUpgradeRequestButton).
 */
export function PricingFormClient({
  initial,
}: {
  initial: { monthly_cents: number; currency: string };
}) {
  const router = useRouter();

  async function onSave(values: Record<string, number>) {
    const res = await setPricing({ monthly_cents: values.monthly_cents });
    if (!res.success) throw new Error(res.error);
    toast.success("Pricing updated");
    router.refresh();
  }

  return (
    <PricingForm
      fields={FIELDS}
      initial={{
        values: { monthly_cents: initial.monthly_cents },
        currency: initial.currency,
      }}
      onSave={onSave}
      onError={(err) =>
        toast.error(err instanceof Error ? err.message : "Could not update pricing")
      }
      helpText="Shown on the vendor plan page."
    />
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/app/admin/pricing-form-client.dom.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire into `AdminOverviewPage`**

In `src/app/admin/page.tsx`:

```diff
 import { platformTotals, recentActivity } from "@/lib/admin-data";
+import { getPricing } from "@/lib/pricing";
+import { PricingFormClient } from "./pricing-form-client";
```

```diff
-  const [totals, activity] = await Promise.all([
+  const [totals, activity, pricing] = await Promise.all([
     platformTotals(),
     recentActivity(15),
+    getPricing(),
   ]);
```

Add a new section, after the existing "Recent activity" `<section>`:

```tsx
<section className="space-y-3">
  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
    Pricing
  </h2>
  <PricingFormClient initial={pricing} />
</section>
```

- [ ] **Step 7: Update `admin-overview-page.dom.test.tsx`**

Add a `getPricing` mock (`vi.mock("@/lib/pricing", () => ({ getPricing:
vi.fn(async () => ({ monthly_cents: 499, currency: "SGD" })) }))`) so the
existing render doesn't throw, and one new assertion:

```ts
expect(screen.getByText("Pricing")).toBeInTheDocument();
```

- [ ] **Step 8: Run the full admin test suite**

Run: `pnpm vitest run src/app/admin`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/admin/pricing-form-client.tsx src/app/admin/pricing-form-client.dom.test.tsx src/app/admin/page.tsx src/app/admin/admin-overview-page.dom.test.tsx
git commit -m "feat: wire @merqo/ui PricingForm into /admin"
```

---

### Task 6: Live price on `/dashboard/plan`

**Files:**

- Modify: `src/app/dashboard/plan/page.tsx`
- Modify: `src/app/dashboard/plan/plan-page.dom.test.tsx`

**Interfaces:**

- Consumes: `getPricing` (Task 2), `formatPrice` (`@/lib/utils`, already
  exists).
- Produces: no new exports — same default export, now reads one more
  value.

- [ ] **Step 1: Update the failing test first**

In `plan-page.dom.test.tsx`, add a `@/lib/pricing` mock and a new
assertion in the Free-vendor test:

```diff
+vi.mock("@/lib/pricing", () => ({
+  getPricing: vi.fn(async () => ({ monthly_cents: 499, currency: "SGD" })),
+}));
```

```diff
     expect(
       screen.getByText(/run more than one loyalty program/i),
     ).toBeInTheDocument();
+    expect(screen.getByText("$4.99")).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/dashboard/plan/plan-page.dom.test.tsx`
Expected: FAIL — `page.tsx` doesn't read or render a price yet.

- [ ] **Step 3: Write the implementation**

In `src/app/dashboard/plan/page.tsx`:

```diff
 import { isPro, listPrograms, currentProgram } from "@/lib/program";
+import { getPricing } from "@/lib/pricing";
+import { formatPrice } from "@/lib/utils";
```

```diff
-  const [pro, programs] = await Promise.all([isPro(), listPrograms()]);
+  const [pro, programs, pricing] = await Promise.all([
+    isPro(),
+    listPrograms(),
+    getPricing(),
+  ]);
+  const monthlyPrice =
+    pricing.monthly_cents > 0 ? formatPrice(pricing.monthly_cents) : null;
```

Replace the non-Pro Pro-card block's paragraph with a price line above the
existing description (keeping the manual-grant explanation as a trailing
sentence, since the grant mechanism itself is unchanged):

```tsx
<ElevatedCard className="border-primary/40 p-5">
  <div className="flex items-center gap-2">
    <Sparkles className="size-4 text-primary" />
    <h2 className="font-display text-xl font-semibold">Pro</h2>
  </div>
  <p className="mt-1 font-mono text-2xl font-bold">
    {monthlyPrice ?? "Soon"}
    {monthlyPrice && (
      <span className="ml-1 text-sm font-normal text-muted-foreground">
        / month
      </span>
    )}
  </p>
  <p className="mt-2 text-sm text-muted-foreground">
    Run more than one loyalty program at a time. Message us and we&apos;ll
    set you up — no card needed yet.
  </p>
  <div className="mt-4">
    <UpgradeCta />
  </div>
</ElevatedCard>
```

(The "no card needed yet" sentence is deliberately kept — it still
accurately describes the manual grant flow, which this task does not
change. Only the missing price line is added.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/app/dashboard/plan/plan-page.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/plan/page.tsx src/app/dashboard/plan/plan-page.dom.test.tsx
git commit -m "feat: show the live Pro price on /dashboard/plan"
```

---

### Task 7: README updates

**Files:**

- Modify: `src/app/admin/README.md`
- Modify: `src/app/dashboard/plan/README.md`
- Modify: `src/lib/README.md`

- [ ] **Step 1: `src/app/admin/README.md`**

Update the `actions.ts` bullet to add `setPricing`:

```diff
-`actions.ts` — Server Actions (all admin-only via `requireAdmin()`): `setProgramActive`, `setVendorPro`, `removeCard`, `resolveUpgradeRequest`, each writing via the service-role client and appending an `admin_audit` row.
+`actions.ts` — Server Actions (all admin-only via `requireAdmin()`): `setProgramActive`, `setVendorPro`, `removeCard`, `resolveUpgradeRequest`, `setPricing`, each writing via the service-role client and appending an `admin_audit` row.
```

Add two new Contents bullets (alphabetical, matching the file's existing
ordering):

```md
- `page.tsx` — `AdminOverviewPage`: platform-wide totals (programs, customers, stamps, rewards), a recent cross-shop activity feed, and the live-pricing admin form (`PricingFormClient`), wrapped in `ElevatedCard`.
- `pricing-form-client.tsx` — `PricingFormClient` client component: wraps `@merqo/ui`'s presentational `PricingForm`, wiring its `onSave`/`onError` contract to `setPricing` + a success/error toast + `router.refresh()`.
```

(Remove the old `page.tsx` bullet this replaces, so there's exactly one.)

- [ ] **Step 2: `src/app/dashboard/plan/README.md`**

Update the `page.tsx` bullet to mention the live price read:

```diff
-`page.tsx` — `PlanPage` server component; requires a vendor, shows current tier badge, an optional program-performance blurb (repeat-visit rate, rewards total, `ElevatedCard`-wrapped), and a Free/Pro feature comparison table with `UpgradeCta` when not Pro (the Pro-upsell/Pro-active blocks are also `ElevatedCard`-wrapped).
+`page.tsx` — `PlanPage` server component; requires a vendor, shows current tier badge, an optional program-performance blurb (repeat-visit rate, rewards total, `ElevatedCard`-wrapped), the live admin-tunable Pro price (`getPricing()`, `$4.99/mo` by default), and a Free/Pro feature comparison table with `UpgradeCta` when not Pro (the Pro-upsell/Pro-active blocks are also `ElevatedCard`-wrapped).
```

(Rest of the bullet — the `max-w-2xl` layout note — is unchanged.)

- [ ] **Step 3: `src/lib/README.md`**

Read the current Contents list first (`pricing.ts` slots in alphabetically
near `program.ts`); add:

```md
- `pricing.ts` — `PricingConfig`, `DEFAULT_PRICING`, `getPricing()`: reads the single-row, admin-tunable `pricing` table (public-select RLS), falling back to a zeroed config only if the row is ever unreadable.
```

Also update the `schemas.ts` bullet to mention the new export:

```diff
-`schemas.ts` — ...(whatever the existing bullet says)...
+`schemas.ts` — ...(existing description)..., plus `pricingFormSchema`/`MAX_MONEY_CENTS` for the admin pricing form.
```

(Read the file's actual current `schemas.ts` bullet text before editing —
don't overwrite unrelated existing content in that line.)

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/README.md src/app/dashboard/plan/README.md src/lib/README.md
git commit -m "docs: update READMEs for the admin pricing feature"
```

---

### Task 8: Sync the cross-kit pricing plan doc

**Files (outside this repo — parent `Merqo Business/docs/business/`):**

- Modify: `2026-07-30-cross-kit-pricing-and-billing-plan.md`

- [ ] **Step 1: Update loopkit's row**

Per-kit pricing table (line 91): change

```diff
-| loopkit | $9/mo (unchanged) | Multi-program, unlimited members, branded page | Middle tier |
+| loopkit | $4.99/mo (shipped 2026-08-15; supersedes this doc's earlier $9 proposal, which was never shipped) | Unlimited programs (the entire gate — see 2026-08-15-per-kit-pricing-rationale.md) | Thin utility tier |
```

- [ ] **Step 2: Recompute any bundle-discount example using loopkit's old $9**

Line 102's 3-kit example: `qkit+paykit+loopkit: (14+4+9)×0.75 = $20.25` uses
stale numbers for two of its three kits already (paykit is $4.99 as of
this same session's `2026-08-15-paykit-pro-simplification.md`, qkit's
$14 here doesn't match qkit's own live $24.99 either — this table was
already stale before this plan). Recompute with the real, current, live
numbers: `qkit+paykit+loopkit: (24.99+4.99+4.99)×0.75 = $26.235 ≈ $26.24`.
Flag in the doc, rather than silently fixing every other stale row in the
same table, that this table needs a full pass against every kit's actual
live price, not just loopkit's — that full pass is out of scope for this
plan (it touches qkit/stockkit/paykit rows this plan has no mandate to
re-verify).

- [ ] **Step 3: Commit** (in the `Merqo Business` parent, not this repo —
  it is not a git repository; this step is a plain file save, no commit
  command applies here.)

---

### Task 9: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full check + test**

Run: `pnpm check && pnpm test`
Expected: PASS, no lint/type/format errors, full suite green.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: PASS — this is the one gate that catches Next.js client/server
bundle-boundary errors `pnpm check`/`pnpm test` miss (per the project's own
rule), and this plan adds a new Client Component (`PricingFormClient`)
importing a Server Action module (`setPricing`) — exactly the shape of
mistake that gate exists for.

- [ ] **Step 3: Manual smoke check against a real (or local) Supabase, if available**

If a linked Supabase environment is available: apply migration `0034`,
sign in as an admin, confirm `/admin`'s new Pricing section shows $4.99
pre-filled, change it, confirm `/dashboard/plan` reflects the new value
after a refresh, and confirm a non-admin visiting `/admin` still gets a
404. If no linked environment is available in this session, this step is
deferred to whoever next has one — do not skip recording that it's
deferred.

- [ ] **Step 4: If any check fails, fix and re-run before proceeding**

Do not open a PR on a red local gate.

---

## Self-Review Notes

- **Spec coverage:** migration + hand-typed schema (Task 1); config/
  fallback/read module (Task 2); Zod schema (Task 3); `setPricing` action
  (Task 4); `@merqo/ui` bump + admin wiring (Task 5); plan-page live price
  (Task 6); README updates (Task 7); cross-kit doc sync (Task 8);
  verification (Task 9). Every "Interfaces touched" file in the spec has a
  matching task.
- **Placeholder scan:** none — every step has real code lifted from the
  spec's own sketches, filled in completely (the spec's `onSave` sketch
  was illustrative/incomplete by its own admission; Task 5 replaces it
  with the actual working wrapper).
- **Type consistency:** `PricingConfig` (`src/lib/pricing.ts`) and
  `PricingFormInput` (`src/lib/schemas.ts`) both key off `monthly_cents:
  number` — no drift between the read path and the write path. The
  `@merqo/ui` `PricingForm`'s own `Record<string, number>` contract is
  intentionally loose (shared across paykit/stockkit/loopkit's different
  field sets) — `PricingFormClient` is the one place that narrows it back
  to loopkit's single known key, matching the component's own documented
  design intent.
- **Hard cross-repo dependency called out, not silently assumed:** Task 5's
  Step 0 makes the `@merqo/ui` publish dependency an explicit blocking
  gate with a real verification command, not a "should be there by now"
  assumption — this plan was written while that sibling plan was still "being
  built in parallel," per this task's own framing.
- **Manual-grant flow confirmed untouched:** no task modifies
  `dashboard/plan/actions.ts`, `dashboard/plan/upgrade-cta.tsx`,
  `setVendorPro`, or `resolveUpgradeRequest` — grep for those four names
  across this plan's diffs during review to confirm zero hits outside
  Task 6's unchanged `<UpgradeCta />` render call.
- **Cross-repo edit flagged, not silently done:** Task 8 explicitly notes
  it edits a file outside this repo's own git history, following the same
  precedent paykit's own `2026-08-15-paykit-pro-simplification.md` plan
  set in this same session (its own Task 5).
- **Stale-data honesty:** Task 8 deliberately does not silently "fix" the
  cross-kit doc's other stale numbers (qkit/paykit's own bundle-math
  entries) while touching loopkit's row — it flags the broader staleness
  instead of quietly overreaching this plan's actual mandate.
