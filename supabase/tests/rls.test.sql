-- loopkit/supabase/tests/rls.test.sql
-- RLS cross-vendor isolation — pgTAP, run with `supabase test db`.
--
-- Scoped to the highest-risk vendor-facing write paths (loopkit has 36
-- migrations; exhaustive coverage of every table is out of scope for this
-- pass — see docs/superpowers/specs/2026-07-22-cicd-hook-harness-parity-design.md
-- §3): loopkit.vendors (shared profile, for-all self policy), loopkit.upgrade_requests
-- (vendor-insert/select-own + admin-select-all), loopkit.feedback (self-insert-only),
-- loopkit.vendor_telegram/loopkit.telegram_link_tokens (own-row select only /
-- zero client access at all — migration 0036).
-- Runs in ONE rolled-back transaction with inline fixtures (fixed UUIDs).

begin;
select plan(38);

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

insert into loopkit.vendor_telegram (vendor_id, chat_id)
values
  ('00000000-0000-0000-0000-00000000000a', 111),
  ('00000000-0000-0000-0000-00000000000b', 222);

-- ── RLS is actually enabled on every protected table ─────────────────────────
select ok((select relrowsecurity from pg_class where oid = 'loopkit.vendors'::regclass), 'RLS on vendors');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.upgrade_requests'::regclass), 'RLS on upgrade_requests');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.feedback'::regclass), 'RLS on feedback');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.vendor_telegram'::regclass), 'RLS on vendor_telegram');
select ok((select relrowsecurity from pg_class where oid = 'loopkit.telegram_link_tokens'::regclass), 'RLS on telegram_link_tokens');

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

-- vendor_telegram: own-row select only (migration 0036) — A reads its own
-- linked chat, not B's, and has no write grant at all (writes are
-- service-role only: the webhook route on link, the settings page's
-- disconnect action).
select isnt_empty(
  $$ select 1 from loopkit.vendor_telegram where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  'A reads its own vendor_telegram row');
select is_empty(
  $$ select 1 from loopkit.vendor_telegram where vendor_id = '00000000-0000-0000-0000-00000000000b' $$,
  'A cannot read B''s vendor_telegram row');
select throws_ok(
  $$ insert into loopkit.vendor_telegram (vendor_id, chat_id) values ('00000000-0000-0000-0000-00000000000a', 333) $$,
  '42501',
  null,
  'A cannot insert into vendor_telegram (no client write grant)');
select throws_ok(
  $$ update loopkit.vendor_telegram set chat_id = 999 where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'A cannot update vendor_telegram (no client write grant)');
select throws_ok(
  $$ delete from loopkit.vendor_telegram where vendor_id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'A cannot delete from vendor_telegram (no client write grant)');

-- telegram_link_tokens: RLS enabled, zero policies, zero grants to
-- authenticated at all (migration 0036) — even a SELECT of the caller's
-- own would-be row fails on the table-level privilege check, before RLS
-- ever runs. Service-role only, end to end.
select throws_ok(
  $$ select 1 from loopkit.telegram_link_tokens $$,
  '42501',
  null,
  'A cannot read telegram_link_tokens (no SELECT grant at all)');
select throws_ok(
  $$ insert into loopkit.telegram_link_tokens (token, vendor_id, expires_at) values ('tok', '00000000-0000-0000-0000-00000000000a', now() + interval '30 minutes') $$,
  '42501',
  null,
  'A cannot insert into telegram_link_tokens (no INSERT grant at all)');

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
  $$ select 1 from loopkit.vendor_telegram $$,
  '42501',
  null,
  'anon cannot read vendor_telegram (no SELECT grant)');
select throws_ok(
  $$ select 1 from loopkit.telegram_link_tokens $$,
  '42501',
  null,
  'anon cannot read telegram_link_tokens (no SELECT grant)');

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

select * from finish();
rollback;
