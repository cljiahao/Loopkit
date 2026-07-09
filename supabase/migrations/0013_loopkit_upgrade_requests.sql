-- supabase/migrations/0013_loopkit_upgrade_requests.sql
-- Self-serve Pro upgrade requests. A vendor files one when they hit the
-- free-tier program cap; an admin reviews it on /admin/vendors and grants Pro,
-- which resolves the request. No payment integration — same manual-fulfillment
-- model qkit uses today (mirrors qkit.purchase_requests, but binary: loopkit
-- has one paid tier, not qkit's event/monthly split).

create table loopkit.upgrade_requests (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','resolved')),
  created_at timestamptz not null default now()
);

create index upgrade_requests_pending_idx
  on loopkit.upgrade_requests (status, created_at desc);

alter table loopkit.upgrade_requests enable row level security;

-- A vendor files their own request and can see it (to know it's pending).
create policy upgrade_requests_vendor_insert on loopkit.upgrade_requests
  for insert with check (vendor_id = (select auth.uid()));

create policy upgrade_requests_select on loopkit.upgrade_requests
  for select using (
    vendor_id = (select auth.uid()) or loopkit.is_admin((select auth.uid()))
  );

-- Admin resolves (the admin server action uses the service role, which
-- bypasses RLS anyway — this policy documents intent for any direct client use).
create policy upgrade_requests_admin_update on loopkit.upgrade_requests
  for update using (loopkit.is_admin((select auth.uid())));

grant select, insert on loopkit.upgrade_requests to authenticated;
grant all on loopkit.upgrade_requests to service_role;
