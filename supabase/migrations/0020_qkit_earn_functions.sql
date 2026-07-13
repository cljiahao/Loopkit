-- loopkit/supabase/migrations/0020_qkit_earn_functions.sql
-- Two SECURITY DEFINER functions backing the anonymous /earn claim flow.
-- add_stamp/record_visit are owns_program-gated (vendor session required) and
-- cannot be called from this anonymous customer flow, so these use
-- merqo.kit_events + qkit_earn_events as their authorization gate instead.
-- Note on the SECURITY DEFINER + RLS interaction: this only reliably bypasses
-- RLS because the function owner (the migration role) owns the underlying
-- tables / has BYPASSRLS in this Supabase project — not a universal guarantee
-- of SECURITY DEFINER in general.

create or replace function loopkit.qkit_earn_lookup(p_order_id uuid, p_phone text)
returns table (
  vendor_id        uuid,
  program_id       uuid,
  program_type     text,
  program_config   jsonb,
  stamps_required  int,
  reward_text      text,
  already_claimed  boolean,
  card_state       jsonb,
  card_stamp_count int,
  card_reward_count int
)
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor_id uuid;
begin
  select e.vendor_id
    into v_vendor_id
  from merqo.kit_events e
  where e.event_type = 'order_completed'
    and e.kit_name = 'qkit'
    and (e.event_data->>'order_id')::uuid = p_order_id
  limit 1;

  if v_vendor_id is null then
    return;
  end if;

  return query
    select
      v_vendor_id,
      c.program_id,
      p.type,
      p.config,
      p.stamps_required,
      p.reward_text,
      exists (select 1 from loopkit.qkit_earn_events ev where ev.order_id = p_order_id),
      coalesce(cd.state, '{}'::jsonb),
      coalesce(cd.stamp_count, 0),
      coalesce(cd.reward_count, 0)
    from loopkit.qkit_earn_config c
    join loopkit.programs p on p.id = c.program_id and p.active
    left join loopkit.cards cd on cd.program_id = c.program_id and cd.phone = p_phone
    where c.vendor_id = v_vendor_id and c.enabled;
end;
$$;

grant execute on function loopkit.qkit_earn_lookup(uuid, text) to anon, authenticated, service_role;

create or replace function loopkit.qkit_earn_commit(
  p_order_id    uuid,
  p_phone       text,
  p_name        text,
  p_stamp_count int,
  p_state       jsonb
) returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor_id  uuid;
  v_program_id uuid;
  v_card       loopkit.cards;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  select e.vendor_id into v_vendor_id
  from merqo.kit_events e
  where e.event_type = 'order_completed'
    and e.kit_name = 'qkit'
    and (e.event_data->>'order_id')::uuid = p_order_id
  limit 1;

  if v_vendor_id is null then
    raise exception 'invalid order';
  end if;

  if exists (select 1 from loopkit.qkit_earn_events where order_id = p_order_id) then
    select cd.* into v_card
    from loopkit.qkit_earn_events ev
    join loopkit.cards cd on cd.id = ev.card_id
    where ev.order_id = p_order_id;
    return v_card;
  end if;

  select c.program_id into v_program_id
  from loopkit.qkit_earn_config c
  where c.vendor_id = v_vendor_id and c.enabled;

  if v_program_id is null then
    raise exception 'not configured';
  end if;

  insert into loopkit.cards (program_id, phone, stamp_count, state, customer_name)
    values (v_program_id, p_phone, p_stamp_count, p_state, p_name)
  on conflict (program_id, phone) do update
    set stamp_count = excluded.stamp_count,
        state = excluded.state,
        customer_name = coalesce(excluded.customer_name, loopkit.cards.customer_name),
        last_event_at = now(),
        updated_at = now()
  returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  insert into loopkit.qkit_earn_events (order_id, vendor_id, card_id)
    values (p_order_id, v_vendor_id, v_card.id);

  return v_card;
end;
$$;

grant execute on function loopkit.qkit_earn_commit(uuid, text, text, int, jsonb) to anon, authenticated, service_role;
