-- loopkit/supabase/migrations/0019_qkit_earn.sql
-- Vendor-owned setting: which program (if any) earns a stamp/visit from a
-- completed qkit order. Pro-gated in the app layer (checked against
-- loopkit.is_pro), same pattern as every other Pro feature here.
create table loopkit.qkit_earn_config (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  program_id uuid not null references loopkit.programs(id),
  enabled    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loopkit.qkit_earn_config enable row level security;

create policy qkit_earn_config_own on loopkit.qkit_earn_config
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

grant select, insert, update on loopkit.qkit_earn_config to authenticated;
grant all on loopkit.qkit_earn_config to service_role;

-- Idempotency: one award per qkit order, ever. A repeat visit to the same
-- /earn?order=<id> link (or a network retry) must not double-stamp.
create table loopkit.qkit_earn_events (
  order_id   uuid primary key,
  vendor_id  uuid not null,
  card_id    uuid not null references loopkit.cards(id),
  created_at timestamptz not null default now()
);

-- No RLS needed: this table is written/read only from inside the SECURITY
-- DEFINER function in Task 5, never queried directly by a client role.

-- Optional name capture alongside the existing phone-only identity model.
alter table loopkit.cards add column customer_name text;
