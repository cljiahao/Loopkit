# auth

## Purpose

Vitest tests for `src/features/auth/` — Supabase clients and
`requireVendor` mocked via `vi.mock`/`vi.hoisted`.

## Contents

- `require-vendor.test.ts` — `requireVendor`: returns `{ user }` without
  redirecting when a session exists, redirects to `/login` when
  unauthenticated

## Parent

[features](../README.md)
