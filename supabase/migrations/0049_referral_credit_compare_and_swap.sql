-- Server computes non-stamp engine transitions from a fresh snapshot.
create or replace function loopkit.referral_credit_snapshot(p_referral_host_id uuid,p_guest_phone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not exists(select 1 from loopkit.referral_credits where referral_host_id=p_referral_host_id and guest_phone=p_guest_phone) then
    raise exception 'invalid referral credit';
  end if;
  if exists(select 1 from loopkit.referral_credits where referral_host_id=p_referral_host_id and guest_phone=p_guest_phone and credited_at is not null) then return null; end if;
  select jsonb_build_object('program',jsonb_build_object('type',p.type,'config',p.config,'stamps_required',p.stamps_required,'reward_text',p.reward_text),'card',jsonb_build_object('state',c.state,'stamp_count',c.stamp_count,'reward_count',c.reward_count,'updated_at',c.updated_at)) into v_result
  from loopkit.referral_hosts h
  join loopkit.programs p on p.id=h.program_id and p.vendor_id=h.vendor_id and p.active and p.type<>'stamp'
  join loopkit.cards c on c.program_id=p.id and c.phone=h.host_phone
  where h.id=p_referral_host_id;
  if v_result is null then raise exception 'invalid referral state'; end if;
  return v_result;
end;
$$;
revoke all on function loopkit.referral_credit_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function loopkit.referral_credit_snapshot(uuid,text) to service_role;

create or replace function loopkit.apply_referral_credit_checked(
  p_referral_host_id uuid,p_guest_phone text,p_expected jsonb,p_state jsonb,p_payload jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  h loopkit.referral_hosts%rowtype;
  p loopkit.programs%rowtype;
  c loopkit.cards%rowtype;
  v_credited timestamptz;
  v_current jsonb;
begin
  select * into h from loopkit.referral_hosts where id=p_referral_host_id for share;
  if h.id is null then raise exception 'invalid referral'; end if;
  select * into p from loopkit.programs where id=h.program_id and vendor_id=h.vendor_id and active and type<>'stamp' for share;
  if p.id is null then raise exception 'invalid referral'; end if;
  select credited_at into v_credited from loopkit.referral_credits
  where referral_host_id=h.id and guest_phone=p_guest_phone for update;
  if not found then raise exception 'invalid referral credit'; end if;
  if v_credited is not null then return true; end if;
  select * into c from loopkit.cards where program_id=p.id and phone=h.host_phone for update;
  if c.id is null then raise exception 'invalid referral state'; end if;
  v_current := jsonb_build_object('program',jsonb_build_object('type',p.type,'config',p.config,'stamps_required',p.stamps_required,'reward_text',p.reward_text),'card',jsonb_build_object('state',c.state,'stamp_count',c.stamp_count,'reward_count',c.reward_count,'updated_at',c.updated_at));
  if p_expected is distinct from v_current then return false; end if;
  if p_state is null or jsonb_typeof(p_state)<>'object' then raise exception 'invalid next state'; end if;
  update loopkit.cards set state=p_state,last_event_at=now(),updated_at=now() where id=c.id;
  insert into loopkit.stamp_events(card_id,kind,payload) values(c.id,'visit',p_payload);
  update loopkit.referral_credits set credited_at=now() where referral_host_id=h.id and guest_phone=p_guest_phone;
  return true;
end;
$$;
revoke all on function loopkit.apply_referral_credit_checked(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function loopkit.apply_referral_credit_checked(uuid,text,jsonb,jsonb,jsonb) to service_role;
revoke all on function loopkit.apply_referral_credit(uuid,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;

-- Repeated joins may retry pending credits without incrementing guest_count again.
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
        where p.id = referral_hosts.program_id and p.vendor_id = p_vendor and p.active) for update;

  if found and v_referral.host_phone <> p_phone then
    insert into loopkit.referral_credits (referral_host_id, guest_phone)
      values (v_referral.id, p_phone)
      on conflict (referral_host_id, guest_phone) do nothing;

    if found then
      update loopkit.referral_hosts set guest_count = guest_count + 1
        where id = v_referral.id;
    end if;
    select * into v_program from loopkit.programs
    where id=v_referral.program_id and vendor_id=p_vendor and active for share;
    if not found then raise exception 'invalid referral program'; end if;
    perform 1 from loopkit.referral_credits where referral_host_id=v_referral.id and guest_phone=p_phone and credited_at is null for update;
    if found then
      perform loopkit.enroll_card(v_referral.program_id, v_referral.host_phone);


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
