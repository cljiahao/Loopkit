begin;
select plan(7);
insert into auth.users(id,instance_id,aud,role,email) values
('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replacement-a@test.local'),
('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','replacement-b@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active) values
('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','stamp','Old',8,'Coffee','{}',true),
('44444444-4444-4444-4444-444444444444','22222222-2222-2222-2222-222222222222','stamp','Other',8,'Coffee','{}',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
select throws_ok($$select loopkit.replace_program('44444444-4444-4444-4444-444444444444','stamp','New',8,'Coffee','{}')$$,'P0001','not authorized','cross-vendor replacement denied');
select throws_ok($$select loopkit.replace_program('33333333-3333-3333-3333-333333333333','invalid','New',8,'Coffee','{}')$$,'23514',null,'invalid successor rolls back');
select ok((select active and replaced_by is null from loopkit.programs where id='33333333-3333-3333-3333-333333333333'),'failed creation preserves predecessor');
select lives_ok($$select loopkit.replace_program('33333333-3333-3333-3333-333333333333','stamp','New',8,'Coffee','{}',null,false,true)$$,'free vendor can atomically replace');
select ok((select not active and replaced_by is not null from loopkit.programs where id='33333333-3333-3333-3333-333333333333'),'predecessor retired and linked');
select is((select count(*)::int from loopkit.programs where active),1,'one active successor remains');
select throws_ok($$select loopkit.replace_program('33333333-3333-3333-3333-333333333333','stamp','Again',8,'Coffee','{}')$$,'P0001','already replaced','replayed replacement denied');
select * from finish();
rollback;
