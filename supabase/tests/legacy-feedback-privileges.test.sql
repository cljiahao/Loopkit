begin;
select no_plan();

select ok(not has_table_privilege('authenticated', 'loopkit.feedback', 'INSERT'),
  'authenticated callers cannot append to legacy feedback');
select ok(not has_table_privilege('anon', 'loopkit.feedback', 'INSERT'),
  'anonymous callers cannot append to legacy feedback');
select ok(has_table_privilege('service_role', 'loopkit.feedback', 'INSERT'),
  'service maintenance inserts remain available');
select ok(has_table_privilege('service_role', 'loopkit.feedback', 'SELECT'),
  'service historical reads remain available');
select ok(has_table_privilege(owner.rolname, relation.oid, 'INSERT'),
  'owner maintenance inserts remain available')
from pg_class relation join pg_roles owner on owner.oid = relation.relowner
where relation.oid = 'loopkit.feedback'::regclass;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000005900', 'legacy-feedback-0059@example.test');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000005900","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ insert into loopkit.feedback (vendor_id, nps) values ('00000000-0000-0000-0000-000000005900', 8) $$,
  '42501', null, 'even own-subject legacy inserts are rejected');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$ insert into loopkit.feedback (vendor_id, nps) values ('00000000-0000-0000-0000-000000005900', 8) $$,
  '42501', null, 'anonymous legacy inserts are rejected');
reset role;

set local role service_role;
select lives_ok(
  $$ insert into loopkit.feedback (vendor_id, nps, message) values ('00000000-0000-0000-0000-000000005900', 8, 'maintenance fixture') $$,
  'service maintenance can append legacy feedback');
select is((select count(*) from loopkit.feedback
  where vendor_id = '00000000-0000-0000-0000-000000005900'), 1::bigint,
  'only the service maintenance insertion succeeds');
reset role;

select * from finish();
rollback;
