# Vendor-level customer database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give loopkit a real per-vendor customer identity (`loopkit.customers`, one row per unique phone per vendor, kept in sync by DB triggers) and use it to make `/dashboard/customers` show a unified, cross-program view by default.

**Architecture:** A new table is synced by two `AFTER INSERT` triggers (on `loopkit.cards` and `loopkit.stamp_events`) so it stays correct regardless of which of the 5 existing card-writing RPCs fired — no application code writes to it directly. `src/lib/customers.ts` adds a pure aggregation function plus an impure Supabase-fetching shell (same split as `src/lib/stats.ts`), and `dashboard/customers/page.tsx` gains a second render mode for when no `?p=` is present.

**Tech Stack:** PostgreSQL (Supabase), Next.js 16 App Router, TypeScript strict, Vitest.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore` (repo-wide rule, `loopkit/AGENTS.md`).
- `loopkit.customers` is written ONLY by the two triggers in Task 1 — no application code (server action, RPC, etc.) ever inserts/updates it directly. RLS on it is select-only for `authenticated`.
- No application code changes to `src/app/dashboard/customers/page.tsx`'s existing `?p=<id>` filtered mode — that must render exactly as it does today (byte-identical behavior, not just "similar").
- **There is no linked Supabase CLI in this environment.** Task 1's migration SQL must be applied manually by the user via the Supabase dashboard SQL Editor — the same pattern used for every migration this session (single-statement blocks, since the dashboard's paste/autocomplete mangles multi-statement pastes; `create policy ... using (...) with check (...)` collapsed onto one line to avoid a known editor bug). This is a controller-level hand-off between Task 1 and Task 2, not something a subagent can do — subagents never have DB access.
- Tasks 2 and 3's automated tests use fixtures/mocked Supabase clients, not a live database — they do not require the migration to actually be live to pass. Only real end-to-end behavior (an actual vendor seeing real aggregated data) requires the migration applied. Do not block Task 2/3 implementation on the live apply completing; do treat "the live apply happened" as a separate manual smoke-test gate before calling the whole plan done.
- Every new/changed component file gets a co-located `*.dom.test.tsx`; every new pure-logic file in `src/lib/` gets a test at `test/lib/<name>.test.ts` (repo convention — see `test/lib/stats.test.ts`).
- Run `pnpm check` (prettier + eslint + tsc) and `pnpm test` before each commit.

---

## File Structure

- **Create** `supabase/migrations/0021_loopkit_customers.sql` — `loopkit.customers` table, RLS, and the two sync triggers.
- **Modify** `src/lib/types.ts` — hand-mirror the new `customers` table (no live codegen available, same convention as every other table in this file).
- **Modify** `docs/DEPLOY.md` — add the `0021` migration entry (same convention as every prior migration note).
- **Create** `src/lib/customers.ts` — `aggregateCustomers()` (pure) + `listVendorCustomers()` (impure Supabase-fetching shell), mirroring `src/lib/stats.ts`'s pure/impure split.
- **Create** `test/lib/customers.test.ts` — pure-function tests, no DOM/mocking needed (mirrors `test/lib/stats.test.ts`).
- **Modify** `src/app/dashboard/customers/page.tsx` — add the unfiltered (no `?p=`) render branch; the existing `?p=<id>` branch is untouched.
- **Create** `src/app/dashboard/customers/customers-page.dom.test.tsx` — dom tests for both render modes (list vs. filtered), following the co-located `*.dom.test.tsx` convention established in the dashboard card grid work.

No changes to: `src/lib/cards.ts` (`listCards` stays exactly as-is, used unchanged by the `?p=` branch), any of the 5 card-writing RPCs (`vendor_join`, `enroll_card`, `add_stamp`, `record_visit`-backed paths, `qkit_earn_commit`), `src/app/dashboard/program-card.tsx` (its footer link already points at `/dashboard/customers?p=<id>`, which keeps working unchanged).

---

## Task 1: `loopkit.customers` migration — table, RLS, sync triggers, types, DEPLOY.md

**Files:**

- Create: `supabase/migrations/0021_loopkit_customers.sql`
- Modify: `src/lib/types.ts`
- Modify: `docs/DEPLOY.md`

**Interfaces:**

- Produces: a `loopkit.customers` table with columns `vendor_id uuid`, `phone text`, `name text | null`, `first_seen_at timestamptz`, `last_seen_at timestamptz`, primary key `(vendor_id, phone)`. This is what Task 2's `listVendorCustomers()` queries (via `supabase.from("customers").select(...)`, using the `Database["loopkit"]["Tables"]["customers"]` type Task 1 adds to `types.ts`).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0021_loopkit_customers.sql`:

```sql
create table loopkit.customers (
  vendor_id      uuid not null references auth.users(id) on delete cascade,
  phone          text not null,
  name           text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (vendor_id, phone)
);

create index customers_vendor_idx on loopkit.customers (vendor_id);

alter table loopkit.customers enable row level security;

create policy customers_own on loopkit.customers for select using (vendor_id = (select auth.uid()));

grant select on loopkit.customers to authenticated;
grant all on loopkit.customers to service_role;

create or replace function loopkit.sync_customer_on_card()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_vendor_id uuid;
begin
  select vendor_id into v_vendor_id from loopkit.programs where id = new.program_id;
  insert into loopkit.customers (vendor_id, phone, name, first_seen_at, last_seen_at)
    values (v_vendor_id, new.phone, new.customer_name, new.created_at, new.created_at)
  on conflict (vendor_id, phone) do update set
    name = coalesce(excluded.name, loopkit.customers.name),
    last_seen_at = excluded.last_seen_at;
  return new;
end;
$$;

create trigger cards_sync_customer after insert on loopkit.cards for each row execute function loopkit.sync_customer_on_card();

create or replace function loopkit.sync_customer_on_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_vendor_id uuid; v_phone text;
begin
  select p.vendor_id, c.phone into v_vendor_id, v_phone
    from loopkit.cards c join loopkit.programs p on p.id = c.program_id
    where c.id = new.card_id;
  update loopkit.customers set last_seen_at = new.created_at where vendor_id = v_vendor_id and phone = v_phone;
  return new;
end;
$$;

create trigger stamp_events_sync_customer after insert on loopkit.stamp_events for each row execute function loopkit.sync_customer_on_activity();
```

This is the exact SQL you will later hand to the user in single-statement blocks (Step 4) — do not add anything beyond what's here.

- [ ] **Step 2: Add the `customers` table type to `types.ts`**

In `src/lib/types.ts`, inside `Database["loopkit"]["Tables"]`, add a new entry (alongside the existing `programs`, `cards`, `stamp_events`, etc. entries — same file, same nesting level):

```ts
      customers: {
        Row: {
          vendor_id: string;
          phone: string;
          name: string | null;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          vendor_id: string;
          phone: string;
          name?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: {
          vendor_id?: string;
          phone?: string;
          name?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: no TS errors. This step has no automated test of its own — the migration SQL is exercised for the first time in Step 4 (manual, live) and consumed by Task 2's code (typechecked, fixture-tested).

- [ ] **Step 4: Hand the migration to the user for manual application — controller step, not a subagent step**

Give the user the SQL from Step 1, split into single-statement blocks (established pattern this session — the Supabase dashboard SQL Editor's paste/autocomplete corrupts multi-statement pastes):

1. The `create table loopkit.customers (...)` block, alone.
2. `create index customers_vendor_idx on loopkit.customers (vendor_id);`
3. `alter table loopkit.customers enable row level security;`
4. `create policy customers_own on loopkit.customers for select using (vendor_id = (select auth.uid()));` (collapsed to one line, per the known editor bug with multi-line `create policy` statements).
5. `grant select on loopkit.customers to authenticated;`
6. `grant all on loopkit.customers to service_role;`
7. The `create or replace function loopkit.sync_customer_on_card()` block, alone.
8. `create trigger cards_sync_customer after insert on loopkit.cards for each row execute function loopkit.sync_customer_on_card();`
9. The `create or replace function loopkit.sync_customer_on_activity()` block, alone.
10. `create trigger stamp_events_sync_customer after insert on loopkit.stamp_events for each row execute function loopkit.sync_customer_on_activity();`

Tell the user to run each block via plain "Run" (not "Run and enable RLS"), in order, confirming success before the next. Wait for their confirmation before proceeding to Task 2 (Task 2 doesn't technically require this to be live to pass its own tests, but do not mark this migration step done until confirmed — an un-applied migration silently means the feature does nothing in production).

- [ ] **Step 5: Update `docs/DEPLOY.md`**

Add a new bullet in the migration list, after the existing `0020_qkit_earn_functions.sql` entry, matching the file's existing prose style:

```markdown
- apply `0021_loopkit_customers.sql` — adds `loopkit.customers` (one row
  per unique phone per vendor) and two sync triggers (`AFTER INSERT` on
  `cards` and on `stamp_events`) that keep it up to date regardless of
  which RPC created the card. Read-only for `authenticated` — only the
  triggers ever write to it. Backs the vendor-level Customers view. Safe
  to re-run.
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0021_loopkit_customers.sql src/lib/types.ts docs/DEPLOY.md
git commit -m "feat(db): add loopkit.customers table + sync triggers for vendor-level customer identity"
```

---

## Task 2: `src/lib/customers.ts` — aggregation function + fetch shell

**Files:**

- Create: `src/lib/customers.ts`
- Test: `test/lib/customers.test.ts`

**Interfaces:**

- Consumes: `createServerClient` from `@/lib/supabase/server`; `listPrograms` from `@/lib/program` (already returns the signed-in vendor's programs, RLS-scoped — reused as-is, not modified).
- Produces:
  - `export type VendorCustomerRow = { phone: string; name: string | null; programNames: string[]; totalStamps: number; totalRewards: number; lastSeenAt: string }`
  - `export function aggregateCustomers(customers: { phone: string; name: string | null; last_seen_at: string }[], cards: { phone: string; program_id: string; stamp_count: number; reward_count: number }[], programNameById: Record<string, string>): VendorCustomerRow[]` — pure, sorted by `lastSeenAt` descending.
  - `export async function listVendorCustomers(q?: string): Promise<VendorCustomerRow[]>` — impure shell Task 3's `page.tsx` calls directly.

- [ ] **Step 1: Write the failing tests for `aggregateCustomers`**

Create `test/lib/customers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateCustomers } from "@/lib/customers";

describe("aggregateCustomers", () => {
  it("merges a customer's cards across programs into one row", () => {
    const customers = [
      {
        phone: "+6591234567",
        name: "Jane",
        last_seen_at: "2026-07-10T00:00:00Z",
      },
    ];
    const cards = [
      {
        phone: "+6591234567",
        program_id: "p1",
        stamp_count: 3,
        reward_count: 1,
      },
      {
        phone: "+6591234567",
        program_id: "p2",
        stamp_count: 5,
        reward_count: 0,
      },
    ];
    const programNameById = { p1: "Coffee Stamps", p2: "Lucky Tap" };

    const result = aggregateCustomers(customers, cards, programNameById);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      phone: "+6591234567",
      name: "Jane",
      programNames: ["Coffee Stamps", "Lucky Tap"],
      totalStamps: 8,
      totalRewards: 1,
      lastSeenAt: "2026-07-10T00:00:00Z",
    });
  });

  it("handles a customer with no matching cards (defensive — sync should prevent this in practice)", () => {
    const customers = [
      {
        phone: "+6598765432",
        name: null,
        last_seen_at: "2026-07-01T00:00:00Z",
      },
    ];
    const result = aggregateCustomers(customers, [], {});
    expect(result[0]).toEqual({
      phone: "+6598765432",
      name: null,
      programNames: [],
      totalStamps: 0,
      totalRewards: 0,
      lastSeenAt: "2026-07-01T00:00:00Z",
    });
  });

  it("sorts by lastSeenAt descending", () => {
    const customers = [
      { phone: "+65111", name: null, last_seen_at: "2026-07-01T00:00:00Z" },
      { phone: "+65222", name: null, last_seen_at: "2026-07-10T00:00:00Z" },
    ];
    const result = aggregateCustomers(customers, [], {});
    expect(result.map((r) => r.phone)).toEqual(["+65222", "+65111"]);
  });

  it("does not duplicate a program name when a customer has 2 cards in the same program (should not happen, but defensive)", () => {
    const customers = [
      { phone: "+65333", name: null, last_seen_at: "2026-07-01T00:00:00Z" },
    ];
    const cards = [
      { phone: "+65333", program_id: "p1", stamp_count: 1, reward_count: 0 },
      { phone: "+65333", program_id: "p1", stamp_count: 1, reward_count: 0 },
    ];
    const result = aggregateCustomers(customers, cards, {
      p1: "Coffee Stamps",
    });
    expect(result[0].programNames).toEqual(["Coffee Stamps"]);
    expect(result[0].totalStamps).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test test/lib/customers.test.ts`
Expected: FAIL with "Cannot find module '@/lib/customers'"

- [ ] **Step 3: Write the implementation**

Create `src/lib/customers.ts`:

```ts
import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";

export type VendorCustomerRow = {
  phone: string;
  name: string | null;
  programNames: string[];
  totalStamps: number;
  totalRewards: number;
  lastSeenAt: string;
};

type CustomerFields = {
  phone: string;
  name: string | null;
  last_seen_at: string;
};
type CardFields = {
  phone: string;
  program_id: string;
  stamp_count: number;
  reward_count: number;
};

// Pure: merge one vendor's customers rows with their cards across every
// program into one row per phone. A customer's programNames are deduped
// (a phone should only ever have one card per program, but this stays
// defensive rather than assuming the DB-level unique constraint holds).
export function aggregateCustomers(
  customers: CustomerFields[],
  cards: CardFields[],
  programNameById: Record<string, string>,
): VendorCustomerRow[] {
  const cardsByPhone = new Map<string, CardFields[]>();
  for (const card of cards) {
    const existing = cardsByPhone.get(card.phone) ?? [];
    existing.push(card);
    cardsByPhone.set(card.phone, existing);
  }

  const rows = customers.map((customer) => {
    const ownCards = cardsByPhone.get(customer.phone) ?? [];
    const programNames = [...new Set(ownCards.map((c) => c.program_id))]
      .map((id) => programNameById[id])
      .filter((name): name is string => name !== undefined);
    return {
      phone: customer.phone,
      name: customer.name,
      programNames,
      totalStamps: ownCards.reduce((sum, c) => sum + c.stamp_count, 0),
      totalRewards: ownCards.reduce((sum, c) => sum + c.reward_count, 0),
      lastSeenAt: customer.last_seen_at,
    };
  });

  return rows.sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
}

// Impure shell: the signed-in vendor's customers across every program, most
// recently active first. RLS scopes both `customers` and `cards` to the
// vendor automatically (owns_program / customers_own), so no explicit
// vendor_id filter is needed here — only the program-id narrowing for the
// cards join.
export async function listVendorCustomers(
  q?: string,
): Promise<VendorCustomerRow[]> {
  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );
  const programIds = programs.map((p) => p.id);

  let customersQuery = supabase
    .from("customers")
    .select("phone,name,last_seen_at")
    .order("last_seen_at", { ascending: false });
  const term = q?.trim();
  if (term) customersQuery = customersQuery.ilike("phone", `%${term}%`);

  const { data: customersData, error: customersError } = await customersQuery;
  if (customersError)
    throw new Error(`listVendorCustomers: ${customersError.message}`);

  if (programIds.length === 0) {
    return aggregateCustomers(customersData ?? [], [], programNameById);
  }

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("phone,program_id,stamp_count,reward_count")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listVendorCustomers: ${cardsError.message}`);

  return aggregateCustomers(
    customersData ?? [],
    cardsData ?? [],
    programNameById,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test test/lib/customers.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm check`
Expected: no TS errors. `supabase.from("customers")` must resolve against the `customers` table type added to `types.ts` in Task 1 — if this errors, Task 1's Step 2 type is missing or misnamed; do not work around it with a cast, fix the type.

- [ ] **Step 6: Commit**

```bash
git add src/lib/customers.ts test/lib/customers.test.ts
git commit -m "feat(dashboard): add vendor-level customer aggregation (pure) + fetch shell"
```

---

## Task 3: `dashboard/customers/page.tsx` — dual-mode rewrite

**Files:**

- Modify: `src/app/dashboard/customers/page.tsx`
- Create: `src/app/dashboard/customers/customers-page.dom.test.tsx`

**Interfaces:**

- Consumes: `listVendorCustomers` and `VendorCustomerRow` from `@/lib/customers` (Task 2); `listCards` from `@/lib/cards` (unchanged); `listPrograms`, `currentProgram` from `@/lib/program` (unchanged).

- [ ] **Step 1: Write the failing test**

The page is an async server component reading `searchParams` — following this session's established pattern for testing async server components (see `qkit/src/app/order/[boothId]/[orderNumber]/earn-link.dom.test.tsx` from a prior session, and this session's dashboard work), extract the two render bodies into small presentational functions the test can call directly with plain props, rather than mocking the whole Supabase chain.

Create `src/app/dashboard/customers/customers-page.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorCustomerList } from "./page";
import type { VendorCustomerRow } from "@/lib/customers";

const customers: VendorCustomerRow[] = [
  {
    phone: "+6591234567",
    name: "Jane",
    programNames: ["Coffee Stamps", "Lucky Tap"],
    totalStamps: 8,
    totalRewards: 1,
    lastSeenAt: "2026-07-10T00:00:00Z",
  },
];

describe("VendorCustomerList", () => {
  it("renders a customer's name, phone, program badges, and totals", () => {
    render(<VendorCustomerList customers={customers} />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Lucky Tap")).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it("falls back to phone-only when name is null", () => {
    const noName: VendorCustomerRow[] = [{ ...customers[0], name: null }];
    render(<VendorCustomerList customers={noName} />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
  });

  it("shows an empty state with zero customers", () => {
    render(<VendorCustomerList customers={[]} />);
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test customers-page.dom.test.tsx`
Expected: FAIL with "Cannot find module './page'" export `VendorCustomerList` (the page file doesn't export it yet).

- [ ] **Step 3: Rewrite `page.tsx`**

Replace `src/app/dashboard/customers/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgress } from "@/lib/engine";
import { listCards } from "@/lib/cards";
import { listVendorCustomers, type VendorCustomerRow } from "@/lib/customers";
import { formatSgtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; p?: string }>;
};

// Extracted so it's testable with plain props — no Supabase/auth mocking
// needed. Renders the vendor-level (no ?p=) list: every customer across
// every program, merged.
export function VendorCustomerList({
  customers,
}: {
  customers: VendorCustomerRow[];
}) {
  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {customers.map((customer) => (
        <li
          key={customer.phone}
          className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{customer.name ?? customer.phone}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatSgtDate(customer.lastSeenAt)}
            </span>
          </div>
          {customer.name && (
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {customer.programNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {customer.totalStamps} total stamps/visits · {customer.totalRewards}{" "}
            reward{customer.totalRewards === 1 ? "" : "s"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { q, p } = await searchParams;

  if (!p) {
    const customers = await listVendorCustomers(q);
    return (
      <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
        <form className="flex items-center gap-3" action="/dashboard/customers">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by phone"
            className="h-11 rounded-xl"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-11 rounded-xl px-6"
          >
            Search
          </Button>
        </form>
        <VendorCustomerList customers={customers} />
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const cards = await listCards(program.id, q);
  const now = new Date();

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
      <div>
        {programs.length > 1 ? (
          <form
            action="/dashboard/customers"
            method="get"
            className="mb-4 flex items-center gap-2"
          >
            <input type="hidden" name="q" value={q ?? ""} />
            <select
              name="p"
              defaultValue={program.id}
              aria-label="Switch program"
              className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm"
            >
              {programs.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted/50"
            >
              Switch
            </button>
          </form>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>

      <form className="flex items-center gap-3" action="/dashboard/customers">
        <input type="hidden" name="p" value={program.id} />
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by phone"
          className="h-11 rounded-xl"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 rounded-xl px-6"
        >
          Search
        </Button>
      </form>

      {cards.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{card.phone}</p>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {
                    getProgress(
                      program,
                      {
                        state: card.state,
                        stamp_count: card.stamp_count,
                        reward_count: card.reward_count,
                      },
                      now,
                    ).label
                  }
                  {card.reward_count > 0 &&
                    ` · ${card.reward_count} reward${card.reward_count === 1 ? "" : "s"}`}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground">
                {formatSgtDate(card.updated_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

Note: the `?p=<id>` branch below the `if (!p)` block is copied verbatim from the file's current contents — this preserves the Global Constraint that filtered mode renders byte-identical to today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test customers-page.dom.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck + full suite**

Run: `pnpm check && pnpm test`
Expected: no TS errors; full suite passes, including the existing (untouched) tests for the `?p=` filtered mode if any exist elsewhere in the suite.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/customers/page.tsx src/app/dashboard/customers/customers-page.dom.test.tsx
git commit -m "feat(dashboard): vendor-level Customers view when no program is selected"
```

---

## Self-Review

**Spec coverage:**

- `loopkit.customers` table + RLS (select-only for `authenticated`) → Task 1.
- Two sync triggers, `ON CONFLICT DO UPDATE`, no application-code writes → Task 1.
- `cards.customer_name` feeds `customers.name` → Task 1's trigger 1 (`new.customer_name`).
- Vendor-level Customers page (merged list, programs enrolled, cross-program totals) → Task 3, backed by Task 2.
- `?p=<id>` filtered mode stays unchanged → Task 3 (verbatim copy, explicit Global Constraint).
- Manual contact/tag actions, reachkit-specific code, per-program QR, login separation, activity placement → explicitly out of scope, untouched.

**Placeholder scan:** no TBD/TODO; every step has complete code; the migration hand-off (Task 1 Step 4) is a real controller action with exact SQL blocks, not a hand-wave.

**Type consistency:** `VendorCustomerRow` defined once in `src/lib/customers.ts` (Task 2) and imported identically in `page.tsx`/`customers-page.dom.test.tsx` (Task 3) — same field names (`phone`, `name`, `programNames`, `totalStamps`, `totalRewards`, `lastSeenAt`) used throughout, no drift. `customers` table Row/Insert/Update shape in `types.ts` (Task 1) matches exactly what Task 2's `listVendorCustomers` selects (`phone,name,last_seen_at`) and what Task 1's triggers write.
