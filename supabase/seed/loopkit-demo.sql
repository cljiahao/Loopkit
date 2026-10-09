-- Local fixture only, after the complete migration chain. Choose a dedicated
-- auth user with no programs and replace <YOUR_AUTH_USER_ID> below.
-- Existing programs are never deleted; reruns fail without changing data.

do $$
declare
  v_vendor  uuid := '<YOUR_AUTH_USER_ID>';
  v_program uuid;
  v_card1 uuid := gen_random_uuid();
  v_card2 uuid := gen_random_uuid();
  v_card3 uuid := gen_random_uuid();
  v_card4 uuid := gen_random_uuid();
  v_card5 uuid := gen_random_uuid();
  v_card6 uuid := gen_random_uuid();
  v_card7 uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(v_vendor::text, 0));
  if exists (select 1 from loopkit.programs where vendor_id = v_vendor) then
    raise exception 'Demo seed requires a dedicated local vendor without programs';
  end if;

  insert into loopkit.programs (vendor_id, name, type, stamps_required, reward_text, config, active)
  values (v_vendor, 'Kopi Corner', 'stamp', 9, 'free kopi',
    '{"stamps_required":9,"reward_text":"free kopi"}', true)
  returning id into v_program;

  -- Cards use fresh IDs so different dedicated demo vendors cannot collide.
  insert into loopkit.cards (id, program_id, phone, stamp_count, reward_count, created_at, updated_at) values
    (v_card1, v_program, '+6591234567', 9, 0, now() - interval '12 days', now() - interval '2 hours'),
    (v_card2, v_program, '+6598765432', 6, 0, now() - interval '9 days',  now() - interval '22 hours'),
    (v_card3, v_program, '+6583334444', 3, 0, now() - interval '6 days',  now() - interval '3 days'),
    (v_card4, v_program, '+6592223333', 8, 1, now() - interval '20 days', now() - interval '5 hours'),
    (v_card5, v_program, '+6561234567', 1, 0, now() - interval '6 days',  now() - interval '6 days'),
    (v_card6, v_program, '+6581112222', 9, 2, now() - interval '40 days', now() - interval '25 minutes'),
    (v_card7, v_program, '+6590001111', 2, 0, now() - interval '1 hour',  now() - interval '40 minutes');

  update loopkit.cards
  set state = jsonb_build_object('stamp_count', stamp_count),
      last_event_at = updated_at
  where program_id = v_program;

  insert into loopkit.reward_vouchers (card_id, program_id, reward_text)
  select id, v_program, 'free kopi' from loopkit.cards
  where program_id = v_program and stamp_count >= 9;
  insert into loopkit.reward_vouchers
    (card_id, program_id, reward_text, status, redeemed_at)
  select card.id, v_program, 'free kopi', 'redeemed', card.updated_at
  from loopkit.cards card
  cross join lateral generate_series(1, card.reward_count)
  where card.program_id = v_program;

  -- Recent activity feed (most recent first once ordered by created_at desc).
  insert into loopkit.stamp_events (card_id, kind, created_at) values
    (v_card6, 'stamp',  now() - interval '25 minutes'),
    (v_card7, 'stamp',  now() - interval '40 minutes'),
    (v_card1, 'stamp',  now() - interval '2 hours'),
    (v_card4, 'redeem', now() - interval '5 hours'),
    (v_card2, 'stamp',  now() - interval '22 hours'),
    (v_card6, 'redeem', now() - interval '2 days'),
    (v_card3, 'stamp',  now() - interval '3 days'),
    (v_card5, 'stamp',  now() - interval '6 days');
end $$;
