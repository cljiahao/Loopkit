# lib

## Purpose

Vitest unit tests for `src/lib/` domain logic — mostly pure-function tests;
several (`admin-data.test.ts`, `admin.test.ts`, `cards.test.ts`,
`vendor.test.ts`) mock the Supabase server/service client instead.

## Contents

- `activity.test.ts` — `mapActivityRow`: classifies a stamp/redeem/enroll/adjust event row into an activity feed entry, including the `'adjust'` kind's `"Adjusted ±N"` label and its `reason` from the event payload
- `admin-audit.test.ts` — `recordAudit`: inserts an `admin_audit`-shaped row via the service-role client (including a `null` `target_id`), and logs-but-swallows an insert error rather than throwing
- `admin-data.test.ts` — `listProgramsOverview`/`listVendors`/`listPendingUpgradeRequests`/`platformTotals`/`recentActivity`/`getProgramDetail`: each function's happy path plus its error-throwing path, mocking `createServiceClient`'s `.from()` chain and `auth.admin.listUsers`
- `admin.test.ts` — `isAdmin`: true/false on presence/absence of an `admins` row; `requireAdmin`: returns `{user}` for a signed-in admin, 404s (via `next/navigation`'s `notFound()`) when signed out or signed in but not an admin
- `build-plant-config.test.ts` — `buildPlantConfig`: derives five named growth stages from a single visits-to-bloom knob
- `build-program-fields.test.ts` — `buildProgramFields`: per-type (stamp/lucky/plant/wheel/scratch) program field construction, including a vendor-picked segment `color` threading through to the built config (unset segments leave it unset); the cup-variant stage-name assertion expects "Half Full" at the 50% threshold, not "Quarter Full"
- `cards.test.ts` — `listCards`: fetches a vendor's cards for one program, optional phone search, mocks `createServerClient`; `activeCardCountsByProgram`: counts cards touched in the last 30 days per program (empty result for no programs, tallies by `program_id`), backing the Counter's busiest-program default
- `customer-segments.test.ts` — `customerSegments`/`filterBySegment`/`sortCustomers`/`segmentCounts` at the day boundaries (new is `>=` 7 days, lapsed is `<` 30 days, half-open), progress sort with `null` gaps last, no-mutation, and `parseSegment`/`parseSort` defaulting on unknown input
- `customers.test.ts` — `aggregateCustomers`: merges one customer's cards across programs into a single row, and derives `rewardReady`, `bestGap`, `firstSeenAt`, and the most-recent card's program
- `engine/`
- `expiry.test.ts` — `isCardExpired`: day-elapsed check against a card's cycle start and the program's `expiry_days`
- `loyalty.test.ts` — `rewardReady`: stamp count vs. requirement check
- `merqo-auth.test.ts` — `provisionBearerOk`: true on the correct `MERQO_PROVISION_SECRET` bearer, false when missing/unset, false when the `MERQO_METRICS_SECRET` value is sent instead — the two secrets must not be interchangeable; plus `bearerOk(request, envVarName)`, the shared helper the 3 `src/app/api/merqo/*` routes now call instead of each defining their own copy
- `metrics.test.ts` — `computeLoopkitMetrics`: maps programs/cards/stamp events onto merqo's metrics shape
- `money.test.ts` — `dollarsToCents` (rounding, incl. the `1.005 -> 100` IEEE-754 case), `centsToDollars`, `formatSgd` (`"$1.20"`)
- `phone.test.ts` — `normalizePhone`: SG mobile formats normalize to E.164 `+65…`; `maskPhone`: keeps the first 4 local digits and masks the rest, returns a too-short input unchanged
- `program-access.test.ts` — `currentProgram`/`canCreateProgram`/`getEntitlement`: free/Pro program-count gating; its `Program` fixture includes `birthday_bonus_enabled` (migration `0041`)
- `program-config.test.ts` — `segmentWinPercent`/`overallWinPercent`: each segment's rounded win-% share of total weight, the reward-only overall percentage, and the zero-total-weight edge case for both
- `program-health.test.ts` — `programHealth`: "new"/"quiet"/"active" triage from customer count, age, last activity
- `program.test.ts` — `programInputSchema`/`canPrepProgram`/`getEntitlement`: program validation and tier caps; also covers `saveProgramSchema`/`buildProgramFields`'s stamp branch for `stamp_mark_mode`/`stamp_mark_preset` and the newer `stamp_style`/`stamp_color` (5 `StampVisualStyle`s, a `#rrggbb`-only hex), each carried into `config` unchanged or left `undefined` when blank; plus the Points Club `redemption_mode`/`catalog`/`offset_rate_points`/`offset_rate_dollars` fields — catalog min-length rejection, per-item fresh ids, and `stampsRequired`'s catalog/offset/neither fallback; plus the stamp variant's optional `reward_cost_dollars` (coerced, blank -> undefined, negatives rejected)
- `program-edit-impact.test.ts` — `isProgressAffecting` (stamps or trimmed reward-text change; whitespace-only reward change is not), `describeEditImpact` (singular/plural intro, goal up vs down wording, quoted new reward text, stable line order, lines still returned at count 0)
- `qr.test.ts` — `qrSvg`: renders a valid `<svg>…</svg>` string for a token
- `save-program-schema.test.ts` — `saveProgramSchema`: discriminated-union Zod validation per program type
- `stats.test.ts` — `classifyActivity`/`bucketVisitsByDay`/`computeCardStats`/`pctChange`/`avgDaysBetweenVisits`: stats aggregation pipeline; `returnRate90d`/`regularsGoneQuiet`/`cardsNearReward`: the vendor-dashboard Overview helpers, each with its half-open window edges (exactly-90d counts as active, exactly-40d quiet vs exactly-21d not) and unparseable-timestamp skip covered; `sgtMonthStart`/`countRegulars`/`countNewThisMonth`: the SGT month boundary, the both-conditions "Regular" rule, and the created-since-the-1st new-card count; `getVendorOverviewInputs`: returns empty arrays without querying when there are no programs, classifies the fetched events and passes cards through; `countExpiredVouchers`: queries `reward_vouchers` scoped to the given programs/status/30-day window, returns 0 without querying when there are no programs, throws on a query error
- `vendor.test.ts` — `stallNameSchema` validation; `saveStallName`/`getVendorProfile`: both mock `@/lib/merqo-vendor-profile`, asserting the shared `merqo.vendor_profile` row (not local `vendors.name`) is the source of truth, the seed/fallback precedence between a local row, a passed-in `fallbackName`, and a merqo read failure
- `vouchers.test.ts` — `oldestActiveVoucher`/`isPastExpiry`/`daysUntilExpiry`/`countJustExpired`: pure derivations over `reward_vouchers` rows

## Parent

[test](../README.md)
