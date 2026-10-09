begin;
select plan(12);
insert into auth.users(id,instance_id,aud,role,email) values
('71111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plant-parity@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active,expiry_days) values
('73333333-3333-3333-3333-333333333333','71111111-1111-1111-1111-111111111111','plant','Parity',8,'Coffee',
'{"stages":[{"name":"Seed","threshold":0},{"name":"Bloom","threshold":8}],"growth_per_visit":1,"decay_rate":1,"floor_growth":0,"grace_days":3}',true,30);
insert into loopkit.cards(program_id,phone,state,cycle_started_at) values
('73333333-3333-3333-3333-333333333333','+6592234561',jsonb_build_object('growth',9,'blooms',0,'bloomed',true,'last_visit_at',now()-interval '10 days'),now()),
('73333333-3333-3333-3333-333333333333','+6592234562',jsonb_build_object('growth',9,'blooms',0,'last_visit_at',now()-interval '10 days'),now()),
('73333333-3333-3333-3333-333333333333','+6592234563',jsonb_build_object('growth',9,'blooms',0,'last_visit_at',now()),now()),
('73333333-3333-3333-3333-333333333333','+6592234564',jsonb_build_object('growth',17,'blooms',0,'bloomed',true,'last_visit_at',now()),now()),
('73333333-3333-3333-3333-333333333333','+6592234565',jsonb_build_object('growth',8,'blooms',0,'bloomed',true,'last_visit_at',now()),now()-interval '30 days');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"71111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select lives_ok($$select loopkit.redeem_plant('73333333-3333-3333-3333-333333333333','+6592234561')$$,'earned bloom survives later decay');
select is((select state->>'growth' from loopkit.cards where phone='+6592234561'),'1','carryover uses persisted growth, matching plantStrategy.redeem');
select is((select (state->>'last_visit_at')::timestamptz from loopkit.cards where phone='+6592234561'),now()-interval '10 days','redemption preserves decay timestamp');
select throws_ok($$select loopkit.redeem_plant('73333333-3333-3333-3333-333333333333','+6592234562')$$,'P0001','reward not ready','legacy readiness uses decayed growth');
select lives_ok($$select loopkit.redeem_plant('73333333-3333-3333-3333-333333333333','+6592234563')$$,'legacy current growth earns a bloom');
select lives_ok($$select loopkit.redeem_plant('73333333-3333-3333-3333-333333333333','+6592234564')$$,'overflow first bloom redeemed');
select is((select state->>'growth' from loopkit.cards where phone='+6592234564'),'9','first bloom carries excess growth');
select is((select state->>'bloomed' from loopkit.cards where phone='+6592234564'),'true','remaining complete bloom remains ready');
select lives_ok($$select loopkit.redeem_plant('73333333-3333-3333-3333-333333333333','+6592234564')$$,'overflow second bloom redeemed');
select is((select state->>'growth' from loopkit.cards where phone='+6592234564'),'1','second bloom consumes exactly one threshold');
select is((select state->>'bloomed' from loopkit.cards where phone='+6592234564'),'false','subthreshold overflow no longer ready');
select throws_ok($$select loopkit.redeem_plant('73333333-3333-3333-3333-333333333333','+6592234565')$$,'P0001','card expired','exact expiry boundary fails closed');
select * from finish();
rollback;
