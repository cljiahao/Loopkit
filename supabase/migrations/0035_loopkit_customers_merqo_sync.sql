-- loopkit/supabase/migrations/0035_loopkit_customers_merqo_sync.sql
-- Extends the two loopkit.customers sync triggers (0021_loopkit_customers.sql)
-- with a second write to the shared cross-kit merqo.customers table (merqo
-- migration 0018), alongside the existing local loopkit.customers write —
-- not a replacement. loopkit's own dashboard keeps reading loopkit.customers
-- exactly as today; merqo.customers is additive substrate for future
-- cross-kit customer-identity features. See
-- merqo/docs/business/2026-08-16-cross-kit-customer-identity-design.md.
--
-- Guarded the same way as 0030_vendor_feedback_backfill.sql: loopkit's own
-- CI/local `supabase start` builds a fresh Postgres from only loopkit's
-- migrations, with no merqo schema at all, so an unguarded call to
-- merqo.upsert_customer would hard-fail every card/stamp-event insert there.
-- Real environments apply merqo's migrations first, so the function exists
-- there and the sync runs as intended; this only short-circuits when it's
-- genuinely absent.

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

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'merqo' and p.proname = 'upsert_customer'
  ) then
    perform merqo.upsert_customer(v_vendor_id, new.phone, new.customer_name);
  end if;

  return new;
end;
$$;

create or replace function loopkit.sync_customer_on_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_vendor_id uuid; v_phone text;
begin
  select p.vendor_id, c.phone into v_vendor_id, v_phone
    from loopkit.cards c join loopkit.programs p on p.id = c.program_id
    where c.id = new.card_id;
  update loopkit.customers set last_seen_at = new.created_at where vendor_id = v_vendor_id and phone = v_phone;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'merqo' and p.proname = 'upsert_customer'
  ) then
    perform merqo.upsert_customer(v_vendor_id, v_phone);
  end if;

  return new;
end;
$$;
