-- supabase/migrations/0042_loopkit_adjust_stamp.sql
-- Day-2 ops gap: add_stamp only ever increments by 1, and the only
-- correction tool today is regenerate-card (a full reset that also
-- invalidates the customer's QR). This adds a reasoned manual adjustment
-- for classic Stamp-type programs, mirroring add_stamp's own shape.
-- Growth/Points/Chance cards use a separate jsonb `state` engine
-- (0004_loopkit_engine.sql) and are out of scope here.

alter table loopkit.stamp_events
  drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
    check (kind in ('stamp','redeem','visit','win','adjust'));

-- Adjust an existing card's stamp count by a signed delta, with a required
-- reason. Never creates a card (a correction implies one already exists);
-- clamps at 0 so a vendor can't accidentally push a customer negative.
-- Vendor-owned only, same ownership check as add_stamp.
create or replace function loopkit.adjust_stamp(
  p_program uuid, p_phone text, p_delta int, p_reason text
)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;
  if p_delta = 0 then
    raise exception 'delta must be nonzero';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  update loopkit.cards
    set stamp_count = greatest(0, stamp_count + p_delta), updated_at = now()
    where program_id = p_program and phone = p_phone
    returning * into v_card;

  if v_card.id is null then
    raise exception 'no card found for this customer';
  end if;

  insert into loopkit.stamp_events (card_id, kind, payload)
    values (v_card.id, 'adjust', jsonb_build_object('delta', p_delta, 'reason', p_reason));

  return v_card;
end;
$$;

grant execute on function loopkit.adjust_stamp(uuid, text, int, text) to authenticated;
