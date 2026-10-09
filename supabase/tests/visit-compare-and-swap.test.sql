begin;
select plan(8);
insert into auth.users(id,instance_id,aud,role,email) values
('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','visit-a@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active) values
('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','plant','Plant',8,'Coffee','{}',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select lives_ok($$select loopkit.record_visit_checked('33333333-3333-3333-3333-333333333333','+6591234567','{"growth":1}','visit','{}',null)$$,'first visit succeeds');
select throws_ok($$select loopkit.record_visit_checked('33333333-3333-3333-3333-333333333333','+6591234567','{"growth":9}','visit','{}',null)$$,'40001','card changed','concurrent initial snapshot rejected');
select is((select state->>'growth' from loopkit.cards where phone='+6591234567'),'1','stale write does not overwrite growth');
select is((select count(*)::int from loopkit.stamp_events),1,'stale write does not add event');
select lives_ok($$select loopkit.record_visit_checked('33333333-3333-3333-3333-333333333333','+6591234567','{"growth":2}','visit','{}',(select updated_at from loopkit.cards where phone='+6591234567'))$$,'fresh snapshot succeeds');
select throws_ok($$select loopkit.record_visit_checked('33333333-3333-3333-3333-333333333333','+6591234567','{}','redeem','{}',null)$$,'P0001','invalid visit kind','visit RPC cannot bypass plant redemption');
select throws_ok($$select loopkit.record_visit_checked('33333333-3333-3333-3333-333333333333','bad','{}','visit','{}',null)$$,'P0001','invalid phone','invalid phone rejected');
select throws_ok($$select loopkit.record_visit('33333333-3333-3333-3333-333333333333','+6591234567','{}','visit','{}')$$,'42501',null,'unchecked legacy writer denied');
select * from finish();
rollback;
