begin;
select plan(12);
insert into auth.users(id,instance_id,aud,role,email) values
('81111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','points-owner@test.local'),
('82222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','points-foreign@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active) values
('83333333-3333-3333-3333-333333333333','81111111-1111-1111-1111-111111111111','stamp','Catalog',100,'Coffee',
'{"variant":"points","redemption_mode":"catalog","catalog":[{"id":"coffee","label":"Coffee","cost":6},{"id":"invalid","label":"Invalid","cost":-6}]}',true),
('84444444-4444-4444-4444-444444444444','81111111-1111-1111-1111-111111111111','stamp','Offset',100,'Coffee',
'{"variant":"points","redemption_mode":"offset","offset_rate":{"points":5,"dollars":1}}',true);
insert into loopkit.cards(id,program_id,phone,stamp_count) values
('85555555-5555-5555-5555-555555555555','83333333-3333-3333-3333-333333333333','+6593234561',10),
('86666666-6666-6666-6666-666666666666','84444444-4444-4444-4444-444444444444','+6593234562',10);
-- Exercise the retired debit implementation as fixture owner; capability ACLs are tested separately.
select lives_ok($$select loopkit.select_points_reward('83333333-3333-3333-3333-333333333333','+6593234561','coffee')$$,'catalog debit issues one voucher');
select throws_ok($$select loopkit.select_points_reward('83333333-3333-3333-3333-333333333333','+6593234561','coffee')$$,'P0001','insufficient_points','second debit cannot reuse spent balance');
select throws_ok($$select loopkit.select_points_reward('83333333-3333-3333-3333-333333333333','+6593234561','invalid')$$,'P0001','invalid reward','negative catalog cost cannot credit balance');
reset role;
select is((select stamp_count from loopkit.cards where id='85555555-5555-5555-5555-555555555555'),4,'failed catalog calls preserve committed balance');
select is((select count(*) from loopkit.reward_vouchers where card_id='85555555-5555-5555-5555-555555555555'),1::bigint,'failed catalog calls create no vouchers');
select set_config('test.voucher_token',(select voucher_token from loopkit.reward_vouchers where card_id='85555555-5555-5555-5555-555555555555'),true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"82222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
select throws_ok($$select loopkit.redeem_voucher_by_token(current_setting('test.voucher_token'))$$,'P0001','not authorized','foreign vendor cannot redeem voucher');
select set_config('request.jwt.claims','{"sub":"81111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select lives_ok($$select loopkit.redeem_voucher_by_token(current_setting('test.voucher_token'))$$,'owning vendor redeems voucher');
select throws_ok($$select loopkit.redeem_voucher_by_token(current_setting('test.voucher_token'))$$,'P0001','already_redeemed','voucher cannot report second successful redemption');
select lives_ok($$select loopkit.apply_points_offset('86666666-6666-6666-6666-666666666666',6)$$,'owning vendor debits offset points');
select throws_ok($$select loopkit.apply_points_offset('86666666-6666-6666-6666-666666666666',6)$$,'P0001','invalid amount','offset cannot reuse spent balance');
select throws_ok($$select loopkit.apply_points_offset('86666666-6666-6666-6666-666666666666',null)$$,'P0001','invalid amount','null offset amount fails before writes');
reset role;
select is((select stamp_count from loopkit.cards where id='86666666-6666-6666-6666-666666666666'),4,'failed offset calls preserve balance');
select * from finish();
rollback;
