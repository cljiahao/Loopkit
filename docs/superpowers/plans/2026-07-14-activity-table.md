# Activity Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Activity page's card-list layout with a filterable, paginated table — filter by event type (Stamps/Rewards) and date range, both hitting the database directly rather than the currently-fetched batch.

**Architecture:** Two tasks. Task 1 rewrites `src/lib/activity.ts`'s data layer: a new `listActivity()` that unifies the merged/filtered branches' previously-separate queries, adds server-side type/date filtering (via PostgREST `.or()`/`.and()` on `kind` and the JSON `payload` column) and offset/limit pagination, replacing the fixed-cap `listVendorActivity()`. Task 2 installs shadcn `Table`, builds `ActivityTable` + `ActivityFilters` components, and rewrites `activity/page.tsx` to use them on both branches with Prev/Next pagination.

**Tech Stack:** Next.js 16 App Router, Supabase (`@supabase/ssr`, PostgREST filter syntax), TypeScript strict, Tailwind v4, shadcn/ui, Vitest (node tests for pure logic, jsdom for components), pnpm.

## Global Constraints

- Keep the codebase clean: `VendorActivityList`, `listVendorActivity`, `aggregateActivity`, and `MAX_ROWS` are fully removed once their replacements land — not left alongside the new code. The filtered branch's old inline `stamp_events` query in `page.tsx` is deleted entirely, not commented out.
- Every task's commit must leave `pnpm check` (prettier + eslint + tsc) clean.
- The "Rewards" classification must use the exact same `isWonVisit`-based rule already in `src/lib/metrics.ts` (`kind === "visit" && payload.won === true`) — no reimplementation or drift from that logic.
- The table's "Program" column only renders on the merged view (`showProgram={true}`), never on the filtered (single-program) view.
- Pagination's Prev/Next links must preserve every other active search param (`type`, `from`, `to`, `p`) — not just `page`.
- Confirmed via migration history: `stamp_events.kind` is one of `stamp`/`redeem`/`visit`/`regen` in practice (the `win` value in the check constraint is never actually inserted — a win is represented as `kind='visit'` with `payload.won=true`). Every `kind='visit'` row's `payload` always includes an explicit `won: true|false` boolean (written by `recordVisitAction` in `src/app/dashboard/actions.ts`) — never `null`/absent — so a payload-path equality filter never hits SQL's `NULL != x` three-valued-logic trap. `regen` events (card regeneration) match neither the Stamps nor Rewards filter and are only visible under "All" — this matches their existing undifferentiated display today, not a new gap.
- No change to `stamp_events`' schema or any RPC — this is read-path only.

---

### Task 1: Unified `listActivity()` data layer

**Files:**

- Modify: `src/lib/activity.ts` (full rewrite)
- Modify: `test/lib/activity.test.ts` (exists — currently 4 tests against `aggregateActivity`, confirmed via `grep -rl "aggregateActivity" test/ src/`)

**Interfaces:**

- Produces: `mapActivityRow(event: {id,card_id,kind,payload?,created_at}, card: {id,phone,program_id} | undefined, programNameById: Record<string,string>): VendorActivityRow | null` — pure, replaces `aggregateActivity`'s per-row logic (returns `null` when `card` is `undefined`, same defensive behavior `aggregateActivity` had for an event whose card isn't in `cardsById`).
- Produces: `listActivity(options: { programIds: string[]; type?: "stamps" | "rewards"; dateFrom?: string; dateTo?: string; limit: number; offset: number }): Promise<{ rows: VendorActivityRow[]; hasMore: boolean }>` — impure shell, Task 2 calls this directly from `page.tsx` for both the merged branch (`programIds` = every one of the vendor's program IDs) and the filtered branch (`programIds` = `[program.id]`).
- `VendorActivityRow`'s shape (`id`, `phone`, `programName`, `kind`, `isReward`, `label`, `createdAt`) is unchanged from today.

- [ ] **Step 1: Write the failing tests for `mapActivityRow`**

Replace the full contents of `test/lib/activity.test.ts` (currently 4 tests against `aggregateActivity` — "tags each event with its program name and phone", "marks redeem and won visits as rewards", "sorts newest first and caps at 15", "skips an event whose card is missing from cardsById") with:

```ts
import { describe, expect, it } from "vitest";
import { mapActivityRow, listActivity } from "@/lib/activity";

describe("mapActivityRow", () => {
  const programNameById = { p1: "Coffee Stamps" };
  const card = { id: "c1", phone: "+6591234567", program_id: "p1" };

  it("maps a stamp event", () => {
    const row = mapActivityRow(
      {
        id: "e1",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row).toEqual({
      id: "e1",
      phone: "+6591234567",
      programName: "Coffee Stamps",
      kind: "stamp",
      isReward: false,
      label: "stamp",
      createdAt: "2026-07-10T00:00:00Z",
    });
  });

  it("maps a redeem event as a reward", () => {
    const row = mapActivityRow(
      {
        id: "e2",
        card_id: "c1",
        kind: "redeem",
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row?.isReward).toBe(true);
    expect(row?.label).toBe("redeem");
  });

  it("maps a won visit as 'Won' and a reward", () => {
    const row = mapActivityRow(
      {
        id: "e3",
        card_id: "c1",
        kind: "visit",
        payload: { won: true },
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row?.label).toBe("Won");
    expect(row?.isReward).toBe(true);
  });

  it("maps a losing visit as 'Visit', not a reward", () => {
    const row = mapActivityRow(
      {
        id: "e4",
        card_id: "c1",
        kind: "visit",
        payload: { won: false },
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row?.label).toBe("Visit");
    expect(row?.isReward).toBe(false);
  });

  it("returns null when the event's card is missing", () => {
    const row = mapActivityRow(
      {
        id: "e5",
        card_id: "unknown",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
      undefined,
      programNameById,
    );
    expect(row).toBeNull();
  });

  it("falls back to '—' when the card's program has no name entry", () => {
    const row = mapActivityRow(
      {
        id: "e6",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
      { id: "c1", phone: "+6591234567", program_id: "unknown-program" },
      programNameById,
    );
    expect(row?.programName).toBe("—");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test activity.test.ts`
Expected: FAIL — `mapActivityRow` doesn't exist yet in `src/lib/activity.ts` (still exports `aggregateActivity`, `listVendorActivity`).

- [ ] **Step 3: Write `mapActivityRow` and the new `listActivity` shell**

Replace the full contents of `src/lib/activity.ts`:

```ts
import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";
import { isWonVisit } from "@/lib/metrics";

export type VendorActivityRow = {
  id: string;
  phone: string;
  programName: string;
  kind: string;
  isReward: boolean;
  label: string;
  createdAt: string;
};

type ActivityEvent = {
  id: string;
  card_id: string;
  kind: string;
  payload?: unknown;
  created_at: string;
};
type ActivityCard = { id: string; phone: string; program_id: string };

// Pure: classify a single event against its card. Returns null when the
// event's card isn't in the caller's lookup — defensive; the impure shell
// only ever passes events whose cards it already fetched, so this should
// never actually happen given correct callers.
export function mapActivityRow(
  event: ActivityEvent,
  card: ActivityCard | undefined,
  programNameById: Record<string, string>,
): VendorActivityRow | null {
  if (!card) return null;
  const won = isWonVisit(event);
  const isReward = event.kind === "redeem" || won;
  const label = won ? "Won" : event.kind === "visit" ? "Visit" : event.kind;
  return {
    id: event.id,
    phone: card.phone,
    programName: programNameById[card.program_id] ?? "—",
    kind: event.kind,
    isReward,
    label,
    createdAt: event.created_at,
  };
}

export type ActivityTypeFilter = "stamps" | "rewards";

export type ListActivityOptions = {
  programIds: string[];
  type?: ActivityTypeFilter;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
};

export type ListActivityResult = {
  rows: VendorActivityRow[];
  hasMore: boolean;
};

// Impure shell: every activity event across the given programs, newest
// first, filtered by type/date and paginated at the database level (not
// filtered against an already-fetched batch — a date range or type filter
// must reach full history, not just whatever a fixed row cap happened to
// load). Requests `limit + 1` rows (via .range's inclusive bounds) to
// detect whether a next page exists without a separate COUNT query.
export async function listActivity(
  options: ListActivityOptions,
): Promise<ListActivityResult> {
  const { programIds, type, dateFrom, dateTo, limit, offset } = options;
  if (programIds.length === 0) return { rows: [], hasMore: false };

  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("id,phone,program_id")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listActivity: ${cardsError.message}`);

  const cards = cardsData ?? [];
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length === 0) return { rows: [], hasMore: false };

  let query = supabase
    .from("stamp_events")
    .select("id,card_id,kind,payload,created_at")
    .in("card_id", cardIds);

  // payload.won is always an explicit boolean on every 'visit' row (never
  // null/absent — written by recordVisitAction), so these payload-path
  // equality filters never hit SQL's NULL-comparison trap.
  if (type === "stamps") {
    query = query.or("kind.eq.stamp,and(kind.eq.visit,payload->>won.eq.false)");
  } else if (type === "rewards") {
    query = query.or("kind.eq.redeem,and(kind.eq.visit,payload->>won.eq.true)");
  }
  if (dateFrom) {
    query = query.gte("created_at", `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }

  const { data: eventsData, error: eventsError } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (eventsError) throw new Error(`listActivity: ${eventsError.message}`);

  const events = eventsData ?? [];
  const hasMore = events.length > limit;
  const pageEvents = events.slice(0, limit);

  const rows = pageEvents
    .map((event) =>
      mapActivityRow(event, cardsById.get(event.card_id), programNameById),
    )
    .filter((row): row is VendorActivityRow => row !== null);

  return { rows, hasMore };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test activity.test.ts`
Expected: PASS (all `mapActivityRow` cases)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: `pnpm check` passes. `pnpm test` will show failures in `activity-page.dom.test.tsx` (still imports the now-deleted `VendorActivityList`/old shape) and possibly `page.tsx` failing to typecheck (still calls the removed `listVendorActivity`) — **this is expected at this point**; Task 2 fixes both. Confirm the only failures are in those two files, nothing else.

- [ ] **Step 6: Commit**

```bash
git add src/lib/activity.ts test/lib/activity.test.ts
git commit -m "feat: unify activity queries into listActivity with server-side type/date filtering and pagination"
```

(Committing here even though `activity-page.dom.test.tsx`/`page.tsx` are temporarily broken is intentional and matches this repo's precedent for a data-layer-then-UI two-task split — Task 2 lands immediately after and fixes both. Note this explicitly in the Task 2 dispatch so the implementer isn't alarmed by inherited red tests.)

---

### Task 2: Table, filters, and pagination UI

**Files:**

- Create: `src/components/ui/table.tsx` (shadcn CLI)
- Create: `src/app/dashboard/activity/activity-table.tsx`
- Create: `src/app/dashboard/activity/activity-filters.tsx`
- Modify: `src/app/dashboard/activity/page.tsx` (full rewrite)
- Modify: `src/app/dashboard/activity/activity-page.dom.test.tsx` (full rewrite)

**Interfaces:**

- Consumes: `listActivity` and `VendorActivityRow` from `@/lib/activity` (Task 1).
- Consumes: `ProgramSwitcher`'s param-copying technique — `new URLSearchParams(searchParams.toString())` — for Prev/Next link construction (same technique, applied to `page` instead of `p`).
- Produces: `ActivityTable({ activity: VendorActivityRow[], showProgram: boolean })` — the table itself, including its own empty state.
- Produces: `ActivityFilters({ basePath: string, currentP: string | undefined, type: string | undefined, from: string | undefined, to: string | undefined })` — the filter form.

- [ ] **Step 1: Install shadcn Table**

Run: `pnpm dlx shadcn@latest add table`
Expected: creates `src/components/ui/table.tsx` (new-york style, matching this repo's other generated `components/ui/*` files — exports `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, etc.). Accept CLI defaults if prompted.

- [ ] **Step 2: Run `pnpm check` to confirm the generated file compiles cleanly**

Run: `pnpm check`
Expected: PASS (the new file isn't used anywhere yet).

- [ ] **Step 3: Write `ActivityTable`**

Create `src/app/dashboard/activity/activity-table.tsx`:

```tsx
import { Gift, Stamp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatSgtDateTime } from "@/lib/format";
import type { VendorActivityRow } from "@/lib/activity";

// Extracted so it's testable with plain props, mirroring this repo's
// existing precedent for list/table extraction (e.g. VendorCustomerList).
export function ActivityTable({
  activity,
  showProgram,
}: {
  activity: VendorActivityRow[];
  showProgram: boolean;
}) {
  if (activity.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          No activity matches these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Phone</TableHead>
            {showProgram && <TableHead>Program</TableHead>}
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activity.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      event.isReward
                        ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-accent"
                        : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    {event.isReward ? (
                      <Gift className="size-3.5" />
                    ) : (
                      <Stamp className="size-3.5" />
                    )}
                  </span>
                  <span className="font-medium capitalize">{event.label}</span>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {event.phone}
              </TableCell>
              {showProgram && (
                <TableCell>
                  <Badge variant="secondary">{event.programName}</Badge>
                </TableCell>
              )}
              <TableCell className="text-right text-muted-foreground">
                {formatSgtDateTime(event.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Write `ActivityFilters`**

Create `src/app/dashboard/activity/activity-filters.tsx`:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const TYPE_ALL = "all";

export function ActivityFilters({
  basePath,
  currentP,
  type,
  from,
  to,
}: {
  basePath: string;
  currentP: string | undefined;
  type: string | undefined;
  from: string | undefined;
  to: string | undefined;
}) {
  const hasActiveFilters = Boolean(type || from || to);
  const clearHref = currentP ? `${basePath}?p=${currentP}` : basePath;

  return (
    <form
      action={basePath}
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4"
    >
      {currentP && <input type="hidden" name="p" value={currentP} />}
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-type"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Type
        </Label>
        <Select name="type" defaultValue={type ?? TYPE_ALL}>
          <SelectTrigger id="activity-type" className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_ALL}>All</SelectItem>
            <SelectItem value="stamps">Stamps</SelectItem>
            <SelectItem value="rewards">Rewards</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-from"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          From
        </Label>
        <Input
          id="activity-from"
          type="date"
          name="from"
          defaultValue={from ?? ""}
          className="h-9 w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="activity-to"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          To
        </Label>
        <Input
          id="activity-to"
          type="date"
          name="to"
          defaultValue={to ?? ""}
          className="h-9 w-40"
        />
      </div>
      <Button type="submit" variant="outline" className="h-9 rounded-lg">
        Apply filters
      </Button>
      {hasActiveFilters && (
        <a
          href={clearHref}
          className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Clear filters
        </a>
      )}
    </form>
  );
}
```

`Select`'s `name="type"` with a real `TYPE_ALL = "all"` sentinel value (not an empty string — Radix disallows empty item values, same constraint this repo already worked around in `program-switcher.tsx`) bubbles a hidden native select into the surrounding `<form>`, submitted as `type=all|stamps|rewards` on Apply. `page.tsx` (Step 5) treats `type=all` the same as `type` being absent.

- [ ] **Step 5: Rewrite `page.tsx`**

Replace the full contents of `src/app/dashboard/activity/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { listActivity } from "@/lib/activity";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
import { ActivityTable } from "@/app/dashboard/activity/activity-table";
import { ActivityFilters } from "@/app/dashboard/activity/activity-filters";

const PAGE_SIZE = 25;

type ActivityPageProps = {
  searchParams: Promise<{
    p?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function paginationHref(
  basePath: string,
  current: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p, type: rawType, from, to, page: rawPage } = await searchParams;
  const type =
    rawType === "stamps" || rawType === "rewards" ? rawType : undefined;
  const page = Math.max(1, Number(rawPage) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (!p && programs.length === 1) {
    const params = new URLSearchParams();
    if (rawType) params.set("type", rawType);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (rawPage) params.set("page", rawPage);
    params.set("p", programs[0].id);
    redirect(`/dashboard/activity?${params.toString()}`);
  }

  const basePath = "/dashboard/activity";

  if (!p) {
    const { rows, hasMore } = await listActivity({
      programIds: programs.map((prog) => prog.id),
      type,
      dateFrom: from,
      dateTo: to,
      limit: PAGE_SIZE,
      offset,
    });
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <ProgramSwitcher
            programs={programs}
            currentId=""
            basePath={basePath}
          />
          <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recent stamps, plays, and redemptions across every program.
          </p>
        </div>
        <ActivityFilters
          basePath={basePath}
          currentP={undefined}
          type={type}
          from={from}
          to={to}
        />
        <ActivityTable activity={rows} showProgram />
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <a
              href={paginationHref(basePath, { type, from, to }, page - 1)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              ← Previous
            </a>
          ) : (
            <span />
          )}
          {hasMore && (
            <a
              href={paginationHref(basePath, { type, from, to }, page + 1)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              Next →
            </a>
          )}
        </div>
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const { rows, hasMore } = await listActivity({
    programIds: [program.id],
    type,
    dateFrom: from,
    dateTo: to,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        <ProgramSwitcher
          programs={programs}
          currentId={program.id}
          basePath={basePath}
        />
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent stamps, plays, and redemptions for {program.name}.
        </p>
      </div>
      <ActivityFilters
        basePath={basePath}
        currentP={program.id}
        type={type}
        from={from}
        to={to}
      />
      <ActivityTable activity={rows} showProgram={false} />
      <div className="flex items-center justify-between">
        {page > 1 ? (
          <a
            href={paginationHref(
              basePath,
              { p: program.id, type, from, to },
              page - 1,
            )}
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            ← Previous
          </a>
        ) : (
          <span />
        )}
        {hasMore && (
          <a
            href={paginationHref(
              basePath,
              { p: program.id, type, from, to },
              page + 1,
            )}
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Next →
          </a>
        )}
      </div>
    </main>
  );
}
```

The single-program redirect now preserves every incoming filter/page param (not just adding `p`), matching this session's established precedent from the Customers page's `q`-preserving redirect.

- [ ] **Step 6: Rewrite the test file**

Replace the full contents of `src/app/dashboard/activity/activity-page.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTable } from "./activity-table";
import type { VendorActivityRow } from "@/lib/activity";

const activity: VendorActivityRow[] = [
  {
    id: "e1",
    phone: "+6591234567",
    programName: "Coffee Stamps",
    kind: "stamp",
    isReward: false,
    label: "stamp",
    createdAt: "2026-07-10T00:00:00Z",
  },
];

describe("ActivityTable", () => {
  it("renders an event's phone and program badge when showProgram is true", () => {
    render(<ActivityTable activity={activity} showProgram />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Program" }),
    ).toBeInTheDocument();
  });

  it("omits the Program column when showProgram is false", () => {
    render(<ActivityTable activity={activity} showProgram={false} />);
    expect(
      screen.queryByRole("columnheader", { name: "Program" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Coffee Stamps")).not.toBeInTheDocument();
  });

  it("shows an empty state with zero activity", () => {
    render(<ActivityTable activity={[]} showProgram />);
    expect(
      screen.getByText(/no activity matches these filters/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm test activity-page.dom.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 8: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass — this also confirms Task 1's temporarily-broken tests (from its own Step 5) are now fixed by this task's `page.tsx` rewrite.

- [ ] **Step 9: Manually verify in the running app**

Run: `pnpm dev`, go to `/dashboard/activity` with a vendor that has multiple programs and some activity history. Confirm: the table renders with a Program column, the filter form's Type select and From/To dates work (Apply re-queries and narrows results, Clear filters resets), Prev/Next pagination appears when there are more than 25 rows and preserves the active filters across page changes. Repeat on a single-program's filtered view (`?p=<id>`) and confirm the Program column is absent there.

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/table.tsx src/app/dashboard/activity/activity-table.tsx src/app/dashboard/activity/activity-filters.tsx src/app/dashboard/activity/page.tsx src/app/dashboard/activity/activity-page.dom.test.tsx
git commit -m "feat: replace Activity page's card list with a filterable, paginated table"
```
