-- loopkit.vendors: a row per vendor, created lazily (no onboarding step
-- exists today — a vendor's first save via /profile is their first write
-- here). Mirrors vendor_pro's shape (0007_loopkit_multiprogram.sql):
-- vendor_id as primary key referencing auth.users, not a surrogate id.
--
-- phone is included even though this plan never writes it, because the
-- vendor-phone-onboarding spec (docs/superpowers/specs/2026-07-11-vendor-
-- phone-onboarding-design.md) needs the same table with the same primary
-- key shape and explicitly consumes this migration rather than redefining
-- it. Do not let a later migration re-create loopkit.vendors.
create table loopkit.vendors (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loopkit.vendors enable row level security;

create policy vendors_own on loopkit.vendors
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

grant select, insert, update on loopkit.vendors to authenticated;
grant all on loopkit.vendors to service_role;

-- Public-read bucket for vendor profile photos. Public because the stamp
-- card / /c pages are unauthenticated and may eventually show a vendor
-- photo to customers — no reason to block that later with a private bucket
-- now.
insert into storage.buckets (id, name, public)
values ('vendor-images', 'vendor-images', true)
on conflict (id) do nothing;

create policy vendor_images_public_read
  on storage.objects for select
  using (bucket_id = 'vendor-images');

create policy vendor_images_vendor_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy vendor_images_vendor_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy vendor_images_vendor_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
