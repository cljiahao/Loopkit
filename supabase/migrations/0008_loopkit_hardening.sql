-- supabase/migrations/0008_loopkit_hardening.sql
-- v2 hardening: fix a stamp-progress read gap, enforce the free/Pro program
-- limit in the database (not just the app), only enroll into active programs,
-- and drop the redundant public card_status surface. Follows the 0001–0007
-- conventions: SECURITY DEFINER, pinned search_path = '', schema-qualified,
-- owner/identity-gated, explicit grants restated wherever a function is
-- dropped/recreated. Idempotent — safe to re-run.

-- A1 — card_view must also return the stamp_count COLUMN. add_stamp writes the
-- column but not the state blob, so a stamp card's real count only lives in
-- stamp_count; the customer /c read was seeing 0. Adding a column changes the
-- return type, which create-or-replace can't do, so drop first and restate the
-- grant. Non-stamp types keep reading their state blob.
drop function if exists loopkit.card_view(uuid, text);
create or replace function loopkit.card_view(p_program uuid, p_phone text)
returns table (
  name text, type text, config jsonb, state jsonb, stamp_count int,
  card_token text, reward_text text, stamps_required int
)
language sql security definer stable set search_path = '' as $$
  select p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
         coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
         p.stamps_required
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

grant execute on function loopkit.card_view(uuid, text) to anon, authenticated, service_role;

-- B1 — enforce the free/Pro program limit in the database. The app pre-checks
-- for a friendly message, but a vendor could otherwise insert directly via
-- PostgREST (and the app check is TOCTOU-racy). This SECURITY DEFINER function
-- is the only sanctioned create path: it raises insufficient_privilege (42501)
-- unless the caller is Pro or owns fewer than one program, then inserts with
-- vendor_id pinned to auth.uid(). Revoking the table INSERT grant below makes
-- it the sole backstop.
create or replace function loopkit.create_program(
  p_type            text,
  p_name            text,
  p_stamps_required int,
  p_reward_text     text,
  p_config          jsonb
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
  if not (
    loopkit.is_pro(v_uid)
    or (select count(*) from loopkit.programs where vendor_id = v_uid) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(text, text, int, text, jsonb) to authenticated;

-- Programs are now created only through create_program; direct inserts are no
-- longer permitted for vendors. select/update stay (the edit path updates the
-- table directly and RLS still scopes rows to the owner).
revoke insert on loopkit.programs from authenticated;

-- B2 — enroll_card must only seed a card for an active program. Same signature
-- and anon grant as 0006; add a guard so an anon caller can't materialize cards
-- against a missing or inactive program.
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  if not exists (
    select 1 from loopkit.programs where id = p_program and active
  ) then
    return null;
  end if;
  insert into loopkit.cards (program_id, phone)
    values (p_program, p_phone)
  on conflict (program_id, phone) do nothing;
  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;

-- B3 — card_view now returns the shop name (and everything /c needs), so the
-- older card_status surface is redundant. Drop it to shrink the anon surface;
-- its sole caller (/c page) now reads card_view.
drop function if exists loopkit.card_status(uuid, text);
