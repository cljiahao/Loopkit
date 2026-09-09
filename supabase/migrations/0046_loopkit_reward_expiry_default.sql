-- supabase/migrations/0046_loopkit_reward_expiry_default.sql
-- Newly created programs default an earned reward's lifetime to 90 days.
-- null still means "never expires"; the vendor reaches it by clearing the
-- setup form's expiry field. No backfill: existing programs keep their value,
-- and the voucher-granting functions are untouched.

create or replace function loopkit.create_program(
  p_type               text,
  p_name               text,
  p_stamps_required    int,
  p_reward_text        text,
  p_config             jsonb,
  p_expiry_days        int default null,
  p_head_start         boolean default false,
  p_carry_over_stamps  boolean default false,
  p_active             boolean default true,
  p_head_start_percent int default 20,
  p_reward_expiry_days int default 90
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
     head_start, carry_over_stamps, active, head_start_percent, reward_expiry_days)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps, p_active,
            p_head_start_percent, p_reward_expiry_days)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int, int
) to authenticated;
