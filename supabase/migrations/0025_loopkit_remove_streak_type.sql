-- supabase/migrations/0025_loopkit_remove_streak_type.sql
-- Removes the Streak Club program type entirely — replaced by Flame Club, a
-- visual variant of Stamp (see docs/superpowers/specs/2026-07-15-flame-club-
-- redesign-design.md). No vendors have been onboarded yet (zero live rows of
-- any program type), so this migration deliberately breaks from this
-- codebase's usual purely-additive/never-remove convention: there is no
-- live-data risk to weigh against a full removal.

alter table loopkit.programs drop constraint if exists programs_type_check;
alter table loopkit.programs
  add constraint programs_type_check
  check (type in ('stamp','lucky','plant','wheel','scratch'));

-- enroll_card: drops the old streak-type branch (the elsif v_program.type
-- equals streak arm added in migration 0024) — recreated in full per this
-- file's SECURITY DEFINER convention. Stamp/plant seeding is byte-identical
-- to 0024.
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
  on conflict (program_id, phone) do nothing;

  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;
