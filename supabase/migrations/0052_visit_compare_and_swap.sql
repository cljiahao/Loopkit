create or replace function loopkit.record_visit_checked(
  p_program uuid, p_phone text, p_state jsonb, p_kind text, p_payload jsonb,
  p_expected_updated_at timestamptz
)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_program loopkit.programs;
  v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then raise exception 'not authorized'; end if;
  if p_kind <> 'visit' then raise exception 'invalid visit kind'; end if;
  if p_phone !~ '^\+65[3689][0-9]{7}$' then raise exception 'invalid phone'; end if;
  select * into v_program from loopkit.programs where id=p_program for share;
  if not v_program.active then raise exception 'program inactive'; end if;
  -- Also serializes two first visits before either has a card row to lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_program::text || ':' || p_phone,0));
  select * into v_card from loopkit.cards where program_id=p_program and phone=p_phone for update;
  if v_card.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='card changed';
  end if;
  if v_program.expiry_days is not null and v_card.cycle_started_at is not null
     and now() >= v_card.cycle_started_at + v_program.expiry_days * interval '1 day' then
    raise exception 'card expired';
  end if;
  if v_card.id is null then
    insert into loopkit.cards(program_id,phone,state,last_event_at)
      values(p_program,p_phone,p_state,now()) returning * into v_card;
  else
    update loopkit.cards set state=p_state,last_event_at=now(),updated_at=clock_timestamp()
      where id=v_card.id returning * into v_card;
  end if;
  insert into loopkit.stamp_events(card_id,kind,payload) values(v_card.id,p_kind,p_payload);
  return v_card;
end;
$$;
revoke all on function loopkit.record_visit_checked(uuid,text,jsonb,text,jsonb,timestamptz) from public,anon;
grant execute on function loopkit.record_visit_checked(uuid,text,jsonb,text,jsonb,timestamptz) to authenticated;
-- The only production caller now uses the checked path. Retain the legacy
-- implementation for migration history and service-role maintenance only.
revoke all on function loopkit.record_visit(uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
