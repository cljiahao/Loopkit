begin;
select no_plan();
select ok(not has_function_privilege('anon','loopkit.qkit_earn_lookup(uuid,text)','execute'),'anon cannot read card progress by order and phone');
select ok(not has_function_privilege('service_role','loopkit.qkit_earn_lookup(uuid,text)','execute'),'service proxy cannot call retired lookup');
select ok(not has_function_privilege('anon','loopkit.qkit_earn_commit(uuid,text,text,int,jsonb)','execute'),'anon cannot mint or recover a card through legacy earn');
select ok(not has_function_privilege('service_role','loopkit.qkit_earn_commit(uuid,text,text,int,jsonb)','execute'),'service proxy cannot call retired commit');
select ok(not has_function_privilege('authenticated','loopkit.customer_qkit_earn_claim(uuid,text,text,text)','execute'),'client cannot bypass server proof boundary');
insert into auth.users(id,instance_id,aud,role,email) values
('00560000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','earn-capability@test.local');
insert into loopkit.programs(id,vendor_id,type,name,stamps_required,reward_text,config,active) values
('00560000-0000-0000-0000-000000000010','00560000-0000-0000-0000-000000000001','stamp','Earn audit',10,'Coffee','{}',true);
insert into loopkit.qkit_earn_config(vendor_id,program_id,enabled) values
('00560000-0000-0000-0000-000000000001','00560000-0000-0000-0000-000000000010',true);
insert into merqo.kit_events(vendor_id,kit_name,event_type,event_data)
select '00560000-0000-0000-0000-000000000001','qkit','order_completed',
jsonb_build_object('order_id','00560000-0000-0000-0000-'||lpad(n::text,12,'0')) from generate_series(100,102) n;
set local role service_role;
select is(loopkit.qkit_earn_vendor('00560000-0000-0000-0000-000000000100'),'00560000-0000-0000-0000-000000000001'::uuid,'order context contains only vendor identity');
select is((loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000100','+6591110056','Guest',null)->>'stamp_count')::int,1,'fresh enrollment earns one stamp');
select throws_ok($$select loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000100','+6591110056',null,null)$$,'P0001','customer proof required','replay cannot recover existing token with phone alone');
select throws_ok($$select loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000101','+6591110056',null,null)$$,'P0001','customer proof required','another paid order cannot recover existing victim token');
select throws_ok($$select loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000101','+6591110056',null,repeat('b',32))$$,'P0001','customer proof required','wrong token cannot spend a paid earn order');
reset role;
select set_config('test.earn_token',(select card_token from loopkit.cards where program_id='00560000-0000-0000-0000-000000000010' and phone='+6591110056'),true);
set local role service_role;
select is((loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000101','+6591110056',null,current_setting('test.earn_token'))->>'stamp_count')::int,2,'valid saved proof earns a new stamp');
select is((loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000101','+6591110056',null,current_setting('test.earn_token'))->>'stamp_count')::int,2,'authorized retry is idempotent');
select throws_ok($$select loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000102','+6592220056',null,current_setting('test.earn_token'))$$,'P0001','customer proof required','proof cannot enroll a different phone');
reset role;
select is((select count(*) from loopkit.qkit_earn_events where vendor_id='00560000-0000-0000-0000-000000000001'),2::bigint,'denied attempts leave order claim ledger unchanged');
update loopkit.cards set card_token=repeat('c',32) where program_id='00560000-0000-0000-0000-000000000010' and phone='+6591110056';
set local role service_role;
select throws_ok($$select loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000102','+6591110056',null,current_setting('test.earn_token'))$$,'P0001','customer proof required','rotated proof cannot claim through earn');
select is((loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000102','+6591110056',null,repeat('c',32))->>'stamp_count')::int,3,'replacement proof preserves and advances progress');
reset role;
-- Simulate a concurrent enrollment winning the uniqueness check at insertion.
create function loopkit.test_earn_insert_conflict() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.phone='+6593330056' and pg_catalog.pg_trigger_depth()=1 then
    insert into loopkit.cards(program_id,phone,stamp_count,card_token)
    values(new.program_id,new.phone,7,repeat('d',32));
  end if;
  return new;
end;
$$;
create trigger test_earn_insert_conflict before insert on loopkit.cards
for each row execute function loopkit.test_earn_insert_conflict();
insert into merqo.kit_events(vendor_id,kit_name,event_type,event_data) values
('00560000-0000-0000-0000-000000000001','qkit','order_completed','{"order_id":"00560000-0000-0000-0000-000000000103"}');
set local role service_role;
select throws_ok($$select loopkit.customer_qkit_earn_claim('00560000-0000-0000-0000-000000000103','+6593330056',null,null)$$,'P0001','customer proof required','insert conflict never returns a previously minted credential');
reset role;
drop trigger test_earn_insert_conflict on loopkit.cards;
drop function loopkit.test_earn_insert_conflict();
select is((select count(*) from loopkit.qkit_earn_events where order_id='00560000-0000-0000-0000-000000000103'),0::bigint,'conflicting enrollment leaves earn event unclaimed');
select * from finish();
rollback;
