# Vendor-level customer database

Date: 2026-07-14

## Problem

loopkit has no concept of "a vendor's customer" — only per-program cards.
`loopkit.cards` is keyed by `(program_id, phone)`, so a phone enrolled in 2 of
a vendor's programs produces 2 unrelated rows on 2 separate program-scoped
pages. There's no way to see "everyone who's ever interacted with this
vendor" in one place, and no stable per-vendor customer identity to build on.

This also matters beyond loopkit's own UI: the Merqo roadmap
(`docs/business/2026-07-12-merqo-roadmap.md`) already envisions a future
`reachkit` (CRM — email/SMS/WhatsApp), registered in `merqo.products` as
`coming_soon` but not yet built. reachkit's own contact list will be
populated by consuming the same `merqo.kit_events` bus qkit→loopkit
auto-award already uses (kits never query each other's schemas directly) —
so loopkit doesn't need to build anything reachkit-specific now. It just
needs its own customer identity to not require painful rework later.

## Decisions (from brainstorming + research)

- Build a real `loopkit.customers` table now (not a computed view, not
  app-level upserts scattered across RPCs) — a stable identity per
  `(vendor_id, phone)` that both serves loopkit's own vendor-level Customers
  page today and gives a natural place to later emit a `customer_updated`
  kit_event from, with zero rework.
- Sync mechanism: two DB triggers (`AFTER INSERT` on `loopkit.cards` and on
  `loopkit.stamp_events`), not application-code upserts. Verified against
  research: DB-level sync is the correct choice specifically because ~5
  independent RPCs (`vendor_join`, `enroll_card`, `add_stamp`,
  `record_visit`-backed paths, `qkit_earn_commit`) write to `cards` today,
  and correctness must not depend on every call site remembering to upsert.
  Matches the existing `qkit.order_completed` trigger pattern already in
  production. The upsert itself uses Postgres-native
  `INSERT ... ON CONFLICT DO UPDATE`.
- Scope for the vendor-level Customers view: merged customer list, which
  program(s) each customer is enrolled in, and cross-program totals (total
  stamps/visits, total rewards across all the vendor's programs). Explicitly
  **not** in scope: manual contact/tag/note actions on a customer — that's
  reachkit's product territory permanently, not a "wait until reachkit
  ships" defer; building it in loopkit now would create a competing surface
  once reachkit exists.
- Cross-program totals are computed at read time (a join/aggregate query),
  not stored — this is a pure loopkit-internal computation (programs, cards,
  stamp_events all belong to loopkit), so building it now creates zero
  future rework regardless of when/whether reachkit ships.
- `loopkit.customers.name` is fed by `cards.customer_name` (added in a prior
  session for the qkit-earn `/earn` flow, currently write-only — nothing
  displays it yet). This table is the first place that name becomes visible
  to the vendor.
- Trigger failures are not swallowed — a single flat `ON CONFLICT DO UPDATE`
  with no external calls should not realistically fail; if it ever does, it
  should abort the write loudly rather than silently drift the customer
  table out of sync.

## A. Schema

New migration, `loopkit.customers`:

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
create policy customers_own on loopkit.customers
  for select using (
    vendor_id = (select auth.uid())
  );
grant select on loopkit.customers to authenticated;
grant all on loopkit.customers to service_role;
```

RLS is select-only for `authenticated` — this table is never written by app
code, only by the two triggers below (which run as the inserting
transaction's privileges via `SECURITY DEFINER` RPCs, same trust model as
every other loopkit write path).

## B. Sync triggers

**Trigger 1 — `AFTER INSERT ON loopkit.cards`:**

```sql
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

create trigger cards_sync_customer
  after insert on loopkit.cards
  for each row execute function loopkit.sync_customer_on_card();
```

**Trigger 2 — `AFTER INSERT ON loopkit.stamp_events`:** bumps `last_seen_at`
for any activity (stamp/visit/redeem, all program types — `stamp_events` is
the unified event log per `stats.ts`'s `classifyActivity`), not just joins.

```sql
create or replace function loopkit.sync_customer_on_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_vendor_id uuid; v_phone text;
begin
  select p.vendor_id, c.phone into v_vendor_id, v_phone
    from loopkit.cards c join loopkit.programs p on p.id = c.program_id
    where c.id = new.card_id;
  update loopkit.customers
    set last_seen_at = new.created_at
    where vendor_id = v_vendor_id and phone = v_phone;
  return new;
end;
$$;

create trigger stamp_events_sync_customer
  after insert on loopkit.stamp_events
  for each row execute function loopkit.sync_customer_on_activity();
```

Both functions are `security definer` with `search_path = ''` (matching
every existing loopkit function's pattern) so they run regardless of which
RPC's privileges triggered the insert.

## C. Customers page

`src/app/dashboard/customers/page.tsx` gains a second mode:

- **No `?p=`** (new default): query `loopkit.customers` for the signed-in
  vendor, joined/aggregated against `cards`+`programs` to compute, per
  customer: which program name(s) they hold a card in, total stamps/visits
  (sum across their cards), total rewards (sum `reward_count`), and
  `last_seen_at`. Search (`?q=`) filters by phone, same as today.
- **`?p=<id>`** (unchanged): today's exact per-program filtered view — one
  program's card-holders with that program's specific progress label. Every
  existing `ProgramCard` footer link keeps working with no change.

## D. Testing

- Migration + triggers: manual SQL application (same pattern as every
  migration this session — exact statements handed over, applied via the
  Supabase dashboard SQL editor, verified with a follow-up query).
- Customers page: component/unit tests for the new vendor-level aggregation
  query (pure function, given rows → aggregated customer list) and the
  page's two-mode rendering, following the same test patterns established in
  the dashboard card grid work (`*.dom.test.tsx`, jsdom).

## Out of scope

- Manual contact/tag/note actions on a customer (permanently — reachkit's
  territory).
- Any reachkit-specific code, API, or event emission — loopkit only needs to
  have a clean identity table; wiring an actual `kit_events` emission for
  reachkit to consume happens if/when reachkit is actually built.
- Activity page placement (card vs. separate page) — separate spec.
- Customer vs. vendor login separation — separate spec.
