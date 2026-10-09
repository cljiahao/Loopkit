-- Lock card progress before touching its vouchers, matching earning paths.
CREATE OR REPLACE FUNCTION loopkit.redeem(p_card uuid)
RETURNS loopkit.cards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_card loopkit.cards;
  v_program uuid;
  v_required int;
  v_expired_count int;
BEGIN
  SELECT program_id INTO v_program FROM loopkit.cards WHERE id = p_card;
  IF v_program IS NULL OR NOT loopkit.owns_program(v_program) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT stamps_required INTO v_required FROM loopkit.programs
    WHERE id = v_program FOR SHARE;
  SELECT * INTO v_card FROM loopkit.cards WHERE id = p_card FOR UPDATE;
  IF v_card.id IS NULL OR v_card.program_id IS DISTINCT FROM v_program THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_expired_count := loopkit.expire_stale_vouchers(p_card);
  PERFORM loopkit.redeem_oldest_voucher(p_card);
  UPDATE loopkit.cards
    SET stamp_count = greatest(stamp_count - v_expired_count * v_required - v_required, 0),
        reward_count = reward_count + 1, updated_at = now()
    WHERE id = p_card RETURNING * INTO v_card;
  INSERT INTO loopkit.stamp_events (card_id, kind) VALUES (p_card, 'redeem');
  RETURN v_card;
END;
$$;

CREATE OR REPLACE FUNCTION loopkit.redeem_oldest_voucher(p_card uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT loopkit.owns_program((SELECT program_id FROM loopkit.cards WHERE id = p_card)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT id INTO v_id FROM loopkit.reward_vouchers
    WHERE card_id = p_card AND status = 'active'
    ORDER BY earned_at, id LIMIT 1 FOR UPDATE;
  IF v_id IS NULL THEN RAISE EXCEPTION 'no_active_voucher'; END IF;
  UPDATE loopkit.reward_vouchers
    SET status = 'redeemed', redeemed_at = now(), updated_at = now()
    WHERE id = v_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'no_active_voucher'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION loopkit.redeem(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION loopkit.redeem(uuid) TO authenticated;
-- Helpers change voucher status without the coordinated progress/event update.
REVOKE ALL ON FUNCTION loopkit.redeem_oldest_voucher(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION loopkit.expire_stale_vouchers(uuid) FROM PUBLIC, anon, authenticated, service_role;
