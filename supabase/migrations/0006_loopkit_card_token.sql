-- supabase/migrations/0006_loopkit_card_token.sql
-- Customer-facing surface: every card gets an opaque token (the QR payload),
-- and three SECURITY DEFINER read/enroll functions power the public /c page and
-- (next slice) the vendor scan. No direct anon table access.

-- A volatile default gives each existing row a distinct token on add.
alter table loopkit.cards
  add column card_token text not null unique
    default replace(gen_random_uuid()::text, '-', '');

-- Enroll (public): ensure a card exists for this phone, return its token.
create or replace function loopkit.enroll_card(p_program uuid, p_phone text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  insert into loopkit.cards (program_id, phone)
    values (p_program, p_phone)
  on conflict (program_id, phone) do nothing;
  select card_token into v_token
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  return v_token;
end;
$$;

-- Customer read (public): raw type/config/state so the TS engine renders
-- progress. Only for an active program; the token lets the customer show a QR.
create or replace function loopkit.card_view(p_program uuid, p_phone text)
returns table (
  name text, type text, config jsonb, state jsonb,
  card_token text, reward_text text, stamps_required int
)
language sql security definer stable set search_path = '' as $$
  select p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
         c.card_token, p.reward_text, p.stamps_required
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

-- Vendor scan resolve (owner-gated): a token → its card, only if the caller
-- owns the program. Used by the Phase 3b camera scan.
create or replace function loopkit.card_by_token(p_token text)
returns table (program_id uuid, card_id uuid, phone text)
language sql security definer stable set search_path = '' as $$
  select c.program_id, c.id, c.phone
  from loopkit.cards c
  where c.card_token = p_token and loopkit.owns_program(c.program_id);
$$;

grant execute on function loopkit.enroll_card(uuid, text) to anon, authenticated, service_role;
grant execute on function loopkit.card_view(uuid, text) to anon, authenticated, service_role;
grant execute on function loopkit.card_by_token(text) to authenticated, service_role;
