begin;
select plan(26);
insert into auth.users(id,instance_id,aud,role,email) values
('91111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','proof-owner@test.local'),
('92222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','proof-foreign@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active,expiry_days) values
('93333333-3333-4333-8333-333333333333','91111111-1111-4111-8111-111111111111','stamp','Catalog',100,'Coffee','{"variant":"points","redemption_mode":"catalog","catalog":[{"id":"coffee","label":"Coffee","cost":6}]}',true,30),
('94444444-4444-4444-8444-444444444444','92222222-2222-4222-8222-222222222222','stamp','Foreign',10,'Tea','{}',true,30);
insert into loopkit.cards(id,program_id,phone,stamp_count,card_token,cycle_started_at) values
('95555555-5555-4555-8555-555555555555','93333333-3333-4333-8333-333333333333','+6593234561',10,'11111111111111111111111111111111',now()),
('96666666-6666-4666-8666-666666666666','94444444-4444-4444-8444-444444444444','+6593234561',8,'22222222222222222222222222222222',now());
select ok(not has_function_privilege('anon','loopkit.vendor_join(uuid,text)','EXECUTE'),'anonymous legacy join revoked');
select ok(not has_function_privilege('authenticated','loopkit.enroll_card(uuid,text)','EXECUTE'),'enrollment conflict cannot leak via authenticated RPC');
select ok(not has_function_privilege('service_role','loopkit.card_view(uuid,text)','EXECUTE'),'service code cannot accidentally use legacy lookup');
select ok(not has_function_privilege('anon','loopkit.vendor_join_cards(uuid,text)','EXECUTE'),'default PUBLIC helper grant revoked');
select ok(not has_function_privilege('anon','loopkit.regenerate_card(uuid,text)','EXECUTE'),'legacy reset revoked');
select ok(not has_function_privilege('authenticated','loopkit.set_customer_birthday(uuid,text,smallint,smallint)','EXECUTE'),'legacy birthday revoked');
select ok(not has_function_privilege('anon','loopkit.select_points_reward(uuid,text,text)','EXECUTE'),'legacy points debit revoked');
set local role service_role;
select throws_ok($$select loopkit.customer_join('91111111-1111-4111-8111-111111111111','+6593234561',null,null)$$,'P0001','customer proof required','phone only cannot return existing credentials');
select throws_ok($$select loopkit.customer_join('91111111-1111-4111-8111-111111111111','+6593234561','22222222222222222222222222222222',null)$$,'P0001','customer proof required','cross-vendor proof rejected');
select lives_ok($$select loopkit.customer_join('91111111-1111-4111-8111-111111111111','+6593234561','11111111111111111111111111111111',null)$$,'valid proof reads own cards');
select throws_ok($$select loopkit.customer_set_birthday('91111111-1111-4111-8111-111111111111','+6593234561','invalid',1::smallint,1::smallint)$$,'P0001','customer proof required','birthday requires proof');
select throws_ok($$select loopkit.customer_select_points_reward('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','+6593234561','invalid','coffee')$$,'P0001','customer proof required','catalog debit requires proof');
select lives_ok($$select loopkit.customer_select_points_reward('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','+6593234561','11111111111111111111111111111111','coffee')$$,'proved catalog debit succeeds');
select throws_ok($$select loopkit.customer_select_points_reward('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','+6593234561','11111111111111111111111111111111','coffee')$$,'P0001','insufficient_points','second debit cannot reuse balance');
select throws_ok($$select loopkit.customer_reset_expired_card('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','+6593234561','11111111111111111111111111111111')$$,'P0001','card not expired','current cycle cannot be reset');
select set_config('test.new_proof',(loopkit.customer_join('91111111-1111-4111-8111-111111111111','+6593234562',null,null)->'cards'->0->>'card_token'),true);
select ok(length(current_setting('test.new_proof'))=32,'new enrollment delivers freshly minted proof');
select throws_ok($$select loopkit.customer_join('91111111-1111-4111-8111-111111111111','+6593234562',null,null)$$,'P0001','customer proof required','new enrollment replay cannot reveal token');
reset role;
select is((select stamp_count from loopkit.cards where id='95555555-5555-4555-8555-555555555555'),4,'failed proof and debit calls preserve balance');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select throws_ok($$select loopkit.recover_customer_card('93333333-3333-4333-8333-333333333333','+6593234561')$$,'P0001','not authorized','foreign vendor recovery rejected');
select set_config('request.jwt.claims','{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select lives_ok($$select loopkit.recover_customer_card('93333333-3333-4333-8333-333333333333','+6593234561')$$,'owning vendor recovery succeeds');
reset role;
select is((select stamp_count from loopkit.cards where id='95555555-5555-4555-8555-555555555555'),4,'recovery preserves earned progress');
select isnt((select card_token from loopkit.cards where id='95555555-5555-4555-8555-555555555555'),'11111111111111111111111111111111','recovery rotates current capability');
set local role service_role;
select throws_ok($$select loopkit.customer_join('91111111-1111-4111-8111-111111111111','+6593234561','11111111111111111111111111111111',null)$$,'P0001','customer proof required','old capability invalid after recovery');
reset role;
update loopkit.cards set cycle_started_at=now()-interval '31 days' where id='95555555-5555-4555-8555-555555555555';
select set_config('test.recovered_proof',(select card_token from loopkit.cards where id='95555555-5555-4555-8555-555555555555'),true);
set local role service_role;
select lives_ok($$select loopkit.customer_reset_expired_card('91111111-1111-4111-8111-111111111111','93333333-3333-4333-8333-333333333333','+6593234561',current_setting('test.recovered_proof'))$$,'proved expired reset succeeds');
reset role;
select is((select stamp_count from loopkit.cards where id='95555555-5555-4555-8555-555555555555'),0,'expired reset starts a fresh cycle');
select is((select count(*) from loopkit.stamp_events where card_id='95555555-5555-4555-8555-555555555555' and kind='regen'),1::bigint,'authorized reset event accepted once');
select * from finish();
rollback;
