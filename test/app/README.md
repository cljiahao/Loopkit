# app

## Purpose

Vitest tests for `src/app/` Server Actions, layouts, and client components —
Supabase clients and `@/lib` collaborators mocked via `vi.mock`/`vi.hoisted`.

## Contents

- `change-type-action.test.ts` — `changeTypeAction`: free-tier prep-and-activate vs. Pro scheduled-cutover program type migration
- `dashboard-actions.test.ts` — misc `src/app/dashboard/actions.ts` Server Actions covering program/card RPC calls
- `dashboard-nav.test.tsx` — jsdom: `DashboardNav` renders the active route highlighted based on `usePathname`; the avatar trigger's initials (stall name vs. email-derived fallback) and its visible stall-name label (or "Account" fallback) beside the avatar; the account-dropdown label shows the stall name (or "Your stall" fallback) with a static "Vendor account" subtitle, never the vendor's email
- `prep-program-action.test.ts` — `prepProgramAction`: creates an inactive replacement program and redirects to edit it, sends `p_reward_expiry_days: null` for a type that doesn't support it, blocks a free vendor already at the live-in-play prep cap, maps a DB `insufficient_privilege` (42501) error to the upsell message, returns a generic error for other RPC failures, and rejects invalid input without calling the RPC
- `preview-state.test.ts` — `buildPreviewProgress`/`buildPreviewProgram`/`buildInitialCard`: `/setup` live-preview state builders; asserts the lucky view is the new `kind: "lucky"` shape, not the legacy dots counter
- `profile-actions.test.ts` — vendor `/profile` action: `saveStallName` call after `requireVendor`
- `request-upgrade-action.test.ts` — self-serve Pro upgrade request action: dedupes an already-pending request, inserts a new one
- `resolve-token-action.test.ts` — `resolveTokenAction`: resolves a card token via RPC after `requireVendor`
- `resolve-upgrade-request-action.test.ts` — admin action resolving an upgrade request: grants Pro (upsert), marks the request resolved
- `save-program-action.test.ts` — `saveProgramAction`: create/update dispatch, free/Pro entitlement gate, RPC call shape
- `serve-customer.test.tsx` — jsdom: the `/c` customer card view — stamp/record-visit/lookup/redeem-plant flows end to end
- `set-vendor-pro-action.test.ts` — admin action toggling a vendor's Pro flag: upsert/delete on `vendor_pro`

## Parent

[test](../README.md)
