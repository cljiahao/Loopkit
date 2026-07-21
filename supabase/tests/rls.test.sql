-- loopkit/supabase/tests/rls.test.sql
-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
--
-- Scoped to the three highest-risk vendor-facing write paths (loopkit has 29
-- migrations; exhaustive coverage of every table is out of scope for this
-- pass — see docs/superpowers/specs/2026-07-22-cicd-hook-harness-parity-design.md
-- §3): loopkit.vendors (shared profile, for-all self policy), loopkit.upgrade_requests
-- (vendor-insert/select-own + admin-select-all), loopkit.feedback (self-insert-only).
-- Runs in ONE rolled-back transaction with inline fixtures (fixed UUIDs).

begin;
select plan(19);

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
   'admin-d@test.local');

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

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'loopkit.vendors'::regclass), 'RLS on vendors');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.upgrade_requests'::regclass), 'RLS on upgrade_requests');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.feedback'::regclass), 'RLS on feedback');

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

select * from finish();
rollback;
