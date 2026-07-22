# lib

## Purpose

Vitest unit tests for `src/lib/` domain logic — mostly pure-function tests;
several (`admin-data.test.ts`, `admin.test.ts`, `cards.test.ts`,
`rate-limit.test.ts`, `vendor.test.ts`) mock the Supabase server/service
client instead.

## Contents

- `activity.test.ts` — `mapActivityRow`: classifies a stamp/redeem/enroll event row into an activity feed entry
- `admin-data.test.ts` — `listProgramsOverview`/`listVendors`/`listPendingUpgradeRequests`/`platformTotals`/`recentActivity`/`getProgramDetail`: each function's happy path plus its error-throwing path, mocking `createServiceClient`'s `.from()` chain and `auth.admin.listUsers`
- `admin.test.ts` — `isAdmin`: true/false on presence/absence of an `admins` row; `requireAdmin`: returns `{user}` for a signed-in admin, 404s (via `next/navigation`'s `notFound()`) when signed out or signed in but not an admin
- `build-plant-config.test.ts` — `buildPlantConfig`: derives five named growth stages from a single visits-to-bloom knob
- `build-program-fields.test.ts` — `buildProgramFields`: per-type (stamp/lucky/plant/wheel/scratch) program field construction
- `cards.test.ts` — `listCards`: fetches a vendor's cards for one program, optional phone search, mocks `createServerClient`
- `customers.test.ts` — `aggregateCustomers`: merges one customer's cards across programs into a single row
- `engine/`
- `expiry.test.ts` — `isCardExpired`: day-elapsed check against a card's cycle start and the program's `expiry_days`
- `loyalty.test.ts` — `rewardReady`: stamp count vs. requirement check
- `metrics.test.ts` — `computeLoopkitMetrics`: maps programs/cards/stamp events onto merqo's metrics shape
- `phone.test.ts` — `normalizePhone`: SG mobile formats normalize to E.164 `+65…`
- `program-access.test.ts` — `currentProgram`/`canCreateProgram`/`getEntitlement`: free/Pro program-count gating
- `program-health.test.ts` — `programHealth`: "new"/"quiet"/"active" triage from customer count, age, last activity
- `program.test.ts` — `programInputSchema`/`canPrepProgram`/`getEntitlement`: program validation and tier caps
- `qr.test.ts` — `qrSvg`: renders a valid `<svg>…</svg>` string for a token
- `rate-limit.test.ts` — `allowRequest`: fail-open when Upstash env vars are absent, uses the configured limiter keyed `bucket:ip` when set, falls back to `bucket:unknown` when `x-forwarded-for` is missing — each case re-imports the module after `vi.resetModules()` since the limiter is memoized at module scope
- `save-program-schema.test.ts` — `saveProgramSchema`: discriminated-union Zod validation per program type
- `stats.test.ts` — `classifyActivity`/`bucketVisitsByDay`/`computeCardStats`/`pctChange`/`avgDaysBetweenVisits`: stats aggregation pipeline; `countExpiredVouchers`: queries `reward_vouchers` scoped to the given programs/status/30-day window, returns 0 without querying when there are no programs, throws on a query error
- `vendor.test.ts` — `stallNameSchema` validation; `saveStallName`/`getVendorProfile`: both mock `@/lib/merqo-vendor-profile`, asserting the shared `merqo.vendor_profile` row (not local `vendors.name`) is the source of truth, the seed/fallback precedence between a local row, a passed-in `fallbackName`, and a merqo read failure
- `vouchers.test.ts` — `oldestActiveVoucher`/`isPastExpiry`/`daysUntilExpiry`/`countJustExpired`: pure derivations over `reward_vouchers` rows

## Parent

[test](../README.md)
