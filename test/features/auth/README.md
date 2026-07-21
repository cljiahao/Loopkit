# auth

## Purpose

Vitest tests for `src/features/auth/` — Supabase clients and
`requireVendor` mocked via `vi.mock`/`vi.hoisted`.

## Contents

- `require-vendor.test.ts` — `requireVendor`: returns `{ user }` without
  redirecting when a session exists, redirects to `/login` when
  unauthenticated
- `vendor-onboard-action.test.ts` — `vendorPhoneOnboardAction`: rejects an
  empty name or invalid phone without writing, upserts a normalized phone
  locally and the trimmed name to the shared `merqo.vendor_profile` row (via
  `upsertVendorProfile`) on the happy path, allows a duplicate name/phone
  already used by another vendor (no uniqueness check), surfaces a Supabase
  error or a shared-vendor-profile write failure without throwing

## Parent

[features](../README.md)
