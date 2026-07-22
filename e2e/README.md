# e2e

## Purpose

Playwright end-to-end smoke tests — runnable with only `pnpm dev` +
`playwright install`, no Supabase provisioning required.

## Contents

- `route-protection.spec.ts` — signed-out route protection: `/dashboard`, `/dashboard/customers`, and `/setup` redirect to `/login`; `/admin` 404s rather than revealing the route exists; `/c` without `?v=` and `/earn` without `?order=` render their no-DB-call fallback copy instead of attempting a lookup. Like `smoke.spec.ts`, runnable without Supabase provisioning — middleware's `getUser()` resolves `user: null` locally with no session cookie, so these gates fire without a live DB.
- `smoke.spec.ts` — public smoke: the landing page renders its hero heading and "Get started" link; `/login` renders its "Continue with Google" button

## Parent

[loopkit](../README.md)
