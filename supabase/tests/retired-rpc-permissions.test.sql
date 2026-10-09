begin;
select plan(3);
select ok(not has_function_privilege('authenticated','loopkit.grant_reward_voucher(uuid,text,integer,integer,boolean)','execute'),'client voucher mint denied');
select ok(has_function_privilege('authenticated','loopkit.create_program(text,text,integer,text,jsonb,integer,boolean,boolean,boolean,integer,integer)','execute'),'current creator allowed');
select is((select count(*)::int from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='loopkit' and p.proname='create_program' and has_function_privilege('authenticated',p.oid,'execute')),1,'only current creator exposed');
select * from finish();
rollback;
