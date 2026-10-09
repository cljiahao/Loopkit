create or replace function loopkit._expire_stale_vouchers_unchecked(p_card uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with expired as (
    update loopkit.reward_vouchers
      set status = 'expired', updated_at = now()
      where card_id = p_card and status = 'active'
        and expires_at is not null and expires_at < now()
      returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;
revoke all on function loopkit._expire_stale_vouchers_unchecked(uuid) from public, anon, authenticated;
create or replace function loopkit._grant_reward_voucher_unchecked(
  p_card uuid, p_reward_text text, p_expiry_days int,
  p_count int default 1, p_immediate boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_program_id uuid;
  i int;
begin
  select program_id into v_program_id from loopkit.cards where id = p_card;
  if v_program_id is null then
    raise exception 'not authorized';
  end if;
  for i in 1..p_count loop
    insert into loopkit.reward_vouchers
      (card_id, program_id, reward_text, expires_at, redeemed_at, status)
      values (
        p_card, v_program_id, p_reward_text,
        case when p_immediate or p_expiry_days is null
          then null else now() + (p_expiry_days || ' days')::interval end,
        case when p_immediate then now() else null end,
        case when p_immediate then 'redeemed' else 'active' end
      );
  end loop;
end;
$$;
revoke all on function loopkit._grant_reward_voucher_unchecked(uuid,text,int,int,boolean) from public, anon, authenticated;

create or replace function loopkit.expire_stale_vouchers(p_card uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not loopkit.owns_program((select program_id from loopkit.cards where id = p_card)) then
    raise exception 'not authorized';
  end if;
  return loopkit._expire_stale_vouchers_unchecked(p_card);
end;
$$;
create or replace function loopkit.grant_reward_voucher(
  p_card uuid, p_reward_text text, p_expiry_days int,
  p_count int default 1, p_immediate boolean default false
) returns void language plpgsql security definer set search_path = '' as $$
declare v_program_id uuid;
begin
  select program_id into v_program_id from loopkit.cards where id = p_card;
  if v_program_id is null or not loopkit.owns_program(v_program_id) then
    raise exception 'not authorized';
  end if;
  perform loopkit._grant_reward_voucher_unchecked(p_card,p_reward_text,p_expiry_days,p_count,p_immediate);
end;
$$;

-- Internal helpers are owner-only; public state commits use the trusted server role.
revoke all on function loopkit._add_stamp_unchecked(uuid, text) from public, anon, authenticated;
revoke all on function loopkit.apply_referral_credit(uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function loopkit.apply_referral_credit(uuid, text, jsonb, text, jsonb) to service_role;

alter policy qkit_earn_config_own on loopkit.qkit_earn_config
  with check (vendor_id = (select auth.uid()) and loopkit.owns_program(program_id));
alter policy referral_hosts_own on loopkit.referral_hosts
  with check (vendor_id = (select auth.uid()) and loopkit.owns_program(program_id));


create or replace function loopkit._add_stamp_unchecked(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
  v_card_id uuid;
  v_config jsonb;
  v_amount int;
  v_required int;
  v_reward_text text;
  v_reward_expiry_days int;
  v_expired_count int;
  v_prev int;
  v_crossings int;
begin
  select config, stamps_required, reward_text, reward_expiry_days
    into v_config, v_required, v_reward_text, v_reward_expiry_days
    from loopkit.programs where id = p_program;
  v_amount := coalesce((v_config->>'points_per_visit')::int, 1);

  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, v_amount)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    v_crossings := loopkit.count_threshold_crossings(0, v_amount, v_required);
    if v_crossings > 0 then
      perform loopkit._grant_reward_voucher_unchecked(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
    end if;
    select * into v_card from loopkit.cards where id = v_card.id;
    return v_card;
  end if;

  select id into v_card_id from loopkit.cards
    where program_id = p_program and phone = p_phone for update;
  v_expired_count := loopkit._expire_stale_vouchers_unchecked(v_card_id);

  select stamp_count into v_prev from loopkit.cards where id = v_card_id;
  v_prev := greatest(v_prev - v_expired_count * v_required, 0);

  update loopkit.cards
    set stamp_count = v_prev + v_amount, updated_at = now()
    where id = v_card_id
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');

  v_crossings := loopkit.count_threshold_crossings(v_prev, v_card.stamp_count, v_required);
  if v_crossings > 0 then
    perform loopkit._grant_reward_voucher_unchecked(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
  end if;
  select * into v_card from loopkit.cards where id = v_card.id;
  return v_card;
end;
$$;

create or replace function loopkit.qkit_earn_commit(
  p_order_id uuid, p_phone text, p_name text, p_stamp_count int, p_state jsonb
) returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor_id uuid;
  v_program_id uuid;
  v_required int;
  v_reward_text text;
  v_expiry_days int;
  v_prev int;
  v_next int;
  v_expired int;
  v_crossings int;
  v_card loopkit.cards;
begin
  if p_order_id is null or p_phone is null or p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid claim';
  end if;
  if length(p_name) > 100 then raise exception 'invalid name'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_order_id::text, 0));
  select e.vendor_id into v_vendor_id from merqo.kit_events e
  where e.event_type = 'order_completed' and e.kit_name = 'qkit'
    and e.event_data->>'order_id' = p_order_id::text limit 1;
  if v_vendor_id is null then raise exception 'invalid order'; end if;
  select cd.* into v_card from loopkit.qkit_earn_events ev
  join loopkit.cards cd on cd.id = ev.card_id where ev.order_id = p_order_id;
  if found then
    if v_card.phone is distinct from p_phone then raise exception 'order already claimed'; end if;
    return v_card;
  end if;
  select p.id, p.stamps_required, p.reward_text, p.reward_expiry_days
  into v_program_id, v_required, v_reward_text, v_expiry_days
  from loopkit.qkit_earn_config c
  join loopkit.programs p on p.id = c.program_id and p.vendor_id = c.vendor_id
  where c.vendor_id = v_vendor_id and c.enabled and p.active and p.type = 'stamp'
  for share of c, p;
  if v_program_id is null then raise exception 'not configured'; end if;
  insert into loopkit.cards (program_id, phone, stamp_count, state, customer_name)
  values (v_program_id, p_phone, 0, '{}'::jsonb, nullif(btrim(p_name), ''))
  on conflict (program_id, phone) do nothing;
  select * into v_card from loopkit.cards
  where program_id = v_program_id and phone = p_phone for update;
  v_expired := loopkit._expire_stale_vouchers_unchecked(v_card.id);
  v_prev := greatest(v_card.stamp_count - v_expired * v_required, 0);
  v_next := greatest(v_prev, least(v_prev + 1, v_required));
  update loopkit.cards set stamp_count = v_next,
    customer_name = coalesce(nullif(btrim(p_name), ''), customer_name),
    last_event_at = now(), updated_at = now()
  where id = v_card.id returning * into v_card;
  v_crossings := loopkit.count_threshold_crossings(v_prev, v_next, v_required);
  if v_crossings > 0 then
    perform loopkit._grant_reward_voucher_unchecked(v_card.id, v_reward_text, v_expiry_days, v_crossings, false);
  end if;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  insert into loopkit.qkit_earn_events (order_id, vendor_id, card_id)
  values (p_order_id, v_vendor_id, v_card.id);
  select * into v_card from loopkit.cards where id = v_card.id;
  return v_card;
end;
$$;
revoke all on function loopkit.qkit_earn_commit(uuid, text, text, int, jsonb) from public;
grant execute on function loopkit.qkit_earn_commit(uuid, text, text, int, jsonb) to anon, authenticated, service_role;


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

  select * into v_referral from loopkit.referral_hosts
    where referral_code = p_referral_code and vendor_id = p_vendor
      and exists (select 1 from loopkit.programs p
        where p.id = referral_hosts.program_id and p.vendor_id = p_vendor and p.active);

  if found and v_referral.host_phone <> p_phone then
    insert into loopkit.referral_credits (referral_host_id, guest_phone)
      values (v_referral.id, p_phone)
      on conflict (referral_host_id, guest_phone) do nothing;

    if found then
      update loopkit.referral_hosts set guest_count = guest_count + 1
        where id = v_referral.id;
      perform loopkit.enroll_card(v_referral.program_id, v_referral.host_phone);
      select * into v_program from loopkit.programs where id = v_referral.program_id;

      if v_program.type = 'stamp' then
        insert into loopkit.cards (program_id, phone, stamp_count)
        values (v_referral.program_id, v_referral.host_phone, 0)
        on conflict on constraint cards_program_id_phone_key do nothing;
        select * into v_card from loopkit.cards
        where program_id = v_referral.program_id and phone = v_referral.host_phone
        for update;
        v_expired := loopkit._expire_stale_vouchers_unchecked(v_card.id);
        v_prev := greatest(v_card.stamp_count - v_expired * v_program.stamps_required, 0);
        update loopkit.cards set stamp_count = v_prev + 1, updated_at = now()
        where id = v_card.id returning * into v_card;
        v_crossings := loopkit.count_threshold_crossings(v_prev, v_card.stamp_count, v_program.stamps_required);
        if v_crossings > 0 then
          perform loopkit._grant_reward_voucher_unchecked(v_card.id, v_program.reward_text, v_program.reward_expiry_days, v_crossings, false);
        end if;
        insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
        update loopkit.referral_credits set credited_at = now()
          where referral_host_id = v_referral.id and guest_phone = p_phone;
      else
        select * into v_card from loopkit.cards
          where loopkit.cards.program_id = v_referral.program_id and phone = v_referral.host_phone;

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

create or replace function loopkit.apply_referral_credit(
  p_referral_host_id uuid,
  p_guest_phone      text,
  p_state            jsonb,
  p_kind             text,
  p_payload          jsonb
)
returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_referral loopkit.referral_hosts%rowtype;
  v_card     loopkit.cards;
begin
  select h.* into v_referral from loopkit.referral_hosts h
    join loopkit.programs p on p.id = h.program_id and p.vendor_id = h.vendor_id and p.active
    where h.id = p_referral_host_id;
  if not found then
    raise exception 'invalid referral';
  end if;

  update loopkit.referral_credits
    set credited_at = now()
    where referral_host_id = p_referral_host_id
      and guest_phone = p_guest_phone
      and credited_at is null;
  if not found then
    return null;
  end if;

  insert into loopkit.cards (program_id, phone, state, last_event_at)
    values (v_referral.program_id, v_referral.host_phone, p_state, now())
  on conflict (program_id, phone) do update
    set state = excluded.state, last_event_at = now(), updated_at = now()
  returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind, payload) values (v_card.id, p_kind, p_payload);

  return v_card;
end;
$$;
