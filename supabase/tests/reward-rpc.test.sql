-- Apply migrations to a disposable local database before running this pgTAP file.
begin;
select no_plan();
select ok(not has_function_privilege('anon', 'loopkit._add_stamp_unchecked(uuid,text)', 'execute'), 'anon cannot call unchecked stamps');
select ok(not has_function_privilege('authenticated', 'loopkit._add_stamp_unchecked(uuid,text)', 'execute'), 'vendor cannot bypass stamp authorization');
select ok(not has_function_privilege('anon', 'loopkit.apply_referral_credit(uuid,text,jsonb,text,jsonb)', 'execute'), 'anon cannot submit engine state');
select ok(not has_function_privilege('authenticated', 'loopkit.apply_referral_credit(uuid,text,jsonb,text,jsonb)', 'execute'), 'vendor cannot submit another host state');
select ok(not has_function_privilege('service_role', 'loopkit.apply_referral_credit(uuid,text,jsonb,text,jsonb)', 'execute'), 'legacy unchecked commit is closed');

insert into auth.users (id, instance_id, aud, role, email) values
('00480000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reward-a@test.local'),
('00480000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reward-b@test.local');
insert into loopkit.programs (id, vendor_id, type, name, stamps_required, reward_text, config, active) values
('00480000-0000-0000-0000-000000000010', '00480000-0000-0000-0000-000000000001', 'stamp', 'Audit rewards', 10, 'Coffee', '{}', true),
('00480000-0000-0000-0000-000000000020', '00480000-0000-0000-0000-000000000002', 'stamp', 'Other vendor', 10, 'Coffee', '{}', true);
insert into loopkit.qkit_earn_config (vendor_id, program_id, enabled) values
('00480000-0000-0000-0000-000000000001', '00480000-0000-0000-0000-000000000010', true);
insert into merqo.kit_events (vendor_id, kit_name, event_type, event_data) values
('00480000-0000-0000-0000-000000000001', 'qkit', 'order_completed', '{"order_id":"00480000-0000-0000-0000-000000000100"}'),
('00480000-0000-0000-0000-000000000001', 'qkit', 'order_completed', '{"order_id":"00480000-0000-0000-0000-000000000101"}');

-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000100', '+6591110048', 'Guest', 999999, '{"rewardReady":true}')).stamp_count, 1, 'caller cannot mint arbitrary stamp counts');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000100', '+6591110048', 'Guest', 999999, '{"rewardReady":true}')).state, '{}'::jsonb, 'caller cannot write arbitrary card state');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000100', '+6591110048', 'Guest', 999999, '{}')).stamp_count, 1, 'same-order retry does not add stamps');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000101', '+6591110048', 'Guest', 0, '{}')).stamp_count, 2, 'new order increments persisted count independently of input');
select throws_ok($$select loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000100', '+6592220048', 'Other', 1, '{}')$$, 'P0001', 'order already claimed', 'replay cannot disclose another phone card');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00480000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$update loopkit.qkit_earn_config set program_id='00480000-0000-0000-0000-000000000020' where vendor_id='00480000-0000-0000-0000-000000000001'$$, '42501', null, 'vendor cannot route earn into another vendor program');
select throws_ok($$insert into loopkit.referral_hosts (vendor_id, program_id, host_phone) values ('00480000-0000-0000-0000-000000000001', '00480000-0000-0000-0000-000000000020', '+6591110048')$$, '42501', null, 'vendor cannot create a referral into another vendor program');
reset role;

-- Internal helpers remain inaccessible to every client role.
select ok(not has_function_privilege('anon', 'loopkit._expire_stale_vouchers_unchecked(uuid)', 'execute'), 'anon cannot expire another card rewards');
select ok(not has_function_privilege('authenticated', 'loopkit._expire_stale_vouchers_unchecked(uuid)', 'execute'), 'vendor must use guarded expiry wrapper');
select ok(not has_function_privilege('anon', 'loopkit._grant_reward_voucher_unchecked(uuid,text,int,int,boolean)', 'execute'), 'anon cannot mint vouchers');
select ok(not has_function_privilege('authenticated', 'loopkit._grant_reward_voucher_unchecked(uuid,text,int,int,boolean)', 'execute'), 'vendor must use guarded voucher wrapper');

update loopkit.programs set stamps_required = 2, reward_expiry_days = 90,
  config = '{"stamps_required":2,"reward_text":"Coffee","points_per_visit":1}'
where id = '00480000-0000-0000-0000-000000000010';
insert into merqo.kit_events (vendor_id, kit_name, event_type, event_data)
select '00480000-0000-0000-0000-000000000001', 'qkit', 'order_completed',
  jsonb_build_object('order_id', '00480000-0000-0000-0000-' || lpad(n::text, 12, '0'))
from generate_series(201, 208) n;

-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000201', '+6592220048', null, 9999, '{}')).stamp_count, 1, 'first order earns one stamp');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000202', '+6592220048', null, 9999, '{}')).stamp_count, 2, 'second order crosses reward threshold');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000202', '+6592220048', null, 9999, '{}')).stamp_count, 2, 'threshold order retry is idempotent');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000203', '+6592220048', null, 9999, '{}')).stamp_count, 2, 'qkit earn preserves the configured cap');
reset role;
select is((select count(*)::int from loopkit.reward_vouchers v join loopkit.cards c on c.id=v.card_id where c.phone='+6592220048' and c.program_id='00480000-0000-0000-0000-000000000010'), 1, 'one crossing creates exactly one voucher');
select ok((select v.status='active' and v.reward_text='Coffee' and v.expires_at > now() from loopkit.reward_vouchers v join loopkit.cards c on c.id=v.card_id where c.phone='+6592220048' and c.program_id='00480000-0000-0000-0000-000000000010'), 'voucher retains reward snapshot and expiry');

update loopkit.reward_vouchers set expires_at=now()-interval '1 day'
where card_id=(select id from loopkit.cards where phone='+6592220048' and program_id='00480000-0000-0000-0000-000000000010');
-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000204', '+6592220048', null, 9999, '{}')).stamp_count, 1, 'expired reward is deducted once before the new stamp');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000205', '+6592220048', null, 9999, '{}')).stamp_count, 2, 'a new reward cycle can reach its threshold');
reset role;
select is((select count(*)::int from loopkit.reward_vouchers v join loopkit.cards c on c.id=v.card_id where c.phone='+6592220048' and v.status='expired'), 1, 'old voucher remains expired in the ledger');
select is((select count(*)::int from loopkit.reward_vouchers v join loopkit.cards c on c.id=v.card_id where c.phone='+6592220048' and v.status='active'), 1, 'new cycle creates one active voucher');

insert into loopkit.cards (program_id, phone, stamp_count)
values ('00480000-0000-0000-0000-000000000010', '+6593330048', 0);
update loopkit.customers set
  birth_month=extract(month from now() at time zone 'Asia/Singapore')::smallint,
  birth_day=extract(day from now() at time zone 'Asia/Singapore')::smallint,
  last_birthday_reward_year=null
where vendor_id='00480000-0000-0000-0000-000000000001' and phone='+6593330048';
update loopkit.programs set birthday_bonus_enabled=true where id='00480000-0000-0000-0000-000000000010';
-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000206', '+6593330048', null, 0, '{}')).stamp_count, 2, 'anonymous earn returns the birthday-adjusted count');
select is((loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000206', '+6593330048', null, 0, '{}')).stamp_count, 2, 'birthday claim retry does not reapply the bonus');
reset role;
select is((select count(*)::int from loopkit.reward_vouchers v join loopkit.cards c on c.id=v.card_id where c.phone='+6593330048'), 1, 'nested birthday grant creates exactly one reward');
update loopkit.programs set birthday_bonus_enabled=false where id='00480000-0000-0000-0000-000000000010';

insert into loopkit.referral_hosts (id, vendor_id, program_id, host_phone, referral_code)
values ('00480000-0000-0000-0000-000000000301', '00480000-0000-0000-0000-000000000001', '00480000-0000-0000-0000-000000000010', '+6594440048', 'audit-voucher-referral');
-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select lives_ok($$select * from loopkit.vendor_join_referred('00480000-0000-0000-0000-000000000001', '+6591110001', 'audit-voucher-referral')$$, 'first referral guest can join');
select lives_ok($$select * from loopkit.vendor_join_referred('00480000-0000-0000-0000-000000000001', '+6591110002', 'audit-voucher-referral')$$, 'second referral guest earns host reward');
select lives_ok($$select * from loopkit.vendor_join_referred('00480000-0000-0000-0000-000000000001', '+6591110002', 'audit-voucher-referral')$$, 'duplicate referral guest is harmless');
select lives_ok($$select * from loopkit.vendor_join_referred('00480000-0000-0000-0000-000000000001', '+6591110003', 'audit-voucher-referral')$$, 'referral stamps remain uncapped');
reset role;
select is((select stamp_count from loopkit.cards where phone='+6594440048' and program_id='00480000-0000-0000-0000-000000000010'), 3, 'three unique guests earn exactly three stamps');
select is((select count(*)::int from loopkit.reward_vouchers v join loopkit.cards c on c.id=v.card_id where c.phone='+6594440048'), 1, 'referral crossing creates one voucher without duplicate grants');

-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select throws_ok($$select loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000999', '+6591110048', null, 1, '{}')$$, 'P0001', 'invalid order', 'missing completion event cannot earn rewards');
reset role;
update loopkit.programs set active=false where id='00480000-0000-0000-0000-000000000010';
-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select throws_ok($$select loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000208', '+6591110048', null, 1, '{}')$$, 'P0001', 'not configured', 'inactive program cannot earn qkit rewards');
reset role;
update loopkit.programs set active=true, type='plant' where id='00480000-0000-0000-0000-000000000010';
-- Exercise retired implementation as fixture owner; public ACLs are tested separately.
select throws_ok($$select loopkit.qkit_earn_commit('00480000-0000-0000-0000-000000000208', '+6591110048', null, 1, '{}')$$, 'P0001', 'not configured', 'non-stamp program cannot receive qkit stamp state');
reset role;
update loopkit.programs set type='stamp' where id='00480000-0000-0000-0000-000000000010';

insert into loopkit.referral_hosts (id, vendor_id, program_id, host_phone, referral_code)
values ('00480000-0000-0000-0000-000000000302', '00480000-0000-0000-0000-000000000001', '00480000-0000-0000-0000-000000000020', '+6595550048', 'legacy-cross-owner');
insert into loopkit.referral_credits (referral_host_id, guest_phone)
values ('00480000-0000-0000-0000-000000000302', '+6596660048');
set local role service_role;
select throws_ok($$select loopkit.apply_referral_credit_checked('00480000-0000-0000-0000-000000000302', '+6596660048', '{}', '{}', '{}')$$, 'P0001', 'invalid referral', 'legacy cross-owner referral cannot be finalized');
reset role;

select * from finish();
rollback;