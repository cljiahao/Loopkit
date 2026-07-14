-- 0023 — tiered program switching: free-tier prep-and-activate, Pro
-- scheduled cutover. Additive: new nullable column, create_program gains a
-- 9th trailing defaulted param (same idiom as 0012/0016/0018's own
-- extensions of this function), two new SECURITY DEFINER RPCs.

alter table loopkit.programs
  add column scheduled_deactivate_at timestamptz;

-- create_program: p_active lets a caller create a program that starts
-- inactive (the free-tier prep flow) instead of the default active=true.
-- The free/Pro gate branches on which state is being requested: an active
-- program still requires is_pro or zero other active programs (unchanged
-- from every prior version of this function); an inactive one requires
-- is_pro or fewer than 2 live-in-play (replaced_by is null) programs — the
-- "prep a second one" cap. Pro is never blocked either way.
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false,
  p_active            boolean default true
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'not authorized';
  end if;
  if p_active then
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
    ) then
      raise insufficient_privilege;
    end if;
  else
    if not (
      loopkit.is_pro(v_uid)
      or (select count(*) from loopkit.programs where vendor_id = v_uid and replaced_by is null) < 2
    ) then
      raise insufficient_privilege;
    end if;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps, active)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean
) to authenticated;

-- activate_program: the free-tier "flip the switch" action. Deactivates
-- every other currently-active program owned by the same vendor, links
-- each to the newly-activated program via replaced_by (mirrors
-- changeTypeAction's existing manual-swap linkage), then activates the
-- target. A vendor can only ever reach a state where this deactivates more
-- than one program if they were Pro when those programs went active and
-- then dropped to free — harmless either way, this just enforces "only the
-- target is active afterward" unconditionally.
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

grant execute on function loopkit.activate_program(uuid) to authenticated;

-- schedule_retirement: the Pro-only "set a future cutover date" action.
-- Requires the caller to own both programs, both to currently be active,
-- and the vendor to be Pro. Sets replaced_by immediately (so vendor_join
-- can already surface the successor's name to affected customers, same as
-- changeTypeAction's manual linkage) and scheduled_deactivate_at for the
-- lazy check (src/lib/program.ts's applyDueCutovers, Task 2) to act on
-- later. Does not deactivate anything itself — that only happens once the
-- date arrives.
create or replace function loopkit.schedule_retirement(
  p_program   uuid,
  p_successor uuid,
  p_date      timestamptz
)
returns loopkit.programs
language plpgsql security definer set search_path = '' as $$
declare
  v_program   loopkit.programs;
  v_successor loopkit.programs;
begin
  if not loopkit.owns_program(p_program) or not loopkit.owns_program(p_successor) then
    raise exception 'not authorized';
  end if;
  if p_program = p_successor then
    raise exception 'a program cannot succeed itself';
  end if;

  select * into v_program from loopkit.programs where id = p_program;
  select * into v_successor from loopkit.programs where id = p_successor;

  if not loopkit.is_pro(v_program.vendor_id) then
    raise insufficient_privilege;
  end if;
  if not v_program.active then
    raise exception 'program is not active';
  end if;
  if not v_successor.active then
    raise exception 'successor is not active';
  end if;

  update loopkit.programs
    set replaced_by = p_successor,
        scheduled_deactivate_at = p_date
    where id = p_program
    returning * into v_program;

  return v_program;
end;
$$;

grant execute on function loopkit.schedule_retirement(uuid, uuid, timestamptz) to authenticated;
