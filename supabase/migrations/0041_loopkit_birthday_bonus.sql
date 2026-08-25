-- supabase/migrations/0041_loopkit_birthday_bonus.sql
-- Customer-facing birthday self-entry (optional, phone-scoped, no separate
-- auth) plus a per-program opt-in bonus stamp on a customer's first visit
-- on/after their birthday each year. MVP scoped to type='stamp' programs
-- only, same precedent as qkit-earn's own "non-stamp program rejected, out
-- of MVP scope" line (src/app/earn/actions.ts) — the other engine types'
-- state is an opaque JSONB blob with no generic "add one" operation.

alter table loopkit.customers
  add column birth_month smallint check (birth_month between 1 and 12),
  add column birth_day smallint check (birth_day between 1 and 31),
  add column last_birthday_reward_year int;

alter table loopkit.programs
  add column birthday_bonus_enabled boolean not null default false;

-- Anonymous, phone-scoped write — same trust model as vendor_join/
-- checkStatusAction (phone is the only identity /c has, no separate
-- customer auth exists in this app). Plain UPDATE, not upsert: a
-- loopkit.customers row only exists once the sync triggers (0021/0035)
-- have already created one from a real card/stamp event, and this may
-- only ever touch the exact (vendor, phone) pair it's called with — no
-- arbitrary overwrite of another vendor's or another phone's row.
create or replace function loopkit.set_customer_birthday(
  p_vendor uuid,
  p_phone text,
  p_birth_month smallint,
  p_birth_day smallint
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update loopkit.customers
    set birth_month = p_birth_month, birth_day = p_birth_day
    where vendor_id = p_vendor and phone = p_phone;
end;
$$;

grant execute on function loopkit.set_customer_birthday(uuid, text, smallint, smallint)
  to anon, authenticated, service_role;

-- Refactor: add_stamp's real body (sweep expired vouchers, increment,
-- threshold-crossing, grant_reward_voucher) moves into an internal
-- unchecked variant so the birthday-bonus trigger below can reuse the
-- exact same accounting instead of reimplementing it — the risk with a
-- second stamp-granting code path is silent drift from the voucher/
-- carryover machinery this one already handles correctly. add_stamp
-- itself becomes a thin owns_program-gated wrapper; no behavior change
-- for any existing caller.
create or replace function loopkit._add_stamp_unchecked(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare
  v_card loopkit.cards;
  v_card_id uuid;
  v_config jsonb;
  v_amount int;
  v_required int;
  v_reward_text text;
  v_reward_expiry_days int;
  v_expired_count int;
  v_prev int;
  v_crossings int;
begin
  select config, stamps_required, reward_text, reward_expiry_days
    into v_config, v_required, v_reward_text, v_reward_expiry_days
    from loopkit.programs where id = p_program;
  v_amount := coalesce((v_config->>'points_per_visit')::int, 1);

  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, v_amount)
  on conflict (program_id, phone) do nothing
  returning * into v_card;
  if v_card.id is not null then
    insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
    v_crossings := loopkit.count_threshold_crossings(0, v_amount, v_required);
    if v_crossings > 0 then
      perform loopkit.grant_reward_voucher(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
    end if;
    return v_card;
  end if;

  select id into v_card_id from loopkit.cards
    where program_id = p_program and phone = p_phone;
  v_expired_count := loopkit.expire_stale_vouchers(v_card_id);

  select stamp_count into v_prev from loopkit.cards where id = v_card_id;
  v_prev := greatest(v_prev - v_expired_count * v_required, 0);

  update loopkit.cards
    set stamp_count = v_prev + v_amount, updated_at = now()
    where id = v_card_id
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');

  v_crossings := loopkit.count_threshold_crossings(v_prev, v_card.stamp_count, v_required);
  if v_crossings > 0 then
    perform loopkit.grant_reward_voucher(v_card.id, v_reward_text, v_reward_expiry_days, v_crossings, false);
  end if;
  return v_card;
end;
$$;

create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;
  return loopkit._add_stamp_unchecked(p_program, p_phone);
end;
$$;

-- Lazy check-on-next-visit: no cron exists in this repo, and a customer's
-- birthday only needs checking when they're actually active, not on a
-- schedule. Fires on every stamp_events insert (any writer — add_stamp,
-- record_visit, apply_referral_credit) so it doesn't need touching every
-- entry point individually. Guards, in order: only 'stamp'/'visit' kinds
-- (a redemption isn't a visit); only type='stamp' programs (MVP scope);
-- only when the vendor opted the program in; only a real birth-date match
-- against SGT "today"; only once per calendar year — updates
-- last_birthday_reward_year BEFORE calling _add_stamp_unchecked, so that
-- call's own stamp_events insert re-fires this trigger but sees "already
-- granted" and no-ops immediately, instead of recursing.
create or replace function loopkit.apply_birthday_bonus()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_vendor_id uuid;
  v_program_id uuid;
  v_program_type text;
  v_bonus_enabled boolean;
  v_phone text;
  v_birth_month smallint;
  v_birth_day smallint;
  v_last_reward_year int;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
begin
  if new.kind not in ('stamp', 'visit') then
    return new;
  end if;

  select p.vendor_id, p.id, p.type, p.birthday_bonus_enabled, c.phone
    into v_vendor_id, v_program_id, v_program_type, v_bonus_enabled, v_phone
    from loopkit.cards c join loopkit.programs p on p.id = c.program_id
    where c.id = new.card_id;

  if not found or v_program_type <> 'stamp' or not v_bonus_enabled then
    return new;
  end if;

  select birth_month, birth_day, last_birthday_reward_year
    into v_birth_month, v_birth_day, v_last_reward_year
    from loopkit.customers where vendor_id = v_vendor_id and phone = v_phone;

  if not found or v_birth_month is null or v_birth_day is null then
    return new;
  end if;
  if v_birth_month <> extract(month from v_today) or v_birth_day <> extract(day from v_today) then
    return new;
  end if;
  if v_last_reward_year = extract(year from v_today)::int then
    return new;
  end if;

  update loopkit.customers
    set last_birthday_reward_year = extract(year from v_today)::int
    where vendor_id = v_vendor_id and phone = v_phone;

  perform loopkit._add_stamp_unchecked(v_program_id, v_phone);

  return new;
end;
$$;

create trigger stamp_events_birthday_bonus
  after insert on loopkit.stamp_events
  for each row execute function loopkit.apply_birthday_bonus();
