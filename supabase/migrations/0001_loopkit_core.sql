create schema if not exists loopkit;

create table loopkit.programs (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null unique references auth.users(id) on delete cascade,
  name            text not null,
  stamps_required int  not null check (stamps_required between 2 and 20),
  reward_text     text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table loopkit.cards (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references loopkit.programs(id) on delete cascade,
  phone        text not null,
  stamp_count  int  not null default 0,
  reward_count int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (program_id, phone)
);
create index cards_program_idx on loopkit.cards (program_id);

create table loopkit.stamp_events (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references loopkit.cards(id) on delete cascade,
  kind       text not null check (kind in ('stamp','redeem')),
  created_at timestamptz not null default now()
);
create index stamp_events_card_idx on loopkit.stamp_events (card_id);

-- ownership predicate (SECURITY DEFINER; pinned search_path)
create or replace function loopkit.owns_program(p_program uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from loopkit.programs
    where id = p_program and vendor_id = (select auth.uid())
  );
$$;

-- add a stamp: upsert the card, ++count, log event. Vendor-owned only.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, 1)
  on conflict (program_id, phone)
    do update set stamp_count = loopkit.cards.stamp_count + 1, updated_at = now()
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  return v_card;
end;
$$;

-- redeem: reset stamps, ++reward_count, log. Vendor-owned only.
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare v_card loopkit.cards;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  update loopkit.cards
    set stamp_count = 0, reward_count = reward_count + 1, updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;

-- public card status by phone (no PII/table exposure). Returns one row or none.
create or replace function loopkit.card_status(p_program uuid, p_phone text)
returns table (stamp_count int, stamps_required int, reward_text text)
language sql security definer stable set search_path = '' as $$
  select coalesce(c.stamp_count, 0), p.stamps_required, p.reward_text
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

-- RLS: vendor reads only their own rows; writes go through the functions above.
alter table loopkit.programs     enable row level security;
alter table loopkit.cards        enable row level security;
alter table loopkit.stamp_events enable row level security;

create policy programs_own on loopkit.programs
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));
create policy cards_own on loopkit.cards
  for select using (loopkit.owns_program(program_id));
create policy events_own on loopkit.stamp_events
  for select using (
    loopkit.owns_program((select program_id from loopkit.cards where id = card_id))
  );

-- Data-API grants (be explicit).
grant usage on schema loopkit to anon, authenticated, service_role;
grant select, insert, update on loopkit.programs to authenticated;
grant select on loopkit.cards, loopkit.stamp_events to authenticated;
grant all on all tables in schema loopkit to service_role;
grant execute on function loopkit.owns_program(uuid) to authenticated, service_role;
grant execute on function loopkit.add_stamp(uuid, text) to authenticated;
grant execute on function loopkit.redeem(uuid) to authenticated;
grant execute on function loopkit.card_status(uuid, text) to anon, authenticated, service_role;
