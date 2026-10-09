begin;
select no_plan();

select ok(not has_table_privilege('service_role', relation, 'TRUNCATE'),
  relation || ': service role cannot truncate history')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(has_table_privilege('service_role', relation, 'SELECT'),
  relation || ': service reads remain available')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(has_table_privilege('service_role', relation, 'INSERT'),
  relation || ': service appends remain available')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(not has_table_privilege('service_role', relation, 'UPDATE'),
  relation || ': previous update restriction remains')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(not has_table_privilege('service_role', relation, 'DELETE'),
  relation || ': previous delete restriction remains')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(not has_table_privilege('anon', relation, 'TRUNCATE'),
  relation || ': anonymous callers cannot truncate history')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(not has_table_privilege('authenticated', relation, 'TRUNCATE'),
  relation || ': authenticated callers cannot truncate history')
from unnest(array['loopkit.admin_audit']) as relation;
select ok(has_table_privilege(owner.rolname, relation.oid, 'TRUNCATE'),
  relation.oid::regclass::text || ': owner maintenance remains available')
from pg_class relation join pg_roles owner on owner.oid = relation.relowner
where relation.oid = 'loopkit.admin_audit'::regclass;

set local role service_role;
select throws_ok($$ truncate loopkit.admin_audit $$, '42501', null,
  'service role cannot erase the admin audit trail');
reset role;

select * from finish();
rollback;
