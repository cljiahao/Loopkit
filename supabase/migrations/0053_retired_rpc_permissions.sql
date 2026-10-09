-- Retired creator signatures must not bypass the latest validation and lock.
do $$
declare v_signature regprocedure;
begin
  for v_signature in
    select p.oid::regprocedure from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='loopkit' and p.proname='create_program'
        and p.oid <> 'loopkit.create_program(text,text,integer,text,jsonb,integer,boolean,boolean,boolean,integer,integer)'::regprocedure
  loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated',v_signature);
  end loop;
end;
$$;
-- Reward issuance is performed only by internal checked earning functions.
-- This retired client wrapper accepts an unbounded insert-loop count.
revoke all on function loopkit.grant_reward_voucher(uuid,text,int,int,boolean) from public,anon,authenticated;

create or replace function loopkit.activate_program(p_program uuid)
returns loopkit.programs
language plpgsql security definer set search_path = '' as $$
declare
  v_vendor  uuid;
  v_program loopkit.programs;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;

  select vendor_id into v_vendor from loopkit.programs where id = p_program;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_vendor::text, 0));

  update loopkit.programs
    set active = false, replaced_by = p_program
    where vendor_id = v_vendor and active and id <> p_program;

  update loopkit.programs
    set active = true, scheduled_deactivate_at = null
    where id = p_program
    returning * into v_program;

  return v_program;
end;
$$;
