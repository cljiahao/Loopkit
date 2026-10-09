-- Serialize balance checks/debits and voucher status transitions.
-- Phone-only customer authorization remains a separate unresolved finding.

create or replace function loopkit.redeem_voucher_by_token(p_token text)
returns loopkit.reward_vouchers
language plpgsql security definer set search_path = '' as $$
declare
  v_voucher loopkit.reward_vouchers;
begin
  select * into v_voucher from loopkit.reward_vouchers
    where voucher_token = p_token for update;
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
  if p_phone is null or p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  select config, reward_expiry_days into v_config, v_expiry_days
    from loopkit.programs
    where id = p_program and active
      and type = 'stamp'
      and config->>'variant' = 'points'
      and config->>'redemption_mode' = 'catalog' for share;
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
  if v_cost is null or v_cost <= 0 or v_label is null or btrim(v_label) = '' then
    raise exception 'invalid reward';
  end if;

  select id, stamp_count into v_card_id, v_stamp_count
    from loopkit.cards
    where program_id = p_program and phone = p_phone for update;
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
  select * into v_card from loopkit.cards where id = p_card for update;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  if p_points is null or p_points <= 0 or p_points > v_card.stamp_count then
    raise exception 'invalid amount';
  end if;

  select config into v_config from loopkit.programs where id = v_card.program_id;
  if v_config->>'redemption_mode' is distinct from 'offset' then
    raise exception 'not_offset_mode';
  end if;
  v_rate_points := (v_config->'offset_rate'->>'points')::numeric;
  v_rate_dollars := (v_config->'offset_rate'->>'dollars')::numeric;
  if v_rate_points is null or v_rate_points <= 0
     or v_rate_dollars is null or v_rate_dollars <= 0 then
    raise exception 'invalid offset rate';
  end if;

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

revoke all on function loopkit.redeem_voucher_by_token(text) from public, anon;
grant execute on function loopkit.redeem_voucher_by_token(text) to authenticated;
revoke all on function loopkit.apply_points_offset(uuid,int) from public, anon;
grant execute on function loopkit.apply_points_offset(uuid,int) to authenticated;
