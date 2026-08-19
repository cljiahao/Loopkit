-- supabase/migrations/0040_loopkit_referral_hosts.sql
-- Host/couple-facing referral mechanic for event-cart vendors: a wedding
-- guest is a one-off the vendor will likely never see again, but the host
-- (bride/groom/organizer) who picked this vendor IS a real repeat/referral
-- relationship worth rewarding. This is credit-routing on an EXISTING
-- program a vendor already runs, not a sixth engine `type` -- a vendor
-- names one of their own active programs plus a host phone, and every
-- distinct guest who joins via that host's link bumps the host one
-- stamp/visit on that program, in addition to the guest getting their own
-- card exactly as the generic /c?v= link already does.

create table loopkit.referral_hosts (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references auth.users(id) on delete cascade,
  program_id    uuid not null references loopkit.programs(id) on delete cascade,
  host_phone    text not null,
  label         text,
  referral_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  guest_count   integer not null default 0,
  created_at    timestamptz not null default now()
);

create index referral_hosts_vendor_idx on loopkit.referral_hosts (vendor_id, created_at desc);

alter table loopkit.referral_hosts enable row level security;

create policy referral_hosts_own on loopkit.referral_hosts
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

-- No update/delete this round: a referral host's phone/program shouldn't
-- change after creation -- a vendor who makes a mistake creates a new one.
grant select, insert on loopkit.referral_hosts to authenticated;
grant all on loopkit.referral_hosts to service_role;

-- Dedup ledger: a host is credited at most once per distinct guest phone per
-- referral link, enforced by the unique constraint below (an
-- `insert ... on conflict do nothing` only actually inserts the first time).
-- credited_at stays null the instant a non-stamp-type credit is *reserved*
-- (see vendor_join_referred below) until apply_referral_credit finishes it;
-- a stamp-type credit completes synchronously and stamps credited_at in the
-- same statement, since it needs no TypeScript-computed state. No RLS
-- policies and no anon/authenticated grant -- only ever touched by
-- SECURITY DEFINER functions, same "service-role-only" shape the retired
-- telegram_link_tokens table (0036) used.
create table loopkit.referral_credits (
  id               uuid primary key default gen_random_uuid(),
  referral_host_id uuid not null references loopkit.referral_hosts(id) on delete cascade,
  guest_phone      text not null,
  credited_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (referral_host_id, guest_phone)
);

alter table loopkit.referral_credits enable row level security;
grant all on loopkit.referral_credits to service_role;

-- Shared enrollment step factored out of vendor_join's old inline body, so
-- vendor_join_referred (below) reuses it verbatim instead of duplicating
-- the phone-validate-and-loop logic.
create or replace function loopkit.vendor_join_enroll(p_vendor uuid, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
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
end;
$$;

-- Shared read step, also factored out of vendor_join's old inline body --
-- the guest's own cards at this vendor. Byte-identical to the query
-- 0031_loopkit_vendor_join_avatar.sql had inlined into vendor_join.
create or replace function loopkit.vendor_join_cards(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, vendor_avatar_url text
)
language sql security definer stable set search_path = '' as $$
  select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
         coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
         p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
         r.name, nc.stamp_count,
         (select min(rv.expires_at) from loopkit.reward_vouchers rv
            where rv.card_id = c.id and rv.status = 'active' and rv.expires_at is not null),
         (select u.raw_user_meta_data->>'avatar_url' from auth.users u where u.id = p_vendor)
  from loopkit.cards c
  join loopkit.programs p on p.id = c.program_id
  left join loopkit.programs r on r.id = p.replaced_by
  left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
  where p.vendor_id = p_vendor and c.phone = p_phone
  order by c.created_at asc;
$$;

-- vendor_join: rebuilt on the two shared helpers above. Same signature, same
-- 16 return columns (0031) -- byte-identical behavior for every existing
-- caller, just no longer duplicating logic vendor_join_referred also needs.
create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, vendor_avatar_url text
)
language plpgsql security definer set search_path = '' as $$
begin
  perform loopkit.vendor_join_enroll(p_vendor, p_phone);
  return query select * from loopkit.vendor_join_cards(p_vendor, p_phone);
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;

-- vendor_join_referred: everything vendor_join does for the guest, PLUS
-- referral bookkeeping when p_referral_code resolves to a real
-- referral_hosts row scoped to p_vendor -- referral_code is globally unique,
-- so a code minted by another vendor simply never matches here and this
-- degrades to a plain vendor_join with no side effects, which is exactly
-- the cross-vendor isolation guarantee (a code from vendor A can never
-- credit anything at vendor B). Self-referral (guest phone == host phone)
-- is a deliberate no-op: the guest still gets enrolled normally, the host
-- is never credited -- guarding against someone farming their own link.
-- Re-visiting the same link with the same phone is deduped by
-- referral_credits' unique (referral_host_id, guest_phone): the host is
-- credited only the first time `insert ... on conflict do nothing` actually
-- inserts a row (plpgsql's FOUND reflects that).
--
-- Stamp-type programs are credited inline here, mirroring add_stamp's own
-- body (0022) minus its owns_program gate -- this call is legitimately
-- anonymous/public (a customer session, not a vendor session), so the real
-- add_stamp RPC isn't reachable from this path at all. Every other type
-- needs the TypeScript engine's applyVisit (src/lib/engine) to compute the
-- next state, which can't run in SQL without reimplementing that dispatch --
-- so for those, this function only *reserves* the credit (a
-- referral_credits row with credited_at left null) and returns a
-- `referral_credit` jsonb blob describing what to credit. The caller
-- (checkStatusAction, src/features/card-check/api/actions.ts) computes
-- applyVisit and finishes the write via loopkit.apply_referral_credit
-- below -- the same read-compute-persist shape recordVisitAction
-- (src/app/dashboard/actions.ts) already uses for a vendor-triggered visit.
create or replace function loopkit.vendor_join_referred(
  p_vendor uuid, p_phone text, p_referral_code text
)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, vendor_avatar_url text, referral_credit jsonb
)
language plpgsql security definer set search_path = '' as $$
declare
  v_referral loopkit.referral_hosts%rowtype;
  v_program  loopkit.programs%rowtype;
  v_card     loopkit.cards%rowtype;
  v_credit   jsonb := null;
begin
  perform loopkit.vendor_join_enroll(p_vendor, p_phone);

  select * into v_referral from loopkit.referral_hosts
    where referral_code = p_referral_code and vendor_id = p_vendor;

  if found and v_referral.host_phone <> p_phone then
    insert into loopkit.referral_credits (referral_host_id, guest_phone)
      values (v_referral.id, p_phone)
      on conflict (referral_host_id, guest_phone) do nothing;

    if found then
      update loopkit.referral_hosts set guest_count = guest_count + 1
        where id = v_referral.id;
      perform loopkit.enroll_card(v_referral.program_id, v_referral.host_phone);
      select * into v_program from loopkit.programs where id = v_referral.program_id;

      if v_program.type = 'stamp' then
        insert into loopkit.cards (program_id, phone, stamp_count)
          values (v_referral.program_id, v_referral.host_phone, 1)
        on conflict (program_id, phone) do nothing
        returning * into v_card;
        if v_card.id is not null then
          insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
        else
          update loopkit.cards
            set stamp_count = stamp_count + 1, updated_at = now()
            where program_id = v_referral.program_id and phone = v_referral.host_phone
          returning * into v_card;
          insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
        end if;

        update loopkit.referral_credits set credited_at = now()
          where referral_host_id = v_referral.id and guest_phone = p_phone;
      else
        select * into v_card from loopkit.cards
          where program_id = v_referral.program_id and phone = v_referral.host_phone;

        v_credit := jsonb_build_object(
          'pending', true,
          'referralHostId', v_referral.id,
          'guestPhone', p_phone,
          'programId', v_program.id,
          'programType', v_program.type,
          'programConfig', v_program.config,
          'stampsRequired', v_program.stamps_required,
          'rewardText', v_program.reward_text,
          'hostPhone', v_referral.host_phone,
          'state', coalesce(v_card.state, '{}'::jsonb),
          'stampCount', coalesce(v_card.stamp_count, 0),
          'rewardCount', coalesce(v_card.reward_count, 0)
        );
      end if;
    end if;
  end if;

  return query
    select vjc.*, v_credit from loopkit.vendor_join_cards(p_vendor, p_phone) vjc;
end;
$$;

grant execute on function loopkit.vendor_join_referred(uuid, text, text) to anon, authenticated, service_role;

-- apply_referral_credit: finishes a non-stamp-type referral credit reserved
-- by vendor_join_referred above. Guarded by the credited_at-is-null ->
-- credited_at=now() transition (an UPDATE, not the reservation INSERT) so a
-- retried/duplicate call is a safe no-op (returns null) -- the same
-- "insert ... on conflict do nothing, only act if a row was actually
-- affected" idiom used for the reservation itself, just applied at the
-- finish step. Same insert-or-update-plus-event-log body as
-- loopkit.record_visit, minus its owns_program gate -- this path is public,
-- there's no vendor session to check; loopkit.referral_credits' guarded
-- transition is what stands in for that authorization instead.
create or replace function loopkit.apply_referral_credit(
  p_referral_host_id uuid,
  p_guest_phone      text,
  p_state            jsonb,
  p_kind             text,
  p_payload          jsonb
)
returns loopkit.cards
language plpgsql security definer set search_path = '' as $$
declare
  v_referral loopkit.referral_hosts%rowtype;
  v_card     loopkit.cards;
begin
  select * into v_referral from loopkit.referral_hosts where id = p_referral_host_id;
  if not found then
    raise exception 'invalid referral';
  end if;

  update loopkit.referral_credits
    set credited_at = now()
    where referral_host_id = p_referral_host_id
      and guest_phone = p_guest_phone
      and credited_at is null;
  if not found then
    return null;
  end if;

  insert into loopkit.cards (program_id, phone, state, last_event_at)
    values (v_referral.program_id, v_referral.host_phone, p_state, now())
  on conflict (program_id, phone) do update
    set state = excluded.state, last_event_at = now(), updated_at = now()
  returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind, payload) values (v_card.id, p_kind, p_payload);

  return v_card;
end;
$$;

grant execute on function loopkit.apply_referral_credit(uuid, text, jsonb, text, jsonb) to anon, authenticated, service_role;
