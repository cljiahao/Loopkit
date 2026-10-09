# PostgreSQL isolationtester input: disposable database only, all migrations applied.
setup
{
  INSERT INTO auth.users(id,instance_id,aud,role,email) VALUES
    ('0057ffff-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stamp-isolation@test.local');
  INSERT INTO loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active) VALUES
    ('0057ffff-0000-0000-0000-000000000010','0057ffff-0000-0000-0000-000000000001','stamp','Concurrent stamp',10,'Coffee',jsonb_build_object(),true);
  INSERT INTO loopkit.cards(id,program_id,phone,stamp_count,reward_count) VALUES
    ('0057ffff-0000-0000-0000-000000000020','0057ffff-0000-0000-0000-000000000010','+6591119957',10,0);
  INSERT INTO loopkit.reward_vouchers(id,card_id,program_id,reward_text,status) VALUES
    ('0057ffff-0000-0000-0000-000000000030','0057ffff-0000-0000-0000-000000000020','0057ffff-0000-0000-0000-000000000010','Coffee','active');
  CREATE FUNCTION public.audit_stamp_redemption_attempt() RETURNS boolean
    LANGUAGE plpgsql AS $$ BEGIN
      PERFORM loopkit.redeem('0057ffff-0000-0000-0000-000000000020');
      RETURN true;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'no_active_voucher' THEN RAISE; END IF;
      RETURN false;
    END $$;
}
teardown
{
  DROP FUNCTION public.audit_stamp_redemption_attempt();
  DELETE FROM loopkit.programs WHERE id='0057ffff-0000-0000-0000-000000000010';
  DELETE FROM auth.users WHERE id='0057ffff-0000-0000-0000-000000000001';
}
session first
step first_begin
{
  BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims',json_build_object('sub','0057ffff-0000-0000-0000-000000000001','role','authenticated')::text,true);
}
step first_redeem { SELECT public.audit_stamp_redemption_attempt() AS first_succeeded; }
step first_commit { COMMIT; }
session second
step second_begin
{
  BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config('request.jwt.claims',json_build_object('sub','0057ffff-0000-0000-0000-000000000001','role','authenticated')::text,true);
}
step second_redeem { SELECT public.audit_stamp_redemption_attempt() AS second_succeeded; }
step second_commit { COMMIT; }
session verifier
step verify
{
  SELECT stamp_count=0 AND reward_count=1 AS exactly_one_progress_change
    FROM loopkit.cards WHERE id='0057ffff-0000-0000-0000-000000000020';
  SELECT count(*)=1 AS exactly_one_redemption_event FROM loopkit.stamp_events
    WHERE card_id='0057ffff-0000-0000-0000-000000000020' AND kind='redeem';
  SELECT status='redeemed' AS voucher_consumed FROM loopkit.reward_vouchers
    WHERE id='0057ffff-0000-0000-0000-000000000030';
}
permutation first_begin first_redeem second_begin second_redeem first_commit second_commit verify
