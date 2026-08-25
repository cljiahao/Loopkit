-- loopkit/supabase/tests/rls.test.sql
-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
--
-- Scoped to the highest-risk vendor-facing write paths (loopkit has 40+
-- migrations; exhaustive coverage of every table is out of scope for this
-- pass — see docs/superpowers/specs/2026-07-22-cicd-hook-harness-parity-design.md
-- §3): loopkit.vendors (shared profile, for-all self policy), loopkit.upgrade_requests
-- (vendor-insert/select-own + admin-select-all), loopkit.feedback (self-insert-only),
-- loopkit.vendor_notify_settings (for-all own-row, same shape as vendors),
-- loopkit.referral_hosts (own-row create/read, no update/delete grant), and a
-- functional suite for vendor_join_referred/apply_referral_credit.
-- Runs in ONE rolled-back transaction with inline fixtures (fixed UUIDs).

begin;
select plan(90);

-- ── Fixtures (created under the default/superuser test role → RLS + grants
-- are bypassed here, same as inserting via the table owner) ─────────────────
-- Vendor A, Vendor B: ordinary vendors. Admin: a loopkit.admins member.

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-a@test.local'),
  ('00000000-0000-0000-0000-00000000000b',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-b@test.local'),
  ('00000000-0000-0000-0000-00000000000d',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin-d@test.local'),
  -- Vendor C, Vendor F: dedicated to the referral_hosts/vendor_join_referred
  -- tests below — kept separate from A/B so those tests' own program
  -- fixtures don't disturb the provision_default_program section's
  -- "vendor A/B start with N programs" pre-conditions further down.
  ('00000000-0000-0000-0000-00000000000c',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-c@test.local'),
  ('00000000-0000-0000-0000-00000000000f',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'vendor-f@test.local');

insert into loopkit.admins (user_id)
values ('00000000-0000-0000-0000-00000000000d');

insert into loopkit.vendors (vendor_id, name)
values
  ('00000000-0000-0000-0000-00000000000a', 'Vendor A'),
  ('00000000-0000-0000-0000-00000000000b', 'Vendor B');

insert into loopkit.upgrade_requests (id, vendor_id, status)
values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000000a', 'pending'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000000b', 'pending');

-- Vendor B's own vendor_notify_settings row (0038) — seeded here, under the
-- superuser fixture role, so Vendor A's cross-read/update tests below exercise
-- real row-level isolation instead of just an empty result set.
insert into loopkit.vendor_notify_settings (vendor_id, customer_telegram_notify_enabled)
values ('00000000-0000-0000-0000-00000000000b', false);

-- Host/couple-facing referral mechanic (0040): a stamp program and a plant
-- program for vendor C (so the referral tests below cover both the
-- crediting-happens-inline-in-SQL path and the reserve-then-TS-finishes
-- path), plus a stamp program for vendor F purely to prove cross-vendor
-- isolation. referral_code is set explicitly (not left to its random
-- default) so the functional tests below can reference it directly.
insert into loopkit.programs (id, vendor_id, type, name, stamps_required, reward_text, config, active)
values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000000c', 'stamp', 'C Stamp Club', 10, 'Free coffee',
   '{"stamps_required": 10, "reward_text": "Free coffee", "variant": "dots", "points_per_visit": 1}'::jsonb, true),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-00000000000c', 'plant', 'C Plant Club', 8, 'Free plant',
   '{"visits_to_bloom": 8, "reward_text": "Free plant", "variant": "plant"}'::jsonb, true),
  ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-00000000000f', 'stamp', 'F Stamp Club', 10, 'Free coffee',
   '{"stamps_required": 10, "reward_text": "Free coffee", "variant": "dots", "points_per_visit": 1}'::jsonb, true);

insert into loopkit.referral_hosts (id, vendor_id, program_id, host_phone, label, referral_code)
values
  ('00000000-0000-0000-0000-0000000f1001', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000f0001', '+6591110001', 'C Stamp Wedding', 'c-stamp-code'),
  ('00000000-0000-0000-0000-0000000f1002', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000f0002', '+6591110003', 'C Plant Wedding', 'c-plant-code'),
  ('00000000-0000-0000-0000-0000000f1003', '00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000f0003', '+6591110002', 'F Wedding', 'f-stamp-code');

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'loopkit.vendors'::regclass), 'RLS on vendors');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.upgrade_requests'::regclass), 'RLS on upgrade_requests');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.feedback'::regclass), 'RLS on feedback');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.vendor_notify_settings'::regclass), 'RLS on vendor_notify_settings');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.referral_hosts'::regclass), 'RLS on referral_hosts');

-- ── Act as Vendor A ────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text,
  true);

-- vendors: self-all (0017_loopkit_vendor_profile.sql) — A reads/updates its
-- own row, not B's.
select isnt_empty(
  $$ select 1 from loopkit.vendors where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own vendors row');
select is_empty(
  $$ select 1 from loopkit.vendors where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B''s vendors row');
select lives_ok(
  $$ update loopkit.vendors set name = 'Vendor A Updated' where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A can update its own vendors row');
-- A's UPDATE has both table-level UPDATE privilege and RLS SELECT-visibility
-- into B's row. The `for all` policy's USING clause filters B's row out of
-- the target set entirely before the WHERE is applied, so this does not raise
-- an exception (unlike an INSERT/WITH-CHECK violation) — it just updates 0
-- rows. Asserting `throws_ok` here would be wrong; assert the no-op directly,
-- same idiom qkit's rls.test.sql uses for the identical cross-vendor UPDATE
-- shape (see qkit "A cannot update B order").
with upd as (
  update loopkit.vendors set name = 'hijack'
  where vendor_id = '00000000-0000-0000-0000-00000000000b'
  returning 1
)
select is((select count(*)::int from upd), 0, 'A''s update of B''s vendors row is silently filtered to 0 rows');

-- vendor_notify_settings: for-all own-row (0038) — a vendor upserts and reads
-- only their own row directly under RLS, unlike the retired service-role-only
-- vendor_telegram/telegram_link_tokens tables.
select lives_ok(
  $$ insert into loopkit.vendor_notify_settings (vendor_id, customer_telegram_notify_enabled) values ('00000000-0000-0000-0000-00000000000a', true) $$,
  'A can insert its own vendor_notify_settings row');
select throws_ok(
  $$ insert into loopkit.vendor_notify_settings (vendor_id, customer_telegram_notify_enabled) values ('00000000-0000-0000-0000-00000000000b', true) $$,
  '42501',
  null,
  'A cannot insert a vendor_notify_settings row as B (WITH CHECK fails before the PK conflict is ever reached)');
select isnt_empty(
  $$ select 1 from loopkit.vendor_notify_settings where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own vendor_notify_settings row');
select is_empty(
  $$ select 1 from loopkit.vendor_notify_settings where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B''s vendor_notify_settings row');
select lives_ok(
  $$ update loopkit.vendor_notify_settings set customer_telegram_notify_enabled = false where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A can update its own vendor_notify_settings row');
with upd_notify as (
  update loopkit.vendor_notify_settings set customer_telegram_notify_enabled = true
  where vendor_id = '00000000-0000-0000-0000-00000000000b'
  returning 1
)
select is((select count(*)::int from upd_notify), 0, 'A''s update of B''s vendor_notify_settings row is silently filtered to 0 rows');

-- upgrade_requests: vendor inserts/selects own, cannot select another's
select lives_ok(
  $$ insert into loopkit.upgrade_requests (vendor_id, status) values ('00000000-0000-0000-0000-00000000000a', 'pending') $$,
  'A can file its own upgrade request');
select throws_ok(
  $$ insert into loopkit.upgrade_requests (vendor_id, status) values ('00000000-0000-0000-0000-00000000000b', 'pending') $$,
  '42501',
  null,
  'A cannot file an upgrade request as B');
select isnt_empty(
  $$ select 1 from loopkit.upgrade_requests where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'A reads its own upgrade request');
select is_empty(
  $$ select 1 from loopkit.upgrade_requests where id = '00000000-0000-0000-0000-0000000e0002' $$,
  'A cannot read B''s upgrade request');

-- feedback: self-insert-only (no select policy exists at all — 0029_feedback.sql)
select lives_ok(
  $$ insert into loopkit.feedback (vendor_id, nps, message) values ('00000000-0000-0000-0000-00000000000a', 9, 'great') $$,
  'A can insert its own feedback');
select throws_ok(
  $$ insert into loopkit.feedback (vendor_id, nps) values ('00000000-0000-0000-0000-00000000000b', 5) $$,
  '42501',
  null,
  'A cannot insert feedback as B');

-- ── Act as the admin ──────────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text,
  true);

select isnt_empty(
  $$ select 1 from loopkit.upgrade_requests where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'admin reads any vendor''s upgrade request (A)');
select isnt_empty(
  $$ select 1 from loopkit.upgrade_requests where id = '00000000-0000-0000-0000-0000000e0002' $$,
  'admin reads any vendor''s upgrade request (B)');
-- 0013_loopkit_upgrade_requests.sql grants only `select, insert` to
-- `authenticated` — there is no `grant update`, even though the
-- upgrade_requests_admin_update RLS policy exists. Table-level privilege is
-- checked before RLS, so ANY update attempt by the authenticated role
-- (admin or not) is denied outright — the policy is currently unreachable via
-- a direct client and only documents intent; the app's admin action resolves
-- requests through the service-role client instead (per that migration's own
-- comment). Asserting `lives_ok` here would not match reality.
select throws_ok(
  $$ update loopkit.upgrade_requests set status = 'resolved' where id = '00000000-0000-0000-0000-0000000e0001' $$,
  '42501',
  null,
  'admin cannot resolve via direct client update (no UPDATE grant to authenticated; service-role only)');

-- ── Act as anon ───────────────────────────────────────────────────────────
reset role;
set local role anon;
select throws_ok(
  $$ insert into loopkit.feedback (vendor_id, nps) values ('00000000-0000-0000-0000-00000000000a', 7) $$,
  '42501',
  null,
  'anon cannot insert feedback');
-- anon has no table-level grant at all on vendors or upgrade_requests (only
-- `usage on schema loopkit` from 0001_loopkit_core.sql) — a direct SELECT
-- fails on the privilege check itself, before RLS row-filtering ever runs, so
-- it raises permission-denied rather than returning an empty result set.
select throws_ok(
  $$ select 1 from loopkit.vendors $$,
  '42501',
  null,
  'anon cannot read vendors (no SELECT grant)');
select throws_ok(
  $$ select 1 from loopkit.upgrade_requests $$,
  '42501',
  null,
  'anon cannot read upgrade_requests (no SELECT grant)');
select throws_ok(
  $$ select 1 from loopkit.vendor_notify_settings $$,
  '42501',
  null,
  'anon cannot read vendor_notify_settings (no SELECT grant)');
select throws_ok(
  $$ select 1 from loopkit.referral_hosts $$,
  '42501',
  null,
  'anon cannot read referral_hosts (no SELECT grant)');

-- provision_default_program: service_role-only, never authenticated —
-- this function bypasses create_program's own auth.uid()-based ownership
-- check by design (explicit p_vendor_id param), so its grant must be
-- exactly as narrow as intended.
select ok(
  has_function_privilege('service_role', 'loopkit.provision_default_program(uuid)', 'EXECUTE'),
  'service_role can execute provision_default_program');
select ok(
  not has_function_privilege('authenticated', 'loopkit.provision_default_program(uuid)', 'EXECUTE'),
  'authenticated cannot execute provision_default_program');

-- provision_default_program idempotency (migration 0032 fix): keyed on
-- loopkit.programs existence, not loopkit.vendors, so a vendor who already
-- has ANY program (e.g. from /setup's create_program path, unrelated to
-- this RPC) never gets a second "Starter" program silently added.
reset role;
set local role service_role;

select is(
  (select count(*)::int from loopkit.programs where vendor_id = '00000000-0000-0000-0000-00000000000a'),
  0,
  'vendor A has no program yet (pre-condition)');

select isnt(
  loopkit.provision_default_program('00000000-0000-0000-0000-00000000000a'),
  null,
  'first provision for a vendor with no program returns a new id');

select is(
  (select count(*)::int from loopkit.programs where vendor_id = '00000000-0000-0000-0000-00000000000a'),
  1,
  'vendor A now has exactly one program');

-- Vendor B: simulate an existing program created directly (NOT via this
-- RPC — standing in for /setup's create_program path), then re-provision.
insert into loopkit.programs (vendor_id, type, name, stamps_required, reward_text, config, active)
values ('00000000-0000-0000-0000-00000000000b', 'stamp', 'Custom Program', 20, 'Free coffee',
        '{"stamps_required": 20, "reward_text": "Free coffee", "points_per_visit": 1, "variant": "dots"}'::jsonb, true);

select is(
  loopkit.provision_default_program('00000000-0000-0000-0000-00000000000b'),
  null,
  'provisioning a vendor who already has a program returns null (no-op)');

select is(
  (select count(*)::int from loopkit.programs where vendor_id = '00000000-0000-0000-0000-00000000000b'),
  1,
  'vendor B still has exactly one program (no second Starter program added)');

-- provision_default_program TOCTOU fix (migration 0032): a transaction-scoped
-- advisory lock keyed on p_vendor_id closes the read-then-write race between
-- the `where not exists` check and the insert. A true concurrency test isn't
-- practical in pgTAP (single connection, one transaction), so this asserts
-- the lock call is actually present in the function body.
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('loopkit.provision_default_program(uuid)'::regprocedure)) > 0,
  'provision_default_program takes an advisory lock before its idempotency check');

-- ── Act as Vendor C (referral_hosts RLS) ─────────────────────────────────
-- referral_hosts: vendor create/read own, no update/delete grant this round
-- (0040) — same "for all" policy shape as programs_own, but the table-level
-- grant only includes select/insert, so an authenticated UPDATE/DELETE is
-- denied at the privilege check before RLS ever runs (same idiom as
-- upgrade_requests_admin_update's documented-but-unreachable UPDATE policy
-- above). Vendor C/F (not A/B) so these fixtures never touch A/B's own
-- program-count pre-conditions above.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text,
  true);

select isnt_empty(
  $$ select 1 from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001' $$,
  'C reads its own referral_hosts row');
select is_empty(
  $$ select 1 from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1003' $$,
  'C cannot read F''s referral_hosts row');
select lives_ok(
  $$ insert into loopkit.referral_hosts (vendor_id, program_id, host_phone, label)
     values ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000f0001', '+6591110009', 'Another C Wedding') $$,
  'C can create a referral host on its own program');
select throws_ok(
  $$ insert into loopkit.referral_hosts (vendor_id, program_id, host_phone)
     values ('00000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000f0003', '+6591110099') $$,
  '42501',
  null,
  'C cannot create a referral host as F');
select ok(
  not has_table_privilege('authenticated', 'loopkit.referral_hosts', 'UPDATE'),
  'authenticated has no UPDATE grant on referral_hosts (create-only this round)');
select ok(
  not has_table_privilege('authenticated', 'loopkit.referral_hosts', 'DELETE'),
  'authenticated has no DELETE grant on referral_hosts (create-only this round)');

-- ── vendor_join_referred / apply_referral_credit ─────────────────────────
-- Both are granted to anon (same public-surface shape as vendor_join
-- itself) — a real guest tapping a /c?ref= link never has a session. Every
-- direct table read below (guest_count/stamp_count/state/credited_at) runs
-- with role reset first: anon has no SELECT grant on referral_hosts/cards/
-- referral_credits by design (a guest reads through the RPCs only, never
-- the tables directly) — asserting on those columns needs the privileged
-- test-harness role, not the identity under test. Only the RPC calls
-- themselves run as anon.

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001'),
  0, 'C''s stamp referral host starts at 0 guests (pre-condition)');

-- Self-referral (guest phone == host phone) is a deliberate no-op: the
-- guest still gets enrolled normally, but the host must never be credited
-- or bumped — guards against someone farming their own link.
set local role anon;
select lives_ok(
  $$ select * from loopkit.vendor_join_referred(
       '00000000-0000-0000-0000-00000000000c', '+6591110001', 'c-stamp-code') $$,
  'a self-referral call does not throw');

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001'),
  0, 'a self-referral does not bump guest_count');

-- First distinct guest: credits the host exactly once (stamp-type credits
-- inline, mirroring add_stamp's own body).
set local role anon;
select lives_ok(
  $$ select * from loopkit.vendor_join_referred(
       '00000000-0000-0000-0000-00000000000c', '+6591119001', 'c-stamp-code') $$,
  'the first guest referral call does not throw');

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001'),
  1, 'the first distinct guest bumps guest_count to 1');
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-0000000f0001' and phone = '+6591110001'),
  1, 'the host''s stamp card has exactly 1 stamp after one distinct guest');

-- Same guest again via the same link: no double credit.
set local role anon;
select lives_ok(
  $$ select * from loopkit.vendor_join_referred(
       '00000000-0000-0000-0000-00000000000c', '+6591119001', 'c-stamp-code') $$,
  'a repeat visit from the same guest phone does not throw');

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001'),
  1, 'a repeat visit from the same guest phone does not bump guest_count again');
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-0000000f0001' and phone = '+6591110001'),
  1, 'a repeat visit from the same guest phone does not credit the host a second stamp');

-- A second, genuinely different guest: credits again (proves the guard is
-- per-guest, not a blanket "already credited once" flag on the host).
set local role anon;
select lives_ok(
  $$ select * from loopkit.vendor_join_referred(
       '00000000-0000-0000-0000-00000000000c', '+6591119002', 'c-stamp-code') $$,
  'a second distinct guest does not throw');

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001'),
  2, 'a second distinct guest bumps guest_count to 2');
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-0000000f0001' and phone = '+6591110001'),
  2, 'the host''s stamp card has exactly 2 stamps after two distinct guests');

-- Cross-vendor isolation: C's referral_code, called with F as p_vendor, must
-- never resolve or credit anything — referral_code is globally unique, so
-- the vendor_id scope in vendor_join_referred's own lookup is the only
-- thing standing between "a code from C" and "credits something at F". The
-- guest still gets enrolled normally at F, since enrollment doesn't depend
-- on the referral code resolving at all.
set local role anon;
select lives_ok(
  $$ select * from loopkit.vendor_join_referred(
       '00000000-0000-0000-0000-00000000000f', '+6591129001', 'c-stamp-code') $$,
  'a code from vendor C used against vendor F does not throw');

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1001'),
  2, 'vendor C''s referral host is untouched when its code is called against vendor F');
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-0000000f0001' and phone = '+6591110001'),
  2, 'vendor C''s host card is untouched when C''s code is called against vendor F');
select isnt_empty(
  $$ select 1 from loopkit.cards where program_id = '00000000-0000-0000-0000-0000000f0003' and phone = '+6591129001' $$,
  'the guest is still enrolled normally at vendor F even though the foreign referral code did nothing');

-- Non-stamp (plant) type: vendor_join_referred can't compute the engine
-- state itself, so it only *reserves* the credit — guest_count still bumps
-- immediately, but the host's card is untouched until apply_referral_credit
-- (the TypeScript-engine-computed finish step, exercised by
-- src/features/card-check/api/actions.test.ts) runs.
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1002'),
  0, 'C''s plant referral host starts at 0 guests (pre-condition)');

set local role anon;
select results_eq(
  $$ select (referral_credit->>'pending')::boolean
     from loopkit.vendor_join_referred('00000000-0000-0000-0000-00000000000c', '+6591139001', 'c-plant-code') vjr
     where vjr.program_id = '00000000-0000-0000-0000-0000000f0002' $$,
  $$ values (true) $$,
  'a non-stamp referral reserves a pending credit instead of crediting inline');

reset role;
select is(
  (select guest_count from loopkit.referral_hosts where id = '00000000-0000-0000-0000-0000000f1002'),
  1, 'the reservation itself still bumps guest_count immediately');
select is(
  (select credited_at from loopkit.referral_credits
     where referral_host_id = '00000000-0000-0000-0000-0000000f1002' and guest_phone = '+6591139001'),
  null, 'the reserved plant credit is not yet finished (credited_at still null)');

set local role anon;
select lives_ok(
  $$ select * from loopkit.apply_referral_credit(
       '00000000-0000-0000-0000-0000000f1002', '+6591139001',
       '{"growth": 2, "last_visit_at": null, "blooms": 0, "bloomed": false}'::jsonb,
       'visit', '{"won": false}'::jsonb) $$,
  'apply_referral_credit finishes the reserved plant credit without throwing');

reset role;
select is(
  (select (state->>'growth')::int from loopkit.cards
     where program_id = '00000000-0000-0000-0000-0000000f0002' and phone = '+6591110003'),
  2, 'the host''s plant card state reflects the TS-engine-computed state');

-- A second finish attempt on the same reservation must be a no-op — proves
-- the deferred non-stamp path can't double-credit either.
set local role anon;
select lives_ok(
  $$ select * from loopkit.apply_referral_credit(
       '00000000-0000-0000-0000-0000000f1002', '+6591139001',
       '{"growth": 99, "last_visit_at": null, "blooms": 0, "bloomed": false}'::jsonb,
       'visit', '{"won": false}'::jsonb) $$,
  'a repeated finish call does not throw');

reset role;
select is(
  (select (state->>'growth')::int from loopkit.cards
     where program_id = '00000000-0000-0000-0000-0000000f0002' and phone = '+6591110003'),
  2, 'a repeated finish call does not overwrite the already-credited state');

-- ── Birthday self-entry + per-program bonus stamp (0041) ──────────────────
-- Two new stamp programs for Vendor A: one opted into the birthday bonus,
-- one not, so the "not opted in" guard has real coverage too.
insert into loopkit.programs (id, vendor_id, type, name, stamps_required, reward_text, config, active)
values
  ('00000000-0000-0000-0000-100000000001', '00000000-0000-0000-0000-00000000000a', 'stamp', 'A Birthday Club', 10, 'Free coffee',
   '{"stamps_required": 10, "reward_text": "Free coffee", "variant": "dots", "points_per_visit": 1}'::jsonb, true),
  ('00000000-0000-0000-0000-100000000002', '00000000-0000-0000-0000-00000000000a', 'stamp', 'A No-Bonus Club', 10, 'Free tea',
   '{"stamps_required": 10, "reward_text": "Free tea", "variant": "dots", "points_per_visit": 1}'::jsonb, true);
update loopkit.programs set birthday_bonus_enabled = true
  where id = '00000000-0000-0000-0000-100000000001';

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from loopkit.add_stamp('00000000-0000-0000-0000-100000000001', '+6590000001') $$,
  'A can stamp a new customer on the birthday-bonus program');

reset role;
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001'),
  1, 'no bonus fires before the customer has a birthday on file');

-- Anon self-entry (the card-view page's own new field): sets today's real
-- month/day, scoped to this exact (vendor, phone) pair — no separate
-- customer auth exists in this app, same trust model as vendor_join itself.
set local role anon;
select lives_ok(
  $$ select loopkit.set_customer_birthday(
       '00000000-0000-0000-0000-00000000000a', '+6590000001',
       extract(month from (now() at time zone 'Asia/Singapore'))::smallint,
       extract(day from (now() at time zone 'Asia/Singapore'))::smallint) $$,
  'anon can self-enter a birthday for their own phone at this vendor');

reset role;
select is(
  (select birth_month::int from loopkit.customers where vendor_id = '00000000-0000-0000-0000-00000000000a' and phone = '+6590000001'),
  extract(month from (now() at time zone 'Asia/Singapore'))::int,
  'the birthday was recorded');

-- Scoping: an unknown phone at this vendor is a safe no-op, not an error,
-- and creates no row — set_customer_birthday only ever UPDATEs an existing
-- customers row, per its own migration comment.
set local role anon;
select lives_ok(
  $$ select loopkit.set_customer_birthday(
       '00000000-0000-0000-0000-00000000000a', '+6590009999', 6::smallint, 15::smallint) $$,
  'set_customer_birthday on an unknown phone does not throw');

reset role;
select is_empty(
  $$ select 1 from loopkit.customers where vendor_id = '00000000-0000-0000-0000-00000000000a' and phone = '+6590009999' $$,
  'set_customer_birthday does not create a row for an unknown phone');

-- Next visit on the bonus-enabled program lands on the customer's real
-- birthday: this one add_stamp call grants the real stamp plus one bonus
-- stamp via the lazy check-on-next-visit trigger (1 -> 3, not 1 -> 2).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from loopkit.add_stamp('00000000-0000-0000-0000-100000000001', '+6590000001') $$,
  'A stamps the customer again, now on their birthday');

reset role;
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001'),
  3, 'the birthday visit grants the real stamp plus one bonus stamp');
select is(
  (select last_birthday_reward_year from loopkit.customers where vendor_id = '00000000-0000-0000-0000-00000000000a' and phone = '+6590000001'),
  extract(year from (now() at time zone 'Asia/Singapore'))::int,
  'last_birthday_reward_year is stamped for this year');

-- A second visit the same day must not grant a second bonus.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from loopkit.add_stamp('00000000-0000-0000-0000-100000000001', '+6590000001') $$,
  'A stamps the customer a third time, same day');

reset role;
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001'),
  4, 'a second same-day visit grants only the real stamp, no second bonus');

-- A program not opted into the bonus never grants it, even for the same
-- birthday customer, on the same day.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from loopkit.add_stamp('00000000-0000-0000-0000-100000000002', '+6590000001') $$,
  'A stamps the same customer on the non-bonus program');

reset role;
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000002' and phone = '+6590000001'),
  1, 'a program not opted into the birthday bonus grants only the real stamp');

-- ── Manual stamp adjustment (0042) ─────────────────────────────────────
-- Reuses A Birthday Club's card for +6590000001, at stamp_count = 4 from
-- the birthday-bonus block above.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from loopkit.adjust_stamp('00000000-0000-0000-0000-100000000001', '+6590000001', 2, 'Missed stamps from a system outage') $$,
  'A can adjust an existing customer''s stamp count with a reason');

reset role;
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001'),
  6, 'a +2 adjustment on a card at 4 stamps lands at 6');
-- created_at is frozen at transaction start for every statement in this
-- file (one pgTAP run = one Postgres transaction), so "order by created_at
-- desc limit 1" can't reliably pick the newest row among same-timestamp
-- ties — filter by kind='adjust' directly instead (unique at this point).
select is(
  (select count(*)::int from loopkit.stamp_events
     where card_id = (select id from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001')
       and kind = 'adjust'),
  1, 'the adjustment is logged as its own event kind, exactly once');
select is(
  (select payload->>'reason' from loopkit.stamp_events
     where card_id = (select id from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001')
       and kind = 'adjust'),
  'Missed stamps from a system outage', 'the reason is recorded on the event');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select * from loopkit.adjust_stamp('00000000-0000-0000-0000-100000000001', '+6590000001', -100, 'Large correction') $$,
  'a large negative adjustment does not throw');

reset role;
select is(
  (select stamp_count from loopkit.cards where program_id = '00000000-0000-0000-0000-100000000001' and phone = '+6590000001'),
  0, 'stamp_count is clamped at 0, never negative');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from loopkit.adjust_stamp('00000000-0000-0000-0000-100000000001', '+6590000001', 0, 'zero delta') $$,
  'delta must be nonzero', 'a zero delta is rejected');
select throws_ok(
  $$ select * from loopkit.adjust_stamp('00000000-0000-0000-0000-100000000001', '+6590000001', 1, '') $$,
  'reason is required', 'an empty reason is rejected');
select throws_ok(
  $$ select * from loopkit.adjust_stamp('00000000-0000-0000-0000-100000000001', '+6590009999', 1, 'no such customer') $$,
  'no card found for this customer', 'adjusting a nonexistent card throws, never creates one');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from loopkit.adjust_stamp('00000000-0000-0000-0000-100000000001', '+6590000001', 1, 'not mine') $$,
  'not authorized', 'vendor B cannot adjust vendor A''s program');

select * from finish();
rollback;
