begin;
select plan(8);
insert into auth.users(id,instance_id,aud,role,email) values
('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plant-a@test.local'),
('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plant-b@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active,expiry_days) values
('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','plant','Plant',8,'Coffee','{"stages":[{"name":"Seed","threshold":0},{"name":"Bloom","threshold":8}],"growth_per_visit":1,"decay_rate":1,"floor_growth":0,"grace_days":3}',true,30),
('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','plant','Other',8,'Coffee','{}',true,null);
insert into loopkit.cards(program_id,phone,state,cycle_started_at) values
('33333333-3333-3333-3333-333333333333','+6591234567','{"growth":1,"blooms":0,"bloomed":false}',now()),
('33333333-3333-3333-3333-333333333333','+6591234568','{"growth":8,"blooms":0,"bloomed":true}',now()),
('33333333-3333-3333-3333-333333333333','+6591234569','{"growth":8,"blooms":0,"bloomed":true}',now()-interval '31 days');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$select loopkit.redeem_plant('44444444-4444-4444-4444-444444444444','+6591234567')$$,'P0001','not authorized','cross-vendor plant denied');
select throws_ok($$select loopkit.redeem_plant('33333333-3333-3333-3333-333333333333','+6591234567')$$,'P0001','reward not ready','unearned bloom denied');
select throws_ok($$select loopkit.redeem_plant('33333333-3333-3333-3333-333333333333','+6591234569')$$,'P0001','card expired','expired cycle denied');
select throws_ok($$select loopkit.redeem_plant('33333333-3333-3333-3333-333333333333','+6591234560')$$,'P0001','no card','missing card denied');
select lives_ok($$select loopkit.redeem_plant('33333333-3333-3333-3333-333333333333','+6591234568')$$,'earned bloom redeemed');
select is((select state->>'blooms' from loopkit.cards where phone='+6591234568'),'1','bloom incremented once');
select throws_ok($$select loopkit.redeem_plant('33333333-3333-3333-3333-333333333333','+6591234568')$$,'P0001','reward not ready','duplicate redemption denied');
select is((select count(*)::int from loopkit.stamp_events where kind='redeem'),1,'only successful claim logs an event');
select * from finish();
rollback;
