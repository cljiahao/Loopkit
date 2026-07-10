-- Public: list a vendor's currently-active programs (name/type/reward only
-- — enough for the /c landing page to preview what a scan joins, before
-- the customer has typed a phone number). Supersedes the old
-- card_view-called-with-an-empty-phone hack used for the same purpose.
create or replace function loopkit.vendor_active_programs(p_vendor uuid)
returns table (id uuid, name text, type text, reward_text text)
language sql security definer stable set search_path = '' as $$
  select id, name, type, reward_text
  from loopkit.programs
  where vendor_id = p_vendor and active
  order by created_at asc;
$$;

grant execute on function loopkit.vendor_active_programs(uuid) to anon, authenticated, service_role;

-- Public: the /c?v=<vendor> entry point. Enrolls the phone into every one
-- of the vendor's active programs it doesn't already have a card for
-- (delegating to enroll_card so seeding/head-start logic lives in exactly
-- one place), then returns every card the phone holds at this vendor —
-- including cards for programs that have since gone inactive, so a
-- customer doesn't lose sight of progress on a program the vendor paused.
create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean
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
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
