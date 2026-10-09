create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_program loopkit.programs%rowtype;
  v_seed_stamp_count int := 0;
  v_seed_state jsonb := '{}'::jsonb;
  v_seed int;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    return null;
  end if;

  select * into v_program from loopkit.programs where id = p_program and active;
  if not found then
    return null;
  end if;

  if v_program.head_start then
    v_seed := greatest(1, round(v_program.stamps_required * v_program.head_start_percent / 100.0)::int);
    if v_program.type = 'stamp' then
      v_seed_stamp_count := least(v_seed, v_program.stamps_required - 1);
    elsif v_program.type = 'plant' then
      v_seed_state := jsonb_build_object(
        'growth', least(
          greatest(v_seed, round(v_program.stamps_required * 0.25)::int),
          v_program.stamps_required - 1
        ),
        'last_visit_at', now(),
        'blooms', 0,
        'bloomed', false
      );
    end if;
  end if;

  insert into loopkit.cards (program_id, phone, stamp_count, state)
    values (p_program, p_phone, v_seed_stamp_count, v_seed_state)
  on conflict (program_id, phone) do nothing
  returning card_token into v_token;
  return v_token;
end;
$$;


-- Customer reads and mutations require possession of a current scoped card token.
create or replace function loopkit._require_customer_capability(p_vendor uuid,p_phone text,p_token text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer:'||p_vendor::text||':'||p_phone,0));
  perform 1 from loopkit.programs where vendor_id=p_vendor order by id for share;
  perform 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id
  where p.vendor_id=p_vendor and c.phone=p_phone order by c.id for update of c;
  if not exists(select 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id
    where p.vendor_id=p_vendor and c.phone=p_phone and c.card_token=p_token)
  then raise exception 'customer proof required'; end if;
end;
$$;
revoke all on function loopkit._require_customer_capability(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function loopkit.customer_join(p_vendor uuid,p_phone text,p_token text default null,p_referral_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_cards jsonb; v_credit jsonb; v_program uuid; v_token text; v_new_tokens text[] := array[]::text[]; v_new boolean := false;
begin
  if p_vendor is null or p_phone is null or p_phone !~ '^\+65[3689][0-9]{7}$' then raise exception 'invalid customer'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer-join-vendor:'||p_vendor::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer:'||p_vendor::text||':'||p_phone,0));
  if exists(select 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id where p.vendor_id=p_vendor and c.phone=p_phone) then
    perform loopkit._require_customer_capability(p_vendor,p_phone,p_token);
  elsif p_token is not null then
    raise exception 'customer proof required';
  else
    v_new := true;
    for v_program in select id from loopkit.programs where vendor_id=p_vendor and active order by id for share loop
      v_token := loopkit.enroll_card(v_program,p_phone);
      if v_token is null then raise exception 'customer proof required'; end if;
      v_new_tokens := array_append(v_new_tokens,v_token);
    end loop;
  end if;
  if p_referral_code is not null then
    if length(p_referral_code)>100 then raise exception 'invalid referral'; end if;
    select r.referral_credit into v_credit from loopkit.vendor_join_referred(p_vendor,p_phone,p_referral_code) r limit 1;
  end if;
  if not v_new then perform loopkit.vendor_join_enroll(p_vendor,p_phone); end if;
  if v_new and exists(select 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id
    where p.vendor_id=p_vendor and c.phone=p_phone and not(c.card_token=any(v_new_tokens)))
  then raise exception 'customer proof required'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_cards from loopkit.vendor_join_cards(p_vendor,p_phone) r;
  return jsonb_build_object('cards',v_cards,'referral_credit',v_credit);
end;
$$;
revoke all on function loopkit.customer_join(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function loopkit.customer_join(uuid,text,text,text) to service_role;

create or replace function loopkit.customer_select_points_reward(p_vendor uuid,p_program uuid,p_phone text,p_token text,p_item_id text)
returns loopkit.reward_vouchers language plpgsql security definer set search_path='' as $$
begin
  perform loopkit._require_customer_capability(p_vendor,p_phone,p_token);
  if not exists(select 1 from loopkit.programs where id=p_program and vendor_id=p_vendor) then raise exception 'not authorized'; end if;
  return loopkit.select_points_reward(p_program,p_phone,p_item_id);
end;
$$;
revoke all on function loopkit.customer_select_points_reward(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function loopkit.customer_select_points_reward(uuid,uuid,text,text,text) to service_role;

create or replace function loopkit.customer_set_birthday(p_vendor uuid,p_phone text,p_token text,p_month smallint,p_day smallint)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform loopkit._require_customer_capability(p_vendor,p_phone,p_token);
  if p_month is null or p_day is null or p_month<1 or p_month>12 or p_day<1 or p_day>31 then raise exception 'invalid birthday'; end if;
  perform loopkit.set_customer_birthday(p_vendor,p_phone,p_month,p_day);
end;
$$;
revoke all on function loopkit.customer_set_birthday(uuid,text,text,smallint,smallint) from public,anon,authenticated,service_role;
grant execute on function loopkit.customer_set_birthday(uuid,text,text,smallint,smallint) to service_role;

-- Rotate every customer credential at this vendor, including unredeemed vouchers.
create or replace function loopkit._rotate_customer_capabilities(p_vendor uuid,p_phone text,p_program uuid)
returns loopkit.cards language plpgsql security definer set search_path='' as $$
declare v_card loopkit.cards;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('customer:'||p_vendor::text||':'||p_phone,0));
  perform 1 from loopkit.programs where vendor_id=p_vendor order by id for share;
  perform 1 from loopkit.cards c join loopkit.programs p on p.id=c.program_id
  where p.vendor_id=p_vendor and c.phone=p_phone order by c.id for update of c;
  update loopkit.cards c set card_token=replace(gen_random_uuid()::text,'-',''),updated_at=clock_timestamp()
  from loopkit.programs p where p.id=c.program_id and p.vendor_id=p_vendor and c.phone=p_phone;
  update loopkit.reward_vouchers r set voucher_token=replace(gen_random_uuid()::text,'-',''),updated_at=clock_timestamp()
  from loopkit.cards c join loopkit.programs p on p.id=c.program_id
  where r.card_id=c.id and p.vendor_id=p_vendor and c.phone=p_phone and r.status='active';
  select c.* into v_card from loopkit.cards c where c.program_id=p_program and c.phone=p_phone;
  if v_card.id is null then raise exception 'card not found'; end if;
  return v_card;
end;
$$;
revoke all on function loopkit._rotate_customer_capabilities(uuid,text,uuid) from public,anon,authenticated,service_role;

create or replace function loopkit.recover_customer_card(p_program uuid,p_phone text)
returns loopkit.cards language plpgsql security definer set search_path='' as $$
declare v_vendor uuid;
begin
  select vendor_id into v_vendor from loopkit.programs where id=p_program;
  if v_vendor is null or v_vendor is distinct from (select auth.uid()) then raise exception 'not authorized'; end if;
  return loopkit._rotate_customer_capabilities(v_vendor,p_phone,p_program);
end;
$$;
revoke all on function loopkit.recover_customer_card(uuid,text) from public,anon;
grant execute on function loopkit.recover_customer_card(uuid,text) to authenticated;

create or replace function loopkit.customer_reset_expired_card(p_vendor uuid,p_program uuid,p_phone text,p_token text)
returns loopkit.cards language plpgsql security definer set search_path='' as $$
declare v_card loopkit.cards; v_expiry int;
begin
  perform loopkit._require_customer_capability(p_vendor,p_phone,p_token);
  select expiry_days into v_expiry from loopkit.programs where id=p_program and vendor_id=p_vendor and active for share;
  if not found or v_expiry is null then raise exception 'card not expired'; end if;
  select * into v_card from loopkit.cards where program_id=p_program and phone=p_phone for update;
  if v_card.id is null or v_card.cycle_started_at+(v_expiry*interval '1 day')>clock_timestamp() then raise exception 'card not expired'; end if;
  update loopkit.cards set state='{}'::jsonb,stamp_count=0,cycle_started_at=clock_timestamp(),last_event_at=null,updated_at=clock_timestamp()
  where id=v_card.id;
  insert into loopkit.stamp_events(card_id,kind) values(v_card.id,'regen');
  return loopkit._rotate_customer_capabilities(p_vendor,p_phone,p_program);
end;
$$;
revoke all on function loopkit.customer_reset_expired_card(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function loopkit.customer_reset_expired_card(uuid,uuid,text,text) to service_role;

alter table loopkit.stamp_events drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events add constraint stamp_events_kind_check
check(kind in('stamp','redeem','visit','win','adjust','regen','points_reward_selected','points_offset_applied'));

-- Internal compatibility functions remain callable only from trusted wrappers.
revoke all on function loopkit.enroll_card(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.card_view(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.vendor_join(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.vendor_join_referred(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.vendor_join_enroll(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.vendor_join_cards(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.regenerate_card(uuid,text) from public,anon,authenticated,service_role;
revoke all on function loopkit.set_customer_birthday(uuid,text,smallint,smallint) from public,anon,authenticated,service_role;
revoke all on function loopkit.select_points_reward(uuid,text,text) from public,anon,authenticated,service_role;
