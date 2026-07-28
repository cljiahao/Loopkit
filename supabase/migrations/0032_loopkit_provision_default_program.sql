-- Discovered while planning vendor push-provisioning (2026-07-28 design):
-- the existing create_program RPC is SECURITY DEFINER but keyed on the
-- CALLING session's auth.uid() (raises 'not authorized' if null) — a
-- service-role call has no user session, so create_program cannot be used
-- to provision a program on a vendor's behalf. This is a narrowly-scoped
-- replacement: same insert shape as create_program's stamp-type branch,
-- keyed on an explicit parameter instead, granted ONLY to service_role so
-- it can never become a second, uncapped way for a vendor to create
-- programs for themselves (create_program's free-tier active-program cap
-- must stay the only path an authenticated vendor has).
create or replace function loopkit.provision_default_program(p_vendor_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  -- config must duplicate stamps_required/reward_text (matching what
  -- buildProgramFields in src/lib/program.ts produces for a stamp card):
  -- resolveStampConfig (src/lib/engine/index.ts) reads programs.config as-is
  -- whenever it has any keys at all, with no fallback to the table columns —
  -- a config that sets only points_per_visit/variant would leave
  -- stamps_required/reward_text undefined for every engine computation.
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, active)
  values (
    p_vendor_id, 'stamp', 'Starter', 10, '1 free item',
    '{"stamps_required": 10, "reward_text": "1 free item", "points_per_visit": 1, "variant": "dots"}'::jsonb, true
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function loopkit.provision_default_program(uuid) from public;
grant execute on function loopkit.provision_default_program(uuid) to service_role;
-- deliberately NOT granted to authenticated
