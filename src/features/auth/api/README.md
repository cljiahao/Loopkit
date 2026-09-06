# api

## Purpose

Server-side auth logic: the vendor-auth guard.

## Contents

- `require-vendor.ts` — `requireVendor`: reads the current Supabase session
  and returns `{ user }`; redirects unauthenticated requests to `/login`
  (unlike merqo's identity-catalog-backed `requireVendor`, loopkit has no
  vendor catalog to 404 against), then gates on `requireCurrentLegalAcceptance`
  (`@/lib/legal-gate`), redirecting to `/legal/accept` when the vendor's
  terms/privacy acceptance is stale — loopkit's single gate entry point, so
  the check lives here once rather than duplicated per call site

## Parent

[auth](../README.md)
