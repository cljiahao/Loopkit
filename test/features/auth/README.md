# auth

## Purpose

Vitest tests for `src/features/auth/` — Supabase clients, `requireVendor`,
and the legal-acceptance gate it calls, mocked via `vi.mock`/`vi.hoisted`.

## Contents

- `require-vendor.test.ts` — `requireVendor`: returns `{ user }` without
  redirecting when a session exists, redirects to `/login` (via a mock that
  throws, matching real `next/navigation` semantics) and skips the legal
  gate entirely when unauthenticated, passes the signed-in vendor's email to
  `requireCurrentLegalAcceptance` (`@/lib/legal-gate`), and propagates its
  `/legal/accept` redirect when the vendor's acceptance is stale

## Parent

[features](../README.md)
