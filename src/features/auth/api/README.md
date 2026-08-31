# api

## Purpose

Server-side auth logic: the vendor-auth guard.

## Contents

- `require-vendor.ts` — `requireVendor`: reads the current Supabase session
  and returns `{ user }`; redirects unauthenticated requests to `/login`
  (unlike merqo's identity-catalog-backed `requireVendor`, loopkit has no
  vendor catalog to 404 against)

## Parent

[auth](../README.md)
