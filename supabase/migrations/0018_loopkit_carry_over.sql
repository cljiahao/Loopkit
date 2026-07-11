alter table loopkit.programs
  add column carry_over_stamps boolean not null default false;

-- create_program: accept an optional carry-over flag, defaulted so every
-- existing call site (saveProgramAction's create path) is unaffected.
create or replace function loopkit.create_program(
  p_type              text,
  p_name              text,
  p_stamps_required   int,
  p_reward_text       text,
  p_config            jsonb,
  p_expiry_days       int default null,
  p_head_start        boolean default false,
  p_carry_over_stamps boolean default false
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
    or (select count(*) from loopkit.programs where vendor_id = v_uid and active) < 1
  ) then
    raise insufficient_privilege;
  end if;
  insert into loopkit.programs
    (vendor_id, type, name, stamps_required, reward_text, config, expiry_days,
     head_start, carry_over_stamps)
    values (v_uid, p_type, p_name, p_stamps_required, p_reward_text, p_config,
            p_expiry_days, p_head_start, p_carry_over_stamps)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean
) to authenticated;

-- enroll_card: carry-over seeding takes precedence over head_start seeding,
-- but only when carryover actually applies (a same-type predecessor with a
-- card for this phone exists) — falling back to head_start otherwise keeps
-- a vendor who ticks the box in a genuinely-empty edge case from silently
-- losing the head-start seed they'd have gotten anyway. Carryover only
-- ever applies stamp -> stamp: every other type pairing has no meaningful
-- translation between engine-specific progress representations, so it's
-- left at 0 exactly as before (v_carried stays false, head_start's normal
-- branches run unchanged for plant/streak).
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_program loopkit.programs%rowtype;
  v_predecessor loopkit.programs%rowtype;
  v_seed_stamp_count int := 0;
  v_seed_state jsonb := '{}'::jsonb;
  v_seed int;
  v_carried boolean := false;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    return null;
  end if;

  select * into v_program from loopkit.programs where id = p_program and active;
  if not found then
    return null;
  end if;

  if v_program.carry_over_stamps then
    select p.* into v_predecessor
      from loopkit.programs p
      where p.replaced_by = v_program.id
      limit 1;
    if found and v_predecessor.type = 'stamp' and v_program.type = 'stamp' then
      select coalesce(c.stamp_count, 0) into v_seed_stamp_count
        from loopkit.cards c
        where c.program_id = v_predecessor.id and c.phone = p_phone;
      v_seed_stamp_count := least(coalesce(v_seed_stamp_count, 0), v_program.stamps_required);
      v_carried := true;
    end if;
  end if;

  if not v_carried and v_program.head_start then
    v_seed := greatest(1, round(v_program.stamps_required * 0.2)::int);
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
    elsif v_program.type = 'streak' then
      v_seed_state := jsonb_build_object(
        'current_streak', 1,
        'window_start', now(),
        'reward_banked', false
      );
    end if;
  end if;

  insert into loopkit.cards (program_id, phone, stamp_count, state)
    values (p_program, p_phone, v_seed_stamp_count, v_seed_state)
  on conflict (program_id, phone) do nothing;

  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;

-- vendor_join: also surface the replacement card's current stamp_count (when
-- one exists) so /c can tell a customer how many stamps carried over. The
-- enrollment loop above already runs before this query on every call, so by
-- the time nc is joined, a customer re-checking /c after migration already
-- has a card in the replacement program (created via the loop, seeded per
-- carry_over_stamps above). Same DROP-then-CREATE-OR-REPLACE requirement as
-- 0016 — a RETURNS TABLE column addition changes the function's signature.
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
           r.name, nc.stamp_count
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
