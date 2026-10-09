-- Qualify columns that overlap with RETURNS TABLE output parameters.
-- Existing function signatures, row locks and execution grants remain unchanged.

create or replace function loopkit.vendor_join_referred(
  p_vendor uuid, p_phone text, p_referral_code text
)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, vendor_avatar_url text, referral_credit jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_referral loopkit.referral_hosts%rowtype;
  v_program  loopkit.programs%rowtype;
  v_card     loopkit.cards%rowtype;
  v_credit   jsonb := null;
  v_prev int;
  v_expired int;
  v_crossings int;
begin
  perform loopkit.vendor_join_enroll(p_vendor, p_phone);

  select rh.* into v_referral from loopkit.referral_hosts rh
    where rh.referral_code = p_referral_code and rh.vendor_id = p_vendor
      and exists (select 1 from loopkit.programs p
        where p.id = rh.program_id and p.vendor_id = p_vendor and p.active) for update;

  if found and v_referral.host_phone <> p_phone then
    insert into loopkit.referral_credits (referral_host_id, guest_phone)
      values (v_referral.id, p_phone)
      on conflict (referral_host_id, guest_phone) do nothing;

    if found then
      update loopkit.referral_hosts rh set guest_count = rh.guest_count + 1
        where rh.id = v_referral.id;
    end if;
    select p.* into v_program from loopkit.programs p
    where p.id=v_referral.program_id and p.vendor_id=p_vendor and p.active for share;
    if not found then raise exception 'invalid referral program'; end if;
    perform 1 from loopkit.referral_credits rc where rc.referral_host_id=v_referral.id and rc.guest_phone=p_phone and rc.credited_at is null for update;
    if found then
      perform loopkit.enroll_card(v_referral.program_id, v_referral.host_phone);


      if v_program.type = 'stamp' then
        insert into loopkit.cards (program_id, phone, stamp_count)
        values (v_referral.program_id, v_referral.host_phone, 0)
        on conflict on constraint cards_program_id_phone_key do nothing;
        select c.* into v_card from loopkit.cards c
        where c.program_id = v_referral.program_id and c.phone = v_referral.host_phone
        for update;
        v_expired := loopkit._expire_stale_vouchers_unchecked(v_card.id);
        v_prev := greatest(v_card.stamp_count - v_expired * v_program.stamps_required, 0);
        update loopkit.cards c set stamp_count = v_prev + 1, updated_at = now()
        where c.id = v_card.id returning c.* into v_card;
        v_crossings := loopkit.count_threshold_crossings(v_prev, v_card.stamp_count, v_program.stamps_required);
        if v_crossings > 0 then
          perform loopkit._grant_reward_voucher_unchecked(v_card.id, v_program.reward_text, v_program.reward_expiry_days, v_crossings, false);
        end if;
        insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
        update loopkit.referral_credits rc set credited_at = now()
          where rc.referral_host_id = v_referral.id and rc.guest_phone = p_phone;
      else
        select c.* into v_card from loopkit.cards c
          where c.program_id = v_referral.program_id and c.phone = v_referral.host_phone;

        v_credit := jsonb_build_object(
          'pending', true,
          'referralHostId', v_referral.id,
          'guestPhone', p_phone,
          'programId', v_program.id,
          'programType', v_program.type,
          'programConfig', v_program.config,
          'stampsRequired', v_program.stamps_required,
          'rewardText', v_program.reward_text,
          'hostPhone', v_referral.host_phone,
          'state', coalesce(v_card.state, '{}'::jsonb),
          'stampCount', coalesce(v_card.stamp_count, 0),
          'rewardCount', coalesce(v_card.reward_count, 0)
        );
      end if;
    end if;
  end if;

  return query
    select vjc.*, v_credit from loopkit.vendor_join_cards(p_vendor, p_phone) vjc;
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
  select c.* into v_card from loopkit.cards c where c.id = p_card for update;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  if p_points is null or p_points <= 0 or p_points > v_card.stamp_count then
    raise exception 'invalid amount';
  end if;

  select p.config into v_config from loopkit.programs p where p.id = v_card.program_id;
  if v_config->>'redemption_mode' is distinct from 'offset' then
    raise exception 'not_offset_mode';
  end if;
  v_rate_points := (v_config->'offset_rate'->>'points')::numeric;
  v_rate_dollars := (v_config->'offset_rate'->>'dollars')::numeric;
  if v_rate_points is null or v_rate_points <= 0
     or v_rate_dollars is null or v_rate_dollars <= 0 then
    raise exception 'invalid offset rate';
  end if;

  update loopkit.cards c
    set stamp_count = c.stamp_count - p_points, updated_at = now()
    where c.id = p_card
    returning c.* into v_card;

  insert into loopkit.stamp_events (card_id, kind)
    values (p_card, 'points_offset_applied');

  return query select v_card.id, v_card.phone, v_card.stamp_count,
    round(p_points * v_rate_dollars / v_rate_points, 2);
end;
$$;
