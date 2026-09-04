-- supabase/migrations/0043_loopkit_points_reward_shop.sql
-- Points Club reward shop: two vendor-picked redemption modes replacing
-- the single-fixed-reward behavior for new points programs. See
-- docs/superpowers/specs/2026-09-04-points-club-reward-shop-design.md.

alter table loopkit.reward_vouchers
  add column voucher_token text unique
    default replace(gen_random_uuid()::text, '-', '');

create index reward_vouchers_token_idx on loopkit.reward_vouchers(voucher_token);

alter table loopkit.stamp_events
  drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
    check (kind in ('stamp','redeem','visit','win','adjust',
                     'points_reward_selected','points_offset_applied'));

-- Vendor scan resolve for a voucher token (mirrors card_by_token). Only a
-- vendor who owns the voucher's program can resolve it.
create or replace function loopkit.voucher_by_token(p_token text)
returns table (
  program_id uuid, card_id uuid, voucher_id uuid, phone text,
  reward_text text, status text
)
language sql security definer stable set search_path = '' as $$
  select rv.program_id, rv.card_id, rv.id, c.phone, rv.reward_text, rv.status
  from loopkit.reward_vouchers rv
  join loopkit.cards c on c.id = rv.card_id
  where rv.voucher_token = p_token and loopkit.owns_program(rv.program_id);
$$;

-- Marks one voucher redeemed by its own token — the vendor scan/confirm
-- path for a catalog-mode reward, distinct from redeem_oldest_voucher
-- (which Stamp/Plant's single-fixed-reward redeem still uses).
create or replace function loopkit.redeem_voucher_by_token(p_token text)
returns loopkit.reward_vouchers
language plpgsql security definer set search_path = '' as $$
declare
  v_voucher loopkit.reward_vouchers;
begin
  select * into v_voucher from loopkit.reward_vouchers
    where voucher_token = p_token;
  if v_voucher.id is null or not loopkit.owns_program(v_voucher.program_id) then
    raise exception 'not authorized';
  end if;
  if v_voucher.status = 'redeemed' then
    raise exception 'already_redeemed';
  end if;
  if v_voucher.status = 'expired'
     or (v_voucher.expires_at is not null and v_voucher.expires_at < now()) then
    raise exception 'expired';
  end if;
  update loopkit.reward_vouchers
    set status = 'redeemed', redeemed_at = now(), updated_at = now()
    where id = v_voucher.id
    returning * into v_voucher;
  return v_voucher;
end;
$$;

-- Customer self-service pick: anon-grantable, same phone+program trust
-- model regenerate_card already uses (no customer auth exists in this
-- app). Re-derives cost/label from the program's own config server-side —
-- never trusts a client-supplied cost.
create or replace function loopkit.select_points_reward(
  p_program uuid, p_phone text, p_item_id text
)
returns loopkit.reward_vouchers
language plpgsql security definer set search_path = '' as $$
declare
  v_config       jsonb;
  v_card_id      uuid;
  v_stamp_count  int;
  v_item         jsonb;
  v_cost         int;
  v_label        text;
  v_expiry_days  int;
  v_voucher      loopkit.reward_vouchers;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  select config, reward_expiry_days into v_config, v_expiry_days
    from loopkit.programs
    where id = p_program and active
      and type = 'stamp'
      and config->>'variant' = 'points'
      and config->>'redemption_mode' = 'catalog';
  if v_config is null then
    raise exception 'program not found';
  end if;

  select item into v_item
    from jsonb_array_elements(v_config->'catalog') item
    where item->>'id' = p_item_id;
  if v_item is null then
    raise exception 'reward not found';
  end if;
  v_cost := (v_item->>'cost')::int;
  v_label := v_item->>'label';

  select id, stamp_count into v_card_id, v_stamp_count
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  if v_card_id is null then
    raise exception 'card not found';
  end if;
  if v_stamp_count < v_cost then
    raise exception 'insufficient_points';
  end if;

  update loopkit.cards
    set stamp_count = stamp_count - v_cost, updated_at = now()
    where id = v_card_id;

  insert into loopkit.reward_vouchers
    (card_id, program_id, reward_text, expires_at, status)
    values (
      v_card_id, p_program, v_label,
      case when v_expiry_days is null then null
        else now() + (v_expiry_days || ' days')::interval end,
      'active'
    )
    returning * into v_voucher;

  insert into loopkit.stamp_events (card_id, kind)
    values (v_card_id, 'points_reward_selected');

  return v_voucher;
end;
$$;

-- Vendor-initiated at the register: deducts p_points from a card's
-- balance and returns the dollar figure to apply manually. Owner-gated —
-- distinct from select_points_reward's anon/phone-trust model, since this
-- is a vendor dashboard action against a card the vendor already scanned.
create or replace function loopkit.apply_points_offset(
  p_card uuid, p_points int
)
returns table (id uuid, phone text, stamp_count int, dollars numeric)
language plpgsql security definer set search_path = '' as $$
declare
  v_card         loopkit.cards;
  v_config       jsonb;
  v_rate_points  numeric;
  v_rate_dollars numeric;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  if p_points <= 0 or p_points > v_card.stamp_count then
    raise exception 'invalid amount';
  end if;

  select config into v_config from loopkit.programs where id = v_card.program_id;
  if v_config->>'redemption_mode' is distinct from 'offset' then
    raise exception 'not_offset_mode';
  end if;
  v_rate_points := (v_config->'offset_rate'->>'points')::numeric;
  v_rate_dollars := (v_config->'offset_rate'->>'dollars')::numeric;

  update loopkit.cards
    set stamp_count = stamp_count - p_points, updated_at = now()
    where id = p_card
    returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind)
    values (p_card, 'points_offset_applied');

  return query select v_card.id, v_card.phone, v_card.stamp_count,
    round(p_points * v_rate_dollars / v_rate_points, 2);
end;
$$;

grant execute on function loopkit.voucher_by_token(text) to authenticated;
grant execute on function loopkit.redeem_voucher_by_token(text) to authenticated;
grant execute on function loopkit.select_points_reward(uuid, text, text) to anon, authenticated;
grant execute on function loopkit.apply_points_offset(uuid, int) to authenticated;

-- vendor_join gains active_vouchers (jsonb array) alongside the existing
-- scalar voucher_expires_at — catalog mode can have several simultaneously
-- pending vouchers, not just the one Stamp/Plant's single-fixed-reward
-- model needs. Same DROP-then-CREATE-OR-REPLACE requirement as prior
-- RETURNS TABLE column additions (0016, 0018, 0027).
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, active_vouchers jsonb
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
           r.name, nc.stamp_count,
           (select min(rv.expires_at) from loopkit.reward_vouchers rv
              where rv.card_id = c.id and rv.status = 'active' and rv.expires_at is not null),
           (select coalesce(jsonb_agg(jsonb_build_object(
                'id', rv.id, 'voucher_token', rv.voucher_token,
                'reward_text', rv.reward_text, 'expires_at', rv.expires_at
              ) order by rv.earned_at asc), '[]'::jsonb)
            from loopkit.reward_vouchers rv
            where rv.card_id = c.id and rv.status = 'active'
              and (rv.expires_at is null or rv.expires_at >= now()))
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
