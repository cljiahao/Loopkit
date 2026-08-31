# lib

## Purpose

Domain logic and infrastructure for loopkit: program/card/customer CRUD,
the stamp/points/lucky-reward engine dispatch, stats, admin aggregation,
Supabase clients, and the HTTP contract with merqo (metrics + vendor
profile/status).

## Contents

- `action-result.ts` — `ActionResult<T>`: discriminated `{success:true}&T | {success:false,error}` return type shared by Server Actions
- `activity.ts` — `mapActivityRow` (pure event→row classifier, including the `'adjust'` kind's `"Adjusted ±N"` label and its `reason` from the event payload) and `listActivity` (paginated, filterable vendor activity feed across programs, optional `phone` narrowing for a single customer's history, fetches `limit+1` rows to detect a next page)
- `admin-audit.ts` — `recordAudit(actorId, action, targetId, detail)`: best-effort append to `loopkit.admin_audit` (migration `0003`) via the service-role client, logging (never throwing) on an insert failure; shared by every `/admin` Server Action (`src/app/admin/actions.ts`) and `POST /api/merqo/vendor-provision`, which has no signed-in admin and instead passes the provisioned vendor's own id as `actorId` with `detail.actor: "merqo_system"` as a documented sentinel
- `admin-data.ts` — service-role reads for the `/admin` console: `listProgramsOverview`, `listVendors`, `listPendingUpgradeRequests`, `platformTotals`, `recentActivity`, `getProgramDetail`, `listAdminAudit`; resolves vendor/actor email via `listAllUsers()` (`list-all-users.ts`)
- `admin.ts` — `isAdmin`/`requireAdmin`: admin membership check via the `admins` table (RLS-gated) and a 404-on-fail gate for `/admin` routes and actions
- `brand-icon.test.ts` — unit tests for `brandIcon`: renders the "L" letter on the raspberry background/blush foreground, and scales `fontSize`/`borderRadius` proportionally to the requested size
- `brand-icon.tsx` — `brandIcon(size)`: the shared "L" app-mark construction (wax-red rounded square, blush letter) rendered by `src/app/icon.tsx`/`apple-icon.tsx` via `next/og`'s `ImageResponse`; `BRAND_RASPBERRY`/`BRAND_BLUSH` hex constants approximate the current "Sealing Wax" theme's OKLCH tokens (constant names kept from the prior "Raspberry-Rose Punch & Gold" theme rather than churned again — renamed from `BRAND_MULBERRY` when the theme first moved off plum/magenta; the cross-kit standard doc's "Source token" table still says "Mulberry & Gold," now stale), same shared formula as every other kit's brand-icon (`docs/business/2026-07-21-brand-icon-family-standard.md`)
- `cards.ts` — `listCards`: the signed-in vendor's cards for one program, optional phone search, most-recently-updated first
- `customers.ts` — `aggregateCustomers` (pure phone-keyed merge of customers+cards across programs), `listVendorCustomers` (impure shell, RLS-scoped), and `getCustomerDetail(phone)` (one customer's name/last-seen plus every card they hold across the vendor's own programs — backs `/dashboard/customers/[phone]`)
- `engine/`
- `expiry.ts` — `isCardExpired`: pure day-elapsed check against a card's cycle start and the program's `expiry_days`
- `format.ts` — `formatSgtDateTime`/`formatSgtDate`/`sgtDateKey`: Asia/Singapore-pinned timestamp formatters and a calendar-day grouping key; `formatShortDate` renders a `"YYYY-MM-DD"` date key as e.g. "10 Jul" (UTC-formatted, since the key is already an SGT calendar day) for the stats page's `VisitsChart` axis labels
- `image-resize.ts` — `resizeToWebp`: browser-only Canvas resize + WebP re-encode before upload, falls back to the original file on decode/encode failure
- `image-upload-adapter.test.ts` — vitest tests: `uploadLoopkitImage` uploads to the given bucket/path and returns the public URL, throws when the storage upload fails
- `image-upload-adapter.ts` — `uploadLoopkitImage`: `@merqo/ui`'s `ImageUploader.onUpload` implementation, wrapping the app's own Supabase Storage upload call (a plain function, not a factory — `@merqo/ui` builds the object path internally from `pathPrefix`, so there's nothing vendor-scoped left to bind at creation time)
- `list-all-users.ts` — `listAllUsers`: paginates `supabase.auth.admin.listUsers()` (1000/page) to completion, mirroring a single call's `{data, error}` shape; shared by `admin-data.ts` and the `vendor-status` route, both of which independently made the same page-1-only mistake before this was extracted
- `loyalty.ts` — `rewardReady`: one-line pure check that a stamp count has met the program's requirement
- `merqo-customer-notify.ts` — `notifyCustomerByPhone(vendorId, phone, message)`: fire-and-forget `POST ${MERQO_BASE_URL}/api/merqo/notify-customer` in merqo's `phone` lookup mode (never `notify_ref` — loopkit's redemption event has no prior connect-token round), bearer `MERQO_CUSTOMER_SECRET`, `AbortSignal.timeout(3000)`; no-ops when either env var is unset, and catches/logs (never throws) a non-2xx response, a timeout, or a network error. `notifyVendor(vendorId, message)` is a sibling export, same shape, posting to `POST ${MERQO_BASE_URL}/api/merqo/notify-vendor` — the Phase A2 replacement for loopkit's own retired Telegram bot, called by `redeemAction`'s vendor alert (test: `merqo-customer-notify.test.ts`)
- `merqo-auth.ts` — `bearerOk(request, envVarName)`: shared constant-time Bearer-token check against a named env var, used by every `/api/merqo/*` route handler (`MERQO_METRICS_SECRET` for the read/reporting routes, `MERQO_PROVISION_SECRET` for the write route); `provisionBearerOk` is a thin wrapper pinned to `MERQO_PROVISION_SECRET` (test: `test/lib/merqo-auth.test.ts`)
- `merqo-rpc.ts` — `callMerqoRpc<TArgs, TReturn, Db, SchemaName>`: shared `.schema("merqo").rpc(...)` call plumbing (cast the caller's typed client across schemas, call, throw with RPC name + Postgres error message on failure) used by `merqo-support.ts`, `merqo-vendor-feedback.ts`, and `merqo-vendor-profile.ts` — each still owns its own Args/Return type mirror and public function signature, only the RPC-call mechanics are shared
- `merqo-vendor-profile.test.ts` — vitest tests for `getOrCreateVendorProfile`: asserts the `.schema("merqo").rpc(...)` call shape and that a Postgres error is rethrown with context
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`: hand-written mirror of merqo's cross-schema RPC contract, generic over the caller's own `Database`/schema so `"loopkit"`-scoped clients type-check, calls through `merqo-rpc.ts`'s `callMerqoRpc` for the cross-schema RPC; `upsertVendorProfile` is the write path used by the profile page's social-links save
- `merqo-vendor-feedback.ts` — `submitVendorFeedback`: hand-written mirror of merqo's cross-schema `submit_vendor_feedback` RPC contract, generic over the caller's own `Database`/schema so `"loopkit"`-scoped clients type-check; calls through `merqo-rpc.ts`'s `callMerqoRpc`; the write path used by `actions/feedback.ts` in place of a local insert
- `merqo-support.ts` — `submitSupportMessage`: hand-written mirror of merqo's cross-schema `submit_support_message` RPC contract, generic over the caller's own `Database`/schema; calls through `merqo-rpc.ts`'s `callMerqoRpc`; the write path used by `actions/support.ts` for the Get-help Sheet.
- `merqo-vendor-status.test.ts` — vitest tests for `resolveVendorStatus`: active/free, active/pro, case-insensitive email match, inactive-no-user, inactive-no-program cases
- `merqo-vendor-status.ts` — `resolveVendorStatus`: pure lookup mapping an email + auth-user list + program/pro vendor-id lists to `{active, plan}`, since neither `programs` nor `vendor_pro` carries an email column
- `metrics.ts` — `isWonVisit` (pure) and `computeLoopkitMetrics`: maps loopkit's stamp-card domain onto merqo's qkit-shaped metrics payload (programs→vendors, stamp/visit events→orders, no revenue/GMV in v1)
- `merqo-vendor-activity.ts` — `computeVendorActivity`: pure, rolls up one vendor's programs/cards/stamp events into the `{active, plan, status, metrics, lastActivityAt}` shape `GET /api/merqo/vendor-activity` returns; `status` is always `null` (loopkit has no per-vendor health concept yet)
- `phone.ts` — `normalizePhone`: validates an SG mobile number (starts 3/6/8/9, 8 digits) and returns E.164 `+65…`
- `program-config.ts` — pure, server-import-free program config builders: `buildPlantConfig` (5-stage growth/decay config from a single visits-to-bloom knob, stage names "Empty/Sip/Half Full/Nearly Full/Full" for the cup variant — the 50%-threshold stage was previously mislabeled "Quarter Full") and `buildChanceConfig` (wheel/scratch segment config with fresh per-segment ids, threading each segment's optional vendor-picked `color` through); kept free of `next/headers` so client bundles (`preview-state.ts`) can import it directly; `segmentWinPercent`/`overallWinPercent` (pure, same weight math `chance.ts`'s `pickSegment` uses internally) surface a segment pool's actual win odds as percentages for the Basics segment editor; `segmentInputSchema` validates an optional `color` as a `#rrggbb` hex string
- `program-health.ts` — `programHealth`: pure triage label ("new"/"quiet"/"active") from a program's customer count, age, and last-activity timestamp
- `pricing.ts` — `PricingConfig`, `DEFAULT_PRICING`, `getPricing()`: reads the single-row, admin-tunable `pricing` table (public-select RLS), falling back to a zeroed config only if the row is ever unreadable.
- `program.ts` — `Program`/`SaveProgramInput` types, `programInputSchema`/`saveProgramSchema` (discriminated-union Zod schema per program type — the stamp variant's `birthday_bonus_enabled` is the only per-type-plus-edit-only field, wired by `src/app/setup/actions.ts`'s `updateExistingProgram`, not `createNewProgram`'s `create_program` RPC), `buildProgramFields`, `listPrograms`/`getProgramById`/`currentProgram`, `Entitlement`/`getEntitlement`/`canCreateProgram`/`canPrepProgram` (free vs. pro tier caps), `isPro`, `applyDueCutovers` (lazy scheduled-retirement cutover), `getProgram` (transitional single-program shim)
- `qr.ts` — `qrSvg`: renders a QR code as an SVG string via the `qrcode` package
- `referrals.ts` — `referralLink` (pure `/c?v=<vendorId>&ref=<code>` builder) and `listReferralHosts` (impure shell, RLS-scoped read of the signed-in vendor's `loopkit.referral_hosts` rows, most recent first) backing `src/app/dashboard/referrals/`
- `schemas.ts` — `loginSchema`/`LoginInput` (email format + non-empty password) backing `LoginForm`'s react-hook-form resolver; `supportMessageSchema`/`SupportMessageInput` (category enum + 1-2000 char body) and `SUPPORT_CATEGORY_LABELS`, the shared Get-help validation/labels used by `actions/support.ts` and `dashboard-nav.tsx`'s `@merqo/ui` `HelpSheet` wiring, plus `pricingFormSchema`/`PricingFormInput`/`MAX_MONEY_CENTS` for the admin pricing form
- `stamp-mark.ts` — `resolveStampMark(view, vendorAvatarUrl)`: pure resolver converting the engine's `ProgressView` dots variant (vendor's chosen mark mode/preset) and vendor avatar URL into the concrete `StampMark` value `StampDots` renders; shared by `/c` and `/setup` live preview so both resolve marks identically
- `stats.ts` — `classifyActivity`/`pctChange`/`bucketVisitsByDay`/`avgDaysBetweenVisits`/`computeCardStats` (pure aggregation pipeline) plus `getProgramStats`/`getVendorStats` (impure shells fetching cards+stamp_events) and `countExpiredVouchers` (impure shell counting `reward_vouchers` that expired in the last 30 days — a separately-sourced tile added alongside, not replacing, `rewards30d`/`redemptionRate` per `docs/superpowers/specs/2026-07-16-reward-voucher-ledger-design.md`) — powers the vendor stats dashboard. `mechanicLabel`/`computeMechanicBreakdown` (pure) plus `getVendorMechanicBreakdown` (impure shell) group the same cards/events by which named mechanic (Stamp/Growth/Chance Card) a program's engine `type` belongs to — "Points" is a `stamp.ts` render variant, not a distinct DB type, so it's grouped under Stamp rather than guessed at from config.
- `supabase/`
- `tour-prefs.test.ts` — vitest tests for `stampTourSeen`: upserts `tour_seen_at` scoped to `vendor_id` (including a vendor with no `vendors` row yet), and logs (never throws) on an upsert error
- `tour-prefs.ts` — `stampTourSeen(supabase, vendorId)`: the single upsert (`vendors.tour_seen_at = now()`, scoped to `vendor_id = auth.uid()` via the `vendors_own` RLS policy) shared by `src/app/api/tour-seen/route.ts`'s client-fired `POST` and `src/app/dashboard/layout.tsx`'s own durable server-render stamp — best-effort, logs (never throws) on failure. Upsert, not update: `loopkit.vendors` is created lazily, so a vendor who never visited `/profile` has no row yet and an update would silently persist nothing
- `types.ts` — `Json` type, `SocialLinks` (shape of the shared `merqo.vendor_profile.social_links` JSONB column — not part of the `loopkit` schema), and the hand-written `Database["loopkit"]` interface (Row/Insert/Update per table, including `vendor_notify_settings`), a manual mirror of `supabase/migrations/` kept in sync by hand (no live DB codegen yet)
- `utils.ts` — `cn` (clsx+tailwind-merge), `MS_PER_HOUR`/`MS_PER_DAY` constants, `formatPrice`, `centsToDollarString`, `genOrderNumber`, `parseDollarsToCents`, `orderHasPricing`, `count`, `formatOptions` — general-purpose formatting/shared helpers
- `vendor.ts` — `stallNameSchema`, `getVendorProfile`/`saveStallName`: the vendor's stall name, read from and written to the shared `merqo.vendor_profile` table (local `vendors.name` is only a lazy-create seed value)
- `vouchers.ts` — `listCardVouchers`/`oldestActiveVoucher`/`isPastExpiry`/`daysUntilExpiry`/`countJustExpired` (pure reads/derivations) and `expireStaleVouchers`/`grantRewardVoucher`/`redeemOldestVoucher` (RPC wrappers) over `reward_vouchers`, the reward-claim ledger backing Stamp/Plant/Wheel/Scratch/Lucky rewards

## Connectivity

`engine/` holds the pure per-program-type strategy implementations
(`stamp`/`lucky`/`plant`/`chance`), dispatched via `engine/index.ts`'s
`applyVisit`/`getProgress`; `program.ts` and `program-config.ts` build the
`config` blobs those strategies consume. `supabase/` provides the three
client factories (`client.ts` browser, `server.ts` cookie-backed + service,
`middleware.ts` session refresh) that every other file in this folder
depends on for reads/writes, all pinned to `db: { schema: "loopkit" }`
matching `types.ts`'s `Database` shape. `activity.ts`, `cards.ts`,
`customers.ts`, `stats.ts`, and `program.ts` are the vendor-facing RLS-scoped
data layer; `admin.ts`/`admin-data.ts` mirror the same tables via the
service-role client for the cross-vendor `/admin` console.
`list-all-users.ts` is shared by `admin-data.ts` and the `vendor-status`
route handler, the two service-role callers of `auth.admin.listUsers()`.
`referrals.ts` is read by `src/app/dashboard/referrals/page.tsx` and its
`referralLink` builder is reused by `src/app/dashboard/referrals/actions.ts`
so a freshly created host's link is built identically to an existing one's;
the actual referral-crediting logic lives in the `vendor_join_referred`/
`apply_referral_credit` SQL functions and `checkStatusAction`
(`src/features/card-check/api/actions.ts`), not here.
`admin-audit.ts` is the single write path into `loopkit.admin_audit`, called
by every `/admin` Server Action and by `vendor-provision/route.ts` (the one
merqo→loopkit write path that mutates a vendor's access without a signed-in
admin behind it).
`tour-prefs.ts`'s `stampTourSeen` is the single write path into
`vendors.tour_seen_at`, shared by `src/app/api/tour-seen/route.ts` (the
client-fired, `keepalive` path) and `src/app/dashboard/layout.tsx` (the
durable server-render path that closes the race the client-fired path alone
can't). It upserts rather than updates, since `loopkit.vendors` starts with
no row for a vendor who hasn't yet visited `/profile`.
`merqo-vendor-profile.ts`/`merqo-vendor-status.ts`/`metrics.ts` form the HTTP
contract with the merqo parent app, reusing the same Supabase client
generically across schemas. `merqo-customer-notify.ts` is a different kind
of cross-kit call — a plain HTTP `fetch` (kit → merqo, not merqo → kit),
called by `redeemAction` (`src/app/dashboard/actions.ts`) for both its
customer notify (`notifyCustomerByPhone`) and vendor alert (`notifyVendor`)
calls — loopkit no longer runs its own Telegram bot, both routes go through
merqo's shared one. `merqo-vendor-profile.ts`, `merqo-vendor-feedback.ts`,
and `merqo-support.ts` share their `.schema("merqo").rpc(...)` call plumbing
via `merqo-rpc.ts`'s `callMerqoRpc`; the three `/api/merqo/*` GET routes
(`metrics`, `vendor-status`, `qkit-earn-config`) and the `vendor-provision`
write route share their Bearer-token check via `merqo-auth.ts`'s `bearerOk`.

## Parent

[src](../README.md)
