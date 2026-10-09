BEGIN;
SELECT no_plan();
SELECT ok(NOT has_function_privilege(role_name, 'loopkit.redeem_oldest_voucher(uuid)', 'execute'), role_name || ' cannot bypass coordinated redemption')
  FROM unnest(ARRAY['anon','authenticated','service_role']) role_name;
SELECT ok(NOT has_function_privilege(role_name, 'loopkit.expire_stale_vouchers(uuid)', 'execute'), role_name || ' cannot expire vouchers without coordinating progress')
  FROM unnest(ARRAY['anon','authenticated','service_role']) role_name;
SELECT ok(NOT has_function_privilege('anon', 'loopkit.redeem(uuid)', 'execute'), 'anonymous caller cannot redeem');

INSERT INTO auth.users(id,instance_id,aud,role,email) VALUES
('00570000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stamp-lock-owner@test.local'),
('00570000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stamp-lock-foreign@test.local');
INSERT INTO loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active) VALUES
('00570000-0000-0000-0000-000000000010','00570000-0000-0000-0000-000000000001','stamp','Stamp lock',10,'Coffee','{}',true);
INSERT INTO loopkit.cards(id,program_id,phone,stamp_count,reward_count) VALUES
('00570000-0000-0000-0000-000000000020','00570000-0000-0000-0000-000000000010','+6591110057',33,3);
INSERT INTO loopkit.reward_vouchers(id,card_id,program_id,reward_text,earned_at,expires_at,status) VALUES
('00570000-0000-0000-0000-000000000030','00570000-0000-0000-0000-000000000020','00570000-0000-0000-0000-000000000010','Expired',now()-interval '2 days',now()-interval '1 day','active'),
('00570000-0000-0000-0000-000000000031','00570000-0000-0000-0000-000000000020','00570000-0000-0000-0000-000000000010','First tied',now(),null,'active'),
('00570000-0000-0000-0000-000000000032','00570000-0000-0000-0000-000000000020','00570000-0000-0000-0000-000000000010','Second tied',now(),null,'active');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00570000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT throws_ok($$SELECT loopkit.redeem('00570000-0000-0000-0000-000000000020')$$,'P0001','not authorized','foreign vendor cannot redeem');
SELECT set_config('request.jwt.claims','{"sub":"00570000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is((loopkit.redeem('00570000-0000-0000-0000-000000000020')).stamp_count,13,'expiration and redemption each deduct one threshold and preserve carry');
RESET ROLE;
SELECT is((SELECT status FROM loopkit.reward_vouchers WHERE id='00570000-0000-0000-0000-000000000030'),'expired','stale voucher expires');
SELECT is((SELECT status FROM loopkit.reward_vouchers WHERE id='00570000-0000-0000-0000-000000000031'),'redeemed','equal earned timestamps use deterministic id order');
SELECT is((SELECT status FROM loopkit.reward_vouchers WHERE id='00570000-0000-0000-0000-000000000032'),'active','remaining voucher stays active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00570000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is((loopkit.redeem('00570000-0000-0000-0000-000000000020')).stamp_count,3,'second distinct voucher deducts exactly one threshold');
SELECT throws_ok($$SELECT loopkit.redeem('00570000-0000-0000-0000-000000000020')$$,'P0001','no_active_voucher','exhausted voucher cannot redeem again');
RESET ROLE;
SELECT is((SELECT reward_count FROM loopkit.cards WHERE id='00570000-0000-0000-0000-000000000020'),5,'lifetime count increments exactly twice');
SELECT is((SELECT stamp_count FROM loopkit.cards WHERE id='00570000-0000-0000-0000-000000000020'),3,'rejected retry preserves carry');
SELECT is((SELECT count(*) FROM loopkit.stamp_events WHERE card_id='00570000-0000-0000-0000-000000000020' AND kind='redeem'),2::bigint,'only successful redemptions log events');
SELECT * FROM finish();
ROLLBACK;
