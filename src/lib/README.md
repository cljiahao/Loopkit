# lib

## Purpose

Domain logic and infrastructure for loopkit: program/card/customer CRUD,
the stamp/points/lucky-reward engine dispatch, stats, admin aggregation,
Supabase clients, and the HTTP contract with merqo (metrics + vendor
profile/status).

## Contents

- `action-result.ts` — `ActionResult<T>`: discriminated `{success:true}&T | {success:false,error}` return type shared by Server Actions
- `activity.ts` — `mapActivityRow` (pure event→row classifier) and `listActivity` (paginated, filterable vendor activity feed across programs, fetches `limit+1` rows to detect a next page)
- `admin-data.ts` — service-role reads for the `/admin` console: `listProgramsOverview`, `listVendors`, `listPendingUpgradeRequests`, `platformTotals`, `recentActivity`, `getProgramDetail`; resolves vendor email via `listAllUsers()` (`list-all-users.ts`)
- `admin.ts` — `isAdmin`/`requireAdmin`: admin membership check via the `admins` table (RLS-gated) and a 404-on-fail gate for `/admin` routes and actions
- `brand-icon.test.ts` — unit tests for `brandIcon`: renders the "L" letter on the raspberry background/blush foreground, and scales `fontSize`/`borderRadius` proportionally to the requested size
- `brand-icon.tsx` — `brandIcon(size)`: the shared "L" app-mark construction (raspberry-red rounded square, blush letter) rendered by `src/app/icon.tsx`/`apple-icon.tsx` via `next/og`'s `ImageResponse`; `BRAND_RASPBERRY`/`BRAND_BLUSH` hex constants approximate the current theme's OKLCH tokens (renamed from `BRAND_MULBERRY` when the theme moved off plum/magenta — the cross-kit standard doc's "Source token" table still says "Mulberry & Gold," now stale), same shared formula as every other kit's brand-icon (`docs/business/2026-07-21-brand-icon-family-standard.md`)
- `cards.ts` — `listCards`: the signed-in vendor's cards for one program, optional phone search, most-recently-updated first
- `customers.ts` — `aggregateCustomers` (pure phone-keyed merge of customers+cards across programs) and `listVendorCustomers` (impure shell, RLS-scoped)
- `engine/`
- `expiry.ts` — `isCardExpired`: pure day-elapsed check against a card's cycle start and the program's `expiry_days`
- `format.ts` — `formatSgtDateTime`/`formatSgtDate`/`sgtDateKey`: Asia/Singapore-pinned timestamp formatters and a calendar-day grouping key; `formatShortDate` renders a `"YYYY-MM-DD"` date key as e.g. "10 Jul" (UTC-formatted, since the key is already an SGT calendar day) for the stats page's `VisitsChart` axis labels
- `image-resize.ts` — `resizeToWebp`: browser-only Canvas resize + WebP re-encode before upload, falls back to the original file on decode/encode failure
- `image-upload-adapter.test.ts` — vitest tests: `uploadLoopkitImage` uploads to the given bucket/path and returns the public URL, throws when the storage upload fails
- `image-upload-adapter.ts` — `uploadLoopkitImage`: `@merqo/ui`'s `ImageUploader.onUpload` implementation, wrapping the app's own Supabase Storage upload call (a plain function, not a factory — `@merqo/ui` builds the object path internally from `pathPrefix`, so there's nothing vendor-scoped left to bind at creation time)
- `list-all-users.ts` — `listAllUsers`: paginates `supabase.auth.admin.listUsers()` (1000/page) to completion, mirroring a single call's `{data, error}` shape; shared by `admin-data.ts` and the `vendor-status` route, both of which independently made the same page-1-only mistake before this was extracted
- `loyalty.ts` — `rewardReady`: one-line pure check that a stamp count has met the program's requirement
- `merqo-auth.ts` — `bearerOk(request, envVarName)`: shared constant-time Bearer-token check against a named env var, used by every `/api/merqo/*` route handler (`MERQO_METRICS_SECRET` for the read/reporting routes, `MERQO_PROVISION_SECRET` for the write route); `provisionBearerOk` is a thin wrapper pinned to `MERQO_PROVISION_SECRET` (test: `test/lib/merqo-auth.test.ts`)
- `merqo-rpc.ts` — `callMerqoRpc<TArgs, TReturn, Db, SchemaName>`: shared `.schema("merqo").rpc(...)` call plumbing (cast the caller's typed client across schemas, call, throw with RPC name + Postgres error message on failure) used by `merqo-support.ts`, `merqo-vendor-feedback.ts`, and `merqo-vendor-profile.ts` — each still owns its own Args/Return type mirror and public function signature, only the RPC-call mechanics are shared
- `merqo-vendor-profile.test.ts` — vitest tests for `getOrCreateVendorProfile`: asserts the `.schema("merqo").rpc(...)` call shape and that a Postgres error is rethrown with context
- `merqo-vendor-profile.ts` — `getOrCreateVendorProfile`/`upsertVendorProfile`: hand-written mirror of merqo's cross-schema RPC contract, generic over the caller's own `Database`/schema so `"loopkit"`-scoped clients type-check, calls through `merqo-rpc.ts`'s `callMerqoRpc` for the cross-schema RPC; `upsertVendorProfile` is the write path used by the profile page's social-links save
- `merqo-vendor-feedback.ts` — `submitVendorFeedback`: hand-written mirror of merqo's cross-schema `submit_vendor_feedback` RPC contract, generic over the caller's own `Database`/schema so `"loopkit"`-scoped clients type-check; calls through `merqo-rpc.ts`'s `callMerqoRpc`; the write path used by `actions/feedback.ts` in place of a local insert
- `merqo-support.ts` — `submitSupportMessage`: hand-written mirror of merqo's cross-schema `submit_support_message` RPC contract, generic over the caller's own `Database`/schema; calls through `merqo-rpc.ts`'s `callMerqoRpc`; the write path used by `actions/support.ts` for the Get-help Sheet.
- `merqo-vendor-status.test.ts` — vitest tests for `resolveVendorStatus`: active/free, active/pro, case-insensitive email match, inactive-no-user, inactive-no-program cases
- `merqo-vendor-status.ts` — `resolveVendorStatus`: pure lookup mapping an email + auth-user list + program/pro vendor-id lists to `{active, plan}`, since neither `programs` nor `vendor_pro` carries an email column
- `metrics.ts` — `isWonVisit` (pure) and `computeLoopkitMetrics`: maps loopkit's stamp-card domain onto merqo's qkit-shaped metrics payload (programs→vendors, stamp/visit events→orders, no revenue/GMV in v1)
- `phone.ts` — `normalizePhone`: validates an SG mobile number (starts 3/6/8/9, 8 digits) and returns E.164 `+65…`
- `program-config.ts` — pure, server-import-free program config builders: `buildPlantConfig` (5-stage growth/decay config from a single visits-to-bloom knob) and `buildChanceConfig` (wheel/scratch segment config with fresh per-segment ids, threading each segment's optional vendor-picked `color` through); kept free of `next/headers` so client bundles (`preview-state.ts`) can import it directly; `segmentWinPercent`/`overallWinPercent` (pure, same weight math `chance.ts`'s `pickSegment` uses internally) surface a segment pool's actual win odds as percentages for the Basics segment editor; `segmentInputSchema` validates an optional `color` as a `#rrggbb` hex string
- `program-health.ts` — `programHealth`: pure triage label ("new"/"quiet"/"active") from a program's customer count, age, and last-activity timestamp
- `pricing.ts` — `PricingConfig`, `DEFAULT_PRICING`, `getPricing()`: reads the single-row, admin-tunable `pricing` table (public-select RLS), falling back to a zeroed config only if the row is ever unreadable.
- `program.ts` — `Program`/`SaveProgramInput` types, `programInputSchema`/`saveProgramSchema` (discriminated-union Zod schema per program type), `buildProgramFields`, `listPrograms`/`getProgramById`/`currentProgram`, `Entitlement`/`getEntitlement`/`canCreateProgram`/`canPrepProgram` (free vs. pro tier caps), `isPro`, `applyDueCutovers` (lazy scheduled-retirement cutover), `getProgram` (transitional single-program shim)
- `qr.ts` — `qrSvg`: renders a QR code as an SVG string via the `qrcode` package
- `schemas.ts` — `loginSchema`/`LoginInput` (email format + non-empty password) backing `LoginForm`'s react-hook-form resolver; `supportMessageSchema`/`SupportMessageInput` (category enum + 1-2000 char body) and `SUPPORT_CATEGORY_LABELS`, the shared Get-help validation/labels used by `actions/support.ts` and `dashboard-nav.tsx`'s `@merqo/ui` `HelpSheet` wiring, plus `pricingFormSchema`/`PricingFormInput`/`MAX_MONEY_CENTS` for the admin pricing form
- `stamp-mark.ts` — `resolveStampMark(view, vendorAvatarUrl)`: pure resolver converting the engine's `ProgressView` dots variant (vendor's chosen mark mode/preset) and vendor avatar URL into the concrete `StampMark` value `StampDots` renders; shared by `/c` and `/setup` live preview so both resolve marks identically
- `telegram.ts` — `sendTelegramMessage(chatId, text)`: fire-and-forget `POST https://api.telegram.org/bot<token>/sendMessage` call, no-ops when `TELEGRAM_BOT_TOKEN` is unset and catches/logs (never throws) a fetch rejection — callers (`redeemAction`) never let a Telegram failure affect their own result; `generateLinkToken()`: a `crypto.randomUUID()`-derived token matching Telegram's deep-link payload charset (`test: telegram.test.ts`)
- `stats.ts` — `classifyActivity`/`pctChange`/`bucketVisitsByDay`/`avgDaysBetweenVisits`/`computeCardStats` (pure aggregation pipeline) plus `getProgramStats`/`getVendorStats` (impure shells fetching cards+stamp_events) and `countExpiredVouchers` (impure shell counting `reward_vouchers` that expired in the last 30 days — a separately-sourced tile added alongside, not replacing, `rewards30d`/`redemptionRate` per `docs/superpowers/specs/2026-07-16-reward-voucher-ledger-design.md`) — powers the vendor stats dashboard
- `supabase/`
- `types.ts` — `Json` type, `SocialLinks` (shape of the shared `merqo.vendor_profile.social_links` JSONB column — not part of the `loopkit` schema), and the hand-written `Database["loopkit"]` interface (Row/Insert/Update per table), a manual mirror of `supabase/migrations/` kept in sync by hand (no live DB codegen yet)
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
`merqo-vendor-profile.ts`/`merqo-vendor-status.ts`/`metrics.ts` form the HTTP
contract with the merqo parent app, reusing the same Supabase client
generically across schemas. `merqo-vendor-profile.ts`, `merqo-vendor-feedback.ts`,
and `merqo-support.ts` share their `.schema("merqo").rpc(...)` call plumbing
via `merqo-rpc.ts`'s `callMerqoRpc`; the three `/api/merqo/*` GET routes
(`metrics`, `vendor-status`, `qkit-earn-config`) and the `vendor-provision`
write route share their Bearer-token check via `merqo-auth.ts`'s `bearerOk`.

## Parent

[src](../README.md)
