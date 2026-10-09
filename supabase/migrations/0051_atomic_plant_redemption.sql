create or replace function loopkit.redeem_plant(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_program loopkit.programs;
  v_card loopkit.cards;
  v_growth numeric;
  v_settled numeric;
  v_threshold numeric;
  v_idle numeric;
  v_carried numeric;
  v_ready boolean;
begin
  if not loopkit.owns_program(p_program) then raise exception 'not authorized'; end if;
  select * into v_program from loopkit.programs where id=p_program for share;
  if v_program.type <> 'plant' or not v_program.active then raise exception 'not a plant program'; end if;
  select * into v_card from loopkit.cards where program_id=p_program and phone=p_phone for update;
  if not found then raise exception 'no card'; end if;
  if v_program.expiry_days is not null and v_card.cycle_started_at is not null
     and now() >= v_card.cycle_started_at + v_program.expiry_days * interval '1 day' then
    raise exception 'card expired';
  end if;
  v_threshold := (v_program.config->'stages'->-1->>'threshold')::numeric;
  if v_threshold is null or v_threshold <= 0 then raise exception 'invalid plant config'; end if;
  v_growth := coalesce((v_card.state->>'growth')::numeric,0);
  v_settled := v_growth;
  if v_card.state->>'last_visit_at' is not null then
    v_idle := greatest(0,extract(epoch from now() - (v_card.state->>'last_visit_at')::timestamptz) / 86400);
    v_settled := greatest(least(v_growth,coalesce((v_program.config->>'floor_growth')::numeric,0)),
      v_growth - coalesce((v_program.config->>'decay_rate')::numeric,0) * greatest(0,v_idle-coalesce((v_program.config->>'grace_days')::numeric,0)));
  end if;
  -- An earned bloom remains claimable even after growth decays.
  v_ready := coalesce((v_card.state->>'bloomed')::boolean,v_settled >= v_threshold);
  if not v_ready then raise exception 'reward not ready'; end if;
  v_carried := greatest(0,v_growth-v_threshold);
  update loopkit.cards set state=jsonb_build_object(
    'growth',v_carried,'last_visit_at',v_card.state->'last_visit_at',
    'blooms',coalesce((v_card.state->>'blooms')::int,0)+1,'bloomed',v_carried>=v_threshold),
    last_event_at=now(),updated_at=clock_timestamp() where id=v_card.id returning * into v_card;
  insert into loopkit.stamp_events(card_id,kind,payload) values(v_card.id,'redeem',jsonb_build_object('reward',v_program.reward_text));
  return v_card;
end;
$$;
revoke all on function loopkit.redeem_plant(uuid,text) from public,anon;
grant execute on function loopkit.redeem_plant(uuid,text) to authenticated;
