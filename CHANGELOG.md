# Changelog

All notable changes to loopkit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Removed

- The `/login` page's "Continue with name & phone" vendor onboarding option
  — an anonymous-Supabase-session sign-in path unique to loopkit (every
  sibling kit ships only Google OAuth + email/password) with no account
  recovery story for what is a business owner's primary sign-in, not a
  disposable customer flow. `/login` now matches qkit's reference login
  pattern exactly.

### Changed

- Redesigned `Wheel` and `ScratchCard` to match the Cup/Sprout/Flame Club
  pass below — the real physics-based spin and real SVG scratch-texture
  masking were already right, the gap was visual craft:
  - `Wheel` gains a static gold housing ring and hub (radial gradients,
    never rotate with the disc, like a real wheel's frame), gold wedge
    dividers instead of background-colored gaps, a small wax-seal dot
    marking each reward wedge near the rim (so win/lose reads as more
    than the emerald/rose color pairing), a static radial glare plus a
    restrained drop-shadow, and a gold-gradient SVG pointer replacing the
    flat CSS border-triangle.
  - `ScratchCard`'s cover gains a real foil texture (a metallic-fleck
    pattern plus one static diagonal sheen, masked under the same reveal
    strokes as the base gradient) instead of a flat two-stop gradient, an
    embossed card frame (inset highlight + drop shadow) instead of a
    plain border, and the same wax-seal dot marking a reward reveal.
- Redesigned the three "reward-mechanic" progress visuals — Cup, Plant/
  Sprout, and Flame Club — with hand-drawn SVG art replacing the previous
  flat-shape/lucide-icon placeholders, plus real stage-to-stage growth
  transitions (as opposed to plain crossfades):
  - `Cup` is now a 3/4-perspective "looking down into the mug" illustration
    (gradient-filled shell, elliptical rim, translucent rim-shadow, a
    hand-traced pitcher pouring milk at the penultimate stage, a latte-art
    flourish at Full) with one persistent coffee ellipse whose geometry and
    gradient stops are set per stage and left to the browser to interpolate,
    so the surface genuinely rises/widens in place and the espresso→latte
    tone blends continuously.
  - `Plant` now keeps growing across all 5 stages (previously froze after
    Leafing), with 5 persistent leaf slots (never swapped, so leaves don't
    flash/replace across stages) and, at the final stage, one of 4 flower
    types — tulip, daisy, sakura, or pansy — deterministically selected by a
    new optional `seed` prop (hashed, not random) so a given customer's
    flower stays the same across visits instead of changing on every reload.
  - `FlameLayers` replaces its stacked `lucide-react` `Flame` icons with a
    hand-built campfire (coal bed → coal mound+ghost-flames → candle lick →
    3-tongue fan → large lick with rising sparks/smoke), each stage its own
    gradient-stopped shape; Ember↔Spark and the Full-Campfire→Ember
    redemption jump crossfade in sync, while Small→Medium→Large instead
    holds the old flame at full size while the new one grows, only shrinking
    the old one away after a delay once the new one has visibly grown past
    it.

### Fixed

- Dashboard onboarding tour re-triggered on every single dashboard load,
  even after a vendor's account was months old — `stampTourSeen` (`src/lib/
tour-prefs.ts`) used `.update()` against `loopkit.vendors`, but that table
  is created lazily (a vendor's first `/profile` save is their first write
  there), so any vendor who never visited `/profile` had no row to update.
  The update matched zero rows and returned no error, silently persisting
  nothing. Switched to `.upsert()`, matching the fix paykit already shipped
  for the identical "starts with no row" shape on its own `vendor_prefs`
  table.
- Two bugs in the redesign above: `Plant`'s leaf slots rendered pinned to
  the SVG's top-left corner instead of their stem position — a `transform`
  attribute (positioning) and a CSS `transform` (the pop-in scale) can't
  coexist on the same SVG element, and the leaf group had only the latter.
  Split into a static positioning `<g>` wrapping the animated one. Separately,
  `FlameLayers`' icon rendered at roughly half the size of `Cup`/`Plant` on
  the same card (`size-16`/`size-14` vs. their `size-32`) — resized to match.
- Second fast-follow round on the same redesign: `FlameLayers`' stage
  transitions pivoted at each shape's own center, reading as popping
  outward rather than rising from the logs — now pivots at its own
  bounding-box bottom instead, so a stage change grows/shrinks bottom-up.
  `Plant` had no idle motion at all
  (the reference design's sway never made it into the port) — added a
  `motion-safe:` ±2° sway, suppressed while wilting. `Cup` and
  `FlameLayers` still read visibly smaller than intended even at matched
  box sizes — both bumped 30% (`size-32`→`size-[166px]` for `Cup`;
  `size-32`/`size-28`→`size-[166px]`/`size-[146px]` for `FlameLayers`).
  The cup variant's 50%-progress stage was named "Quarter Full" — renamed
  to "Half Full" (`program-config.ts`'s `CUP_STAGE_NAMES`; the thresholds
  themselves were always even quarters, only the label was wrong). Plant/
  Cup also had no visible progress counter, unlike `FlameLayers`' own
  `"{stageName} — {filled}/{total}"` — `plantStrategy.progress()` now
  reports the same `filled`/`total` shape, surfaced through the existing
  shared `label`/`progress.label` line both card views already render.
- `/admin/activity` and `/admin/vendors` returned HTTP 500: both are
  `async` Server Components that passed function props (`formatAction`/
  `dateFormatter`, and the `DataTable` `columns` cell renderers + `getRowKey`)
  straight to `@merqo/ui` components, which ship as Client Components — a
  boundary React can't serialize a function across. `next build` didn't
  catch it because both routes are dynamic (`revalidate = 0`), never
  prerendered. Each `@merqo/ui` render is now extracted into a small
  `"use client"` wrapper that owns the callbacks
  (`src/app/admin/activity/activity-log.tsx`,
  `src/app/admin/vendors/vendors-table.tsx`); the pages pass only
  serializable data.

### Changed

- `@merqo/ui` bumped to v0.22.1 (TS2742 declaration-emit fix): the activity
  table, admin programs list, and admin vendors list now render through the
  shared `DataTable` component instead of hand-rolled/shadcn-`Table` markup.

### Added

- `GET /api/merqo/vendor-activity?email=` — merqo's cross-kit vendor
  detail view now gets real per-vendor loyalty activity (programs, cards,
  stamps/rewards in the last 30 days) instead of nothing.

- Admin `/admin/activity` tab rendering `admin_audit` via `@merqo/ui`'s
  shared `AuditLogTable` — the first kit-family reader of an audit trail
  that every kit already writes to but none previously displayed.
- Onboarding step wizard for first-run program creation: `/setup`'s create
  flow (not edit, not a scheduled type-change, not an in-place type swap)
  now walks a vendor through Type → Basics → Rules with a numbered
  progress indicator instead of one long page, `Next: Rules` disabled
  until a card name is entered, and the optional "Stamp mark" section
  collapsed behind a "Show advanced options" toggle. Every field stays
  mounted across steps (hidden via the native HTML `hidden` attribute,
  not unmounted), so nothing loses its value going Back. Editing an
  existing program keeps the original single-page layout unchanged.

- Manual stamp adjustment and a per-customer detail view — the real day-2
  ops gap: a vendor's only correction tool used to be "Regenerate card," a
  full reset that also invalidates the customer's QR. `/dashboard/customers/
[phone]` shows every card a customer holds across the vendor's own
  programs, their full activity history, and (for classic Stamp-type
  programs) an "Adjust stamps" action — a `±` delta with a required reason,
  clamped at 0, logged as its own `stamp_events` kind (`adjust`, distinct
  from a real stamp) via `loopkit.adjust_stamp` (migration `0042`). Free-tier,
  not Pro-gated. Growth/Points/Chance cards are out of scope for this pass.

- Birthday bonus for Stamp programs: customers can optionally self-enter
  their birthday on the card-check page (`loopkit.set_customer_birthday`,
  anon-scoped to the exact vendor+phone pair). A vendor opts a Stamp
  program in via a new edit-mode toggle; the next visit on or after the
  birthday grants one bonus stamp, once per year, via a lazy
  check-on-next-visit trigger on `stamp_events` — no cron. Reuses
  `add_stamp`'s real threshold-crossing/reward-voucher accounting (now
  factored into `loopkit._add_stamp_unchecked`) instead of a second,
  parallel stamp-granting path. Migration `0041`.
- Per-mechanic stats breakdown on the vendor-wide `/dashboard/stats` page:
  a new "By mechanic" card groups enrolled/visits/redemption-rate by which
  named mechanic (Stamp/Growth/Chance Card) a program's engine `type`
  belongs to, shown only when a vendor runs 2+ distinct mechanics.
- Host/couple-facing referral mechanic for event-cart vendors
  (`/dashboard/referrals`): a vendor names one of their own active
  programs plus a host's phone (the bride/groom/organizer who chose them),
  and gets a shareable `/c?v=<vendorId>&ref=<code>` link. Every distinct
  guest who joins through that link earns their own card as usual and
  bumps the host one stamp/visit on the named program — credit-routing on
  an existing program, not a new engine type. New `vendor_join_referred`/
  `apply_referral_credit` RPCs and `loopkit.referral_hosts`/
  `referral_credits` tables (migration `0040`); `vendor_join` itself is
  unchanged for every existing caller.

### Changed

- Dark mode moved from pure OS-media-query CSS to a `.dark`-class-based
  approach (`@custom-variant dark`), now driven by `next-themes`'
  `ThemeProvider` (`src/app/layout.tsx`) — gives a manual Light/Dark/System
  control in the account menu (via `@merqo/ui` bumped to v0.18.0) on top of
  the existing OS-auto behavior. `src/app/globals.css`'s color tokens are
  unchanged, only the two `@media (prefers-color-scheme: dark)` blocks were
  converted to `.dark`/`.dark body` selectors.
- Bumped `@merqo/ui` to v0.20.0: the vendor stats page's tile now wraps the
  new shared `StatTile`/`DeltaPill` content instead of a fully local
  implementation — no visible change, loopkit's own `ElevatedCard` shell and
  value-above-label ordering are unchanged.
- Bumped `@merqo/ui` to v0.19.0: the theme control now sits behind a
  collapsed "Theme · {current}" submenu instead of three always-expanded
  radio options.
- The onboarding tour's "example card" progress text now renders the real
  `stampStrategy.progress()` output instead of a hand-copied "5 of 8
  stamps"/"3 more for a reward" — the hand copy had already drifted from
  the engine's real `N/M stamps` label format.

### Fixed

- Cards were visually indistinguishable from the page background in both
  light and dark mode — the Sealing Wax rebrand set `--card`/`--popover`
  to the exact same OKLCH value as `--background`. Restored a distinct
  card treatment in both modes (`src/app/globals.css`); both deltas were
  widened further in follow-up passes after reading as too subtle at a
  glance.
- The favicon/apple-touch-icon (`src/lib/brand-icon.tsx`) still rendered
  the old "Raspberry-Rose Punch & Gold" hex after the Sealing Wax
  rebrand — a real visible bug, not just stale docs.
- Onboarding tour re-triggered on a page refresh: the client-fired "seen"
  stamp was fire-and-forget and could lose a race against a fast reload.
  `src/lib/tour-prefs.ts`'s `stampTourSeen` now also runs synchronously in
  `dashboard/layout.tsx`'s own server render, durable regardless of what
  happens client-side.

### Changed

- Onboarding tour copy: no more em dashes, and two new steps (Activity,
  Stats) covering ground the tour skipped before. The first step now shows
  an example stamp-card preview.

### Added

- Cross-kit audit-trail sweep: extracted `admin_audit`'s insert helper out
  of `src/app/admin/actions.ts` into a shared `recordAudit`
  (`src/lib/admin-audit.ts`, no behavior change for the existing 5 admin
  actions) so it can be reused outside `/admin`. `POST
/api/merqo/vendor-provision` — the one place merqo mutates a vendor's
  access on loopkit directly, over a bearer secret with no signed-in admin
  behind it — now calls it too, attributing the action to the provisioned
  vendor's own id with a `detail.actor: "merqo_system"` sentinel. Migration
  `0039` also revokes `update`/`delete` on `loopkit.admin_audit` from
  `service_role` (RLS already blocked `authenticated`/`anon`; the app only
  ever inserts), and `AGENTS.md` now states a 5-year retention policy for
  `admin_audit`, matching IRAS record-keeping norms.

### Changed

- Brand theme: `globals.css`'s color tokens replaced with "Sealing Wax"
  (oxblood-crimson primary, antique-brass counter-tone), light and
  dark, replacing "Raspberry-Rose Punch & Gold" — same berry family,
  pushed darker/denser. Purely cosmetic — no component/behavior change.
- Bumped `@merqo/ui` to v0.16.0 and migrated `/dashboard/plan`'s feature
  comparison grid onto the shared `PlanComparisonTable` component (matching
  qkit's own migration onto the same component). Replaces the page's local
  `FEATURES`-rendering JSX + local `Cell` helper — same 2-tier (Free/Pro)
  visible output, including the "Loyalty programs" row's string cell values
  (`"1"`/`"∞"`). Also adds `--color-status-ready` (mapped to `--primary`) in
  `src/app/globals.css`, since the shared component's check icon hardcodes
  that token and loopkit had no order-status palette to supply it.

### Fixed

- Bumped `@merqo/ui` to v0.14.1 — the kit-switcher (account menu's
  "Switch products") was sending vendors to a kit's `-sg.vercel.app`
  deployment host instead of its real `<kit>.merqo.io` domain, a
  different host from `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN=.merqo.io`'s
  shared-session cookie scope — bouncing a switching vendor into a login
  loop instead of a live session.

### Added

- Vendor Telegram Connect (Phase A2) — retires loopkit's own Telegram bot
  in favor of merqo's shared one. `redeemAction`'s vendor alert
  (`notifyRedemptionOnTelegram`) now calls a new `notifyVendor`
  (`src/lib/merqo-customer-notify.ts`), posting to merqo's
  `POST /api/merqo/notify-vendor` instead of a local `vendor_telegram`
  lookup + `sendTelegramMessage` call. Deleted entirely: the Phase A
  webhook route (`src/app/api/telegram/webhook/`), `src/lib/telegram.ts`,
  `src/lib/telegram-link.ts`, the dashboard settings "Connect Telegram"
  section, and `disconnectTelegramAction`. Migration `0037` drops
  `loopkit.vendor_telegram`/`loopkit.telegram_link_tokens` (added by
  `0036`) — no data carries over, so **any vendor who'd linked loopkit's
  own bot must reconnect once via merqo's own profile page**; this is an
  expected consequence of the retirement, not a regression.
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`/`TELEGRAM_WEBHOOK_SECRET`
  are gone — `MERQO_BASE_URL`/`MERQO_CUSTOMER_SECRET` (already used by the
  customer-notify call below) now also power the vendor alert. Depends on
  merqo's own Phase A2 rollout (PR #51) already live.
- Customer-notify vendor toggle — a vendor-level on/off switch (default
  on, opt-out) for `redeemAction`'s customer redemption-confirmation
  message, a fast-follow on the customer Telegram connect work above. New
  `loopkit.vendor_notify_settings` table (migration `0038`,
  `customer_telegram_notify_enabled` boolean, default `true`) with a
  `for all` own-row RLS policy and `select, insert, update` granted
  directly to `authenticated` — a vendor upserts their own row under RLS
  from a server action, not service-role-only like `vendor_telegram`/
  `telegram_link_tokens` used to be. `redeemAction` reads the row via a
  new `customerNotifyEnabled` helper and skips `notifyCustomerByPhone`
  only when a row exists AND the flag is explicitly `false` — a vendor
  who's never visited `/dashboard/settings` (no row at all) still gets
  the confirmation, resolved in application code rather than relying on
  the column default alone. New `saveCustomerNotifySettingsAction`
  (same upsert-on-`vendor_id` shape as `saveQkitEarnConfigAction`) backs
  a new switch in `/dashboard/settings`
  (`src/app/dashboard/customer-notify-settings.tsx`), not Pro-gated.
  See `docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`.
- Customer Telegram connect (reuse-only) — loopkit's half of the cross-kit
  Phase B+D rollout. `redeemAction` now also calls a new
  `notifyCustomerByPhone` (`src/lib/merqo-customer-notify.ts`) as a
  sibling to the existing vendor Telegram alert, posting to merqo's
  `notify-customer` endpoint in its `phone` lookup mode so a customer who
  already connected Telegram via qkit (with a matching phone number)
  gets a redemption confirmation too. No new UI, no new table, no connect
  flow — loopkit never mints its own connect token, only reuses a
  standing connection merqo already has. `MERQO_BASE_URL`/
  `MERQO_CUSTOMER_SECRET` are optional; a failure or a missing connection
  never affects `redeemAction`'s own returned result. Depends on merqo's
  own Phase B+D endpoints (PR #50) already live.
- Telegram reward-redemption alerts — loopkit's half of the cross-kit
  Telegram Phase A rollout. A vendor connects Telegram once from
  `/dashboard/settings` via a deep-link QR code (reusing the existing
  `src/lib/qr.ts` QR renderer, no new QR library); every reward
  redemption then fires a message to their linked chat via
  `redeemAction`. New `loopkit.vendor_telegram`/`loopkit.telegram_link_
tokens` tables (migration `0036`, no client write grant — every write
  goes through the service-role webhook route or the settings page's
  token-issuing/disconnect actions), a signature-verified webhook route
  (`src/app/api/telegram/webhook/`), and `src/lib/telegram.ts`/
  `src/lib/telegram-link.ts`. A missing link, a lookup failure, or a
  send failure is caught and logged — never affects `redeemAction`'s own
  returned result. `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_USERNAME`/
  `TELEGRAM_WEBHOOK_SECRET` are optional; see `docs/DEPLOY.md`'s
  "Telegram bot setup" for the manual one-time `setWebhook` step.
- Cross-kit customer identity substrate: `sync_customer_on_card`/
  `sync_customer_on_activity` (migration `0035`) now also write to the
  shared `merqo.customers` table (merqo migration `0018`) alongside the
  existing local `loopkit.customers` write. Additive only — loopkit's own
  dashboard keeps reading `loopkit.customers` exactly as before; no new UI
  yet. Guarded against loopkit-only local/CI `supabase start` (no merqo
  schema present) the same way `0030_vendor_feedback_backfill.sql` is.
- "Switch products" submenu in the dashboard account menu (via `@merqo/ui`
  v0.13.0's `switchKits` prop), letting a signed-in vendor jump straight to
  the other live Merqo kits — qkit, paykit, stockkit — since SSO via the
  shared `.merqo.io` cookie already signs them in everywhere. Static list,
  no new API call.
- Admin-tunable Pro pricing — loopkit's first-ever live price. A new
  single-row `loopkit.pricing` table (migration `0034`, seeded at
  $4.99/mo) backs a `setPricing` admin action and `@merqo/ui`'s new
  `PricingForm` component, wired into `/admin` so an admin can retune the
  price with no redeploy. `/dashboard/plan` now shows the live price
  (`$4.99 / month`) in place of the old "no card needed yet" copy with no
dollar figure at all. The manual "ask us to upgrade" grant flow
(`requestUpgrade`/`UpgradeCta`/`setVendorPro`/`resolveUpgradeRequest`) is
  unchanged — this is a display/expectation-setting change, not a
  checkout change.

### Changed

- Bumped `@merqo/ui` to v0.14.0 and switched the dashboard nav's "Switch
  products" submenu from a locally hardcoded kit list to the package's new
  `getSwitchKits("loopkit")` helper (backed by its centralized `KIT_FAMILY`
  registry). Same three kits, same URLs — a future new kit now only needs
  `KIT_FAMILY` updated once in `@merqo/ui`, not in every kit's own
  `dashboard-nav.tsx`.
- Expanded ESLint's sonarjs wiring from 2 hand-picked rules to the plugin's
  full `configs.recommended` set. Fixed every real finding in app code:
  nested-ternary/cognitive-complexity hotspots refactored into helper
  functions across ~14 files (including a real DRY fix unifying
  `dashboard/activity/page.tsx`'s duplicated render branches), super-linear
  regex patterns in schema tests tightened, unused imports/vars removed,
  and a component literally named `Error` (shadowing the global) renamed to
  `RouteError`. Scoped, documented rule-offs remain for cosmetic
  `Math.random()` use, test-file mock-chain nesting, and the two largest
  pre-existing complexity hotspots (`setup/page.tsx`, `setup/setup-form.tsx`)
  — tracked as follow-up debt, not silently suppressed.

- Display font switched from Bricolage Grotesque to Fraunces (the shared
  family display face — see
  `docs/business/2026-08-13-typography-family-standard.md`). qkit already
  used Fraunces; this brings loopkit in line with the rest of the family
  now that cross-kit SSO means vendors move between kits under one
  identity, so a per-kit display face reads as a seam rather than a
  feature. Body (Plus Jakarta Sans) and mono (IBM Plex Mono) fonts are
  unchanged. The brand-icon mark's font fallback also switched from the
  system sans-serif stack to the Georgia serif stand-in, matching
  Fraunces being a serif.

### Fixed

- Second frontend-design/impeccable critique pass (the first covered
  counter/benefits/FAQ/hero/stats/nav badge; this one hunted for what it
  missed): the login page's wordmark subtitle read "Sign in to your loopkit
  dashboard." even while the card below it read "Create your account" —
  a static, mode-independent string contradicting the mode-aware card
  copy — and the wordmark wasn't a link home, both deviations from qkit's
  reference login pattern that PRODUCT.md calls a binding cross-kit
  constraint (`src/features/auth/components/login-form.tsx`). The
  customer-facing `/c` card-check form stayed fully visible above the
  fetched card status after a successful lookup, pushing the actual
  content customers need — the reward status and the QR to show the shop —
  below a form they'd already filled in; it now collapses to a compact
  "Showing +65… / Not you?" summary once a result lands
  (`src/features/card-check/components/check-form.tsx`). The Settings
  page's qkit-integration panel told a free-tier vendor to "Upgrade to
  Pro" as plain, unlinked text instead of using the app's own established
  `ProLock` upgrade-CTA pattern used at every other point of friction,
  dead-ending the vendor with no path forward
  (`src/app/dashboard/qkit-earn-settings.tsx`). The `/setup` page rendered
  the literal same heading and paragraph ("Free plan: 1 program" / "You're
  on the free plan, which includes one loyalty program.") twice in a row
  for a free-tier vendor at their program cap — once as the page header,
  again inside the upsell card immediately below it; the header now reads
  "Add a program" / "You've reached your plan's program limit." instead
  (`src/app/setup/page.tsx`).
- Customer search inputs on the dashboard customers page relying on
  placeholder text alone, with no accessible label (failed WCAG
  1.3.1/3.3.2). Paired each with a screen-reader-only `Label`, matching
  the pattern already used on `activity-filters.tsx`.
- The program-card Edit link's ~28x28px hit area falling well short of
  the ~44x44px touch-target guideline on a dashboard used standing at a
  stall on phone/tablet. Enlarged the tap target.

- Dashboard onboarding tour re-running on every visit to the overview page
  instead of staying dismissed. Root cause: the `@merqo/ui` v0.8.1/v0.9.0
  migration swapped the dashboard nav's Next.js `<Link>`s for the shared
  `DashboardNav`'s plain `<a>` tags (that package has no Next.js
  dependency), so every dashboard nav click became a full-page hard
  navigation instead of a client-side transition. The existing
  stamp-tour-seen-on-start write (a Server Action call) raced that
  navigation: a vendor who clicked a nav link shortly after the tour
  auto-started (very plausible — it's the natural reaction to an intrusive
  overlay) unloaded the page before the write landed, aborting it and
  leaving `tour_seen_at` unstamped, so the tour auto-ran again next visit.
  Replaced the Server Action with a `POST /api/tour-seen` Route Handler
  called via `fetch(..., { keepalive: true })`
  (`src/components/dashboard-tour.tsx`, `src/app/api/tour-seen/`) —
  `keepalive` guarantees the browser finishes the write even after the
  document that started it unloads, which a Server Action's own internal
  fetch cannot opt into.

### Changed

- Design pass from a completed frontend-design/impeccable critique:
  the counter page now leads with phone entry (the product's actual
  mechanic) instead of a full-width scan button pushing it below the
  fold on mobile; Benefits and FAQ gained the eyebrow/heading/divider
  pattern already used by How-it-works; the hero's stamp-card now
  pops its last dot on load; the stats bar chart was extracted into
  a shared `VisitsChart` component (was ~110 duplicated lines) and
  gained a baseline plus date labels; and the free-tier nav badge
  got a visible gold-tinted outline instead of being nearly invisible.
- Bumped `@merqo/ui` to v0.9.0. The landing page's sticky header
  (`src/components/landing/nav.tsx`) now delegates its outer shell to the
  new shared `LandingNav` component (`wordmark`/`end` slots), matching
  qkit's landing-header sizing exactly the same way `DashboardNav` already
  does for the dashboard header — no visible change to the wordmark, FAQ
  button, or sign-in/get-started controls. Also unified every `/dashboard`
  page onto one canonical `max-w-7xl` content container set at the layout
  level (`src/app/dashboard/layout.tsx`, matching qkit's `dashboard/layout.tsx`
  pattern) instead of each page picking its own (previously inconsistent)
  width — `profile`/`counter`/`plan`/`settings` still nest their own
  narrower wrapper inside that shared container, since those single-column
  forms genuinely read better constrained.
- Bumped `@merqo/ui` to v0.10.0 and wired its new `LinkComponent` prop
  (`LinkComponent={Link}`, `src/app/dashboard/dashboard-nav.tsx`) through to
  `DashboardNav` (which forwards it internally to the `AccountMenu` it
  composes — loopkit has no standalone `AccountMenu` usage). Dashboard nav
  and account-menu links now render as `next/link`'s `Link` instead of the
  package's default plain `<a>`, so clicking them is a client-side
  transition again instead of a full-page hard navigation — the root cause
  the `/api/tour-seen` `keepalive` workaround above was patching around
  the symptom of.
- Migrated onto the shared `@merqo/ui` component package (v0.8.1): the
  dashboard nav/account dropdown now composes `@merqo/ui`'s `DashboardNav`
  and `AccountMenu` (with loopkit's own Feedback/Get-help server actions
  wired through throw-adapters); `useAsyncAction`, `InfoTooltip`,
  `ImageUploader` (via a new `uploadLoopkitImage` adapter,
  `src/lib/image-upload-adapter.ts`), `DashboardTour`, and the profile
  page's two-column layout (`TwoColumnSections`) all now delegate to the
  shared package instead of hand-rolled local copies. `Section` keeps
  loopkit's own `ElevatedCard` shell via the shared component's `wrapper`
  render-prop, so the polished-card visual is unchanged. No user-visible
  behavior change; removes `FeedbackForm`/`SupportForm`/local
  `ImageUploader`/`InfoTooltip`/`tour.css` and the direct `driver.js`
  dependency (now only reached transitively through `@merqo/ui`).
- Deduplicated the per-route `bearerOk` bearer-secret check (previously copy-pasted into
  3 `src/app/api/merqo/*` routes) into a shared helper in `src/lib/merqo-auth.ts`, and the
  repeated Merqo-schema RPC-call boilerplate across `merqo-support.ts`/
  `merqo-vendor-feedback.ts`/`merqo-vendor-profile.ts` into a shared `callMerqoRpc` helper
  in `src/lib/merqo-rpc.ts`. No behavior change.
- Adopted templateCentral 5.13.0's mechanical comment-hygiene enforcement layer
  (live edit-time feedback, pre-commit warn, CI gate on added lines).
- Landing footer rebuilt to match qkit's exact single-row layout
  (wordmark, tagline, copyright, sign-in link as flex siblings), and the
  bottom call-to-action band above it removed — qkit's landing page never
  had one.

### Fixed

- Dashboard onboarding tour now stamps `tour_seen_at` as soon as it
  auto-runs, not when it finishes — a refresh mid-tour no longer makes
  it re-run on every dashboard load.

### Removed

- Per-IP rate limiting (`src/lib/rate-limit.ts`, `@upstash/ratelimit`,
  `@upstash/redis`) on the public `/c` card-check and `/earn` claim actions —
  never provisioned in production (fail-open, so it was a no-op), decided
  not worth the added dependency + config surface.

### Added

- Dashboard onboarding tour (ported from qkit/stockkit): a `driver.js`
  overlay auto-runs once on first login, spotlighting the shop QR block,
  Customers, and the account menu, replayable via a floating "?" button.
  Tracked server-side via a new `vendors.tour_seen_at` column, not
  localStorage, so it's consistent across devices.
- `supabase/config.toml` — loopkit was the only one of the 5 Merqo repos
  without a local-dev Supabase CLI config. Added to match the format
  merqo/qkit/paykit/stockkit already share (same local ports, Google OAuth
  external provider, `auto_expose_new_tables = false` with explicit
  Data-API grants), plus the matching `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`
  entries in `.env.example`.
- `BackToTop` scroll-to-top button on the landing page (ported from qkit).
- Shared-session SSO across `*.merqo.io` kits: `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`
  scopes the Supabase auth cookie to `.merqo.io` in production, so signing
  in on one kit signs you in on the rest. A one-time cleanup in
  `src/lib/supabase/middleware.ts` clears each already-signed-in vendor's
  pre-existing host-only cookie (forcing a single re-login) without
  clobbering a same-request token refresh.

### Fixed

- Google OAuth sign-in now forces the consent screen to English
  (`hl=en`), matching the fix already shipped in paykit/merqo.
- Landing nav's "Log in" link renamed to "Sign in" for cross-kit label
  parity.
- Login page's Google icon now lives in its own `google-mark.tsx`
  component, matching the shared component used across every kit's login
  page (cross-kit login-page parity pass).
- Browser-tab title now uses the cross-kit "Name | Tagline" Title Case
  format: "Loopkit | Loyalty Cards" (was "loopkit: loyalty cards").
- `.husky/lib/pre-commit.sh` used `xargs -d '\n'`, a GNU-only flag not
  supported by BSD xargs (macOS default) — broke every local commit
  touching a staged .ts/.tsx/.js/.mjs/.cjs file. Swapped for portable
  `tr '\n' '\0' | xargs -0`.

- Browser-tab title lowercased to match the kit naming convention (was
  "LoopKit: stamp cards", PascalCase reserved for the logo mark only) and
  tightened to "loopkit: loyalty cards".
- Dashboard and landing navbar height, padding, and logo size now match
  qkit's spec (`px-5 py-3.5`/`py-4`, `text-3xl` logo, `font-semibold` not
  `font-extrabold`).

- Dashboard nav's mobile burger and inline Dashboard/Customers/Activity/Stats
  links now use the shadcn `Button` component instead of hand-rolled
  `<button>`/`<Link>` markup, matching qkit's pattern; the burger also gained
  an `aria-expanded` attribute reflecting its open/closed state.
- Landing nav rendered a Faq (`id="faq"`) section with no way to reach it —
  added an FAQ button (hidden below `sm`, anchored to `#faq` via a plain
  `<a>` for a reliable same-page hash jump), matching qkit's header
  placement before the auth CTAs.
- `/dashboard/profile` and `/dashboard/settings` were both missing the "Back
  to dashboard" `BackButton` that qkit renders on its equivalent profile
  page — wired the existing `BackButton` component (already used on
  `/setup` and `/dashboard/counter`) into both.
- Login form's submit button could visibly re-enable mid-transition right
  after a successful sign-in: `router.push`/`router.refresh` return before
  the navigation lands, so `useAsyncAction`'s `finally` flipped `pending`
  back to `false` while the old page was still showing. Ported qkit's
  `navigatingAway()` helper into `use-async-action.ts` (a promise that
  never resolves) and `await` it at the end of the login form's
  email/password and phone-onboarding success branches — the component
  unmounts once the new route lands, so `pending` correctly never resets.

### Changed

- Migrated git hooks from lefthook to husky — lefthook's unsigned
  `lefthook.exe` is unconditionally blocked by Windows Smart App Control on
  this machine; husky has no native binary. Same checks, same rigor.

- Login form migrated off raw `useState` + manual submit handlers with
  inline error text onto React Hook Form + Zod (a new `loginSchema` in
  `src/lib/schemas.ts`) with a `zodResolver`, matching qkit's login page
  pattern and the stack AGENTS.md already documents. Auth/server errors now
  surface via sonner toasts instead of an inline alert paragraph. The
  name+phone onboarding sub-flow keeps its own hand-rolled busy/error state
  rather than moving onto the same resolver, since it isn't a validated
  email/password form; all buttons still share one disabled state across
  both flows.

- **qkit-earn upsell copy overstated the stamp award as automatic.** The
  Pro upgrade prompt for earning stamps from qkit orders said a stamp is
  awarded "automatically" — the real flow is a claim link (the customer
  gets a link on their qkit order page and enters their phone number on
  loopkit's `/earn` page to collect it). Copy now describes the actual
  behavior.

### Added

- New `POST /api/merqo/vendor-provision` endpoint and
  `loopkit.provision_default_program` Postgres function, letting the Merqo
  hub one-click-activate a vendor onto loopkit: creates the vendor's
  `vendors` row and a default free-tier "Starter" stamp program, bearer-
  gated by a dedicated `MERQO_PROVISION_SECRET` (`provisionBearerOk`,
  separate from the existing `MERQO_METRICS_SECRET` used by the read-only
  merqo routes). `provision_default_program` is idempotent on whether the
  vendor already has any program row, not on the `vendors` table, so
  re-provisioning a vendor who already has a program (default or
  custom) never adds a second one.

### Security

- Upgraded `next` `16.2.10` → `16.2.11`, resolving all 7 Next.js advisories
  (cache-confusion of response bodies x2, unbounded Server Action payload
  in Edge runtime, image-optimization SVG DoS, unauthenticated Server
  Function endpoint disclosure, and 2 more) that CI's `dependency audit
(pnpm)` job had been flagging on every PR this cycle — this was the one
  actually in the production dependency graph (`--prod` scope), everything
  else audit had flagged was dev-tooling-only.
- Force-patched (via `pnpm-workspace.yaml`'s existing `overrides:`
  convention) `postcss` (path traversal via `sourceMappingURL`,
  GHSA-r28c-9q8g-f849 — supersedes an earlier, narrower postcss entry),
  `fast-uri` (host confusion via a literal backslash authority delimiter,
  GHSA-v2hh-gcrm-f6hx, dev-only via stryker), and `brace-expansion`
  (exponential-time expansion DoS, GHSA-3jxr-9vmj-r5cp, dev-only via
  eslint/vitest-coverage/stryker's respective internal `minimatch`
  chains) — see the workspace file's own comment for the one residual,
  intentionally-unfixed `brace-expansion` advisory (a second, unrelated
  bug with no patched release on the old `minimatch@3.1.5` chain's 1.x
  line; forcing it past 1.x breaks eslint outright). All residual findings
  are devDependency-only, which CI's audit step already treats as
  informational, not a hard gate.

### Changed

- Flame Club now has 5 growth stages (Ember, Spark, Small Fire, Medium
  Fire, Full Campfire) instead of 3 — `flameStageFor` buckets progress
  evenly at 0/20/40/60/80% of the stamps required, mirroring how Plant/Cup
  already derive their 5 stages, and `FlameLayers` is redrawn with a
  woodpile base, a dim ember coal at the start, and a layered/colored
  flame cluster that grows through the later stages.
- Fill the Cup is redrawn: a single continuous rim outline instead of a
  floating ellipse, a saucer + pedestal foot for depth, a fixed (not
  brand-themed) coffee-color liquid palette that warms from dark espresso
  to caramel-tan latte as it fills, and a tulip-pour "done" flourish
  replacing the old two-circles-and-triangle shape.
- Sprout now restages so each of its 5 stages introduces exactly one new
  visual element instead of several overlapping across stages: the stem
  alone shoots up at Sprout (with a closed tip nub, no leaves yet), both
  leaf pairs arrive together at Leafing (stem height holds from here on),
  a small bud appears at Budding, and the bud opens into the full bloom at
  the final stage — fixing "Budding" being visually indistinguishable from
  "Leafing" before this change.
- Vendors can now choose a preset icon (gift, coffee, star, or heart) or
  their own profile photo to appear on each stamp instead of a plain dot,
  for plain-dot stamp cards. Picked from a new "Stamp mark" section on
  `/setup`, reflected immediately in its live preview, and shown the same
  way on the customer-facing `/c` card.

### Fixed

- Fourth round of user-reported follow-up: the win/lose result shown for
  Wheel could still be wrong/absent (no confetti even on a win), and the
  popup sat in a corner disconnected from the wheel itself. Root cause: the
  win/lose value was tracked as a _separate_ piece of state in `PreviewCard`
  that had to stay in sync with `Wheel`'s own async, variable-duration
  settle animation — two independently-updated sources of truth for the
  same fact is a real desync surface. `Wheel` now derives "won" itself,
  directly from the landed segment's `reward` flag, the instant it
  settles, and renders its own win/lose overlay directly on the wheel
  (matching how `CardBurst`'s confetti already overlays it) instead of a
  caller-positioned corner badge. `onSettled({won})` still exists so
  `PreviewCard` can gate the (shared, lives-at-that-level) celebration
  burst on "has the wheel actually finished," but the result itself has
  exactly one source now.
- Wheel segments' color picker is now a shadcn-composed `ColorPicker`
  (`ui/popover.tsx` + the `react-colorful` library, newly added) instead of
  a native `<input type="color">`, matching the rest of the app's shadcn
  styling rather than handing the picker UI to the OS/browser.
- Third round of user-reported follow-up on the card animation pass:
  - Wheel: the win/lose pill and celebration burst could appear (and the
    burst fully finish) well before the wheel had visually stopped
    spinning — they fired on the parent's fixed reveal timer, while the
    wheel's settle duration became a real, variable physics computation in
    the prior fix round and no longer necessarily matched it. `Wheel` now
    takes an `onSettled` callback, fired exactly when its own settle
    simulation finishes; `PreviewCard` gates both the pill and the burst
    on it for wheel views. (This was very likely also why confetti seemed
    to not show at all on a win — it burst and fully finished while the
    wheel was still visibly spinning, so by the time the wheel actually
    stopped there was nothing left to see.)
  - `CardShell`'s idle sheen (a drifting `conic-gradient` band) is removed
    entirely — it read as an ugly artifact ("irritating arrow-like shadow
    moving left and right"), not a holographic shine.
  - Sprout/Fill the Cup's `visits_to_bloom` field never had the 5/10/15
    quick-pick chips Stamp/Flame/Points Club's `stamps_required` field
    already had — a plain feature-parity gap. Added the same chips (6/10/15,
    within the field's 4-20 range).
  - Wheel segments can now take a vendor-picked color from a new
    `<input type="color">` swatch per segment in the setup editor —
    threaded through `SegmentInput`/`segmentInputSchema`/`buildChanceConfig`/
    `ChanceSegment`/`ProgressView` to `Wheel`'s rendering, with an
    outlined-white-text treatment so labels stay legible against any
    picked color. Falls back to the existing emerald/rose default when
    unset, so existing programs are unaffected.
- Second round of user-reported follow-up on the wheel/scratch-card fixes
  below — the first pass's fixes were real but insufficient:
  - Wheel: the free-spin phase and the settle phase were still two
    separately-eased CSS curves (just both via `transition` this time
    instead of `animate-spin`+`transition`), so the spin still read as
    "constant speed, then suddenly so fast" at the phase boundary — a
    fixed easing curve chosen without knowing the actual handoff velocity
    can't help but either restart slow or restart fast. Replaced with a
    `requestAnimationFrame`-driven real constant-angular-deceleration
    ("friction") physics simulation: the free-spin phase itself
    continuously decelerates from the first frame (not a flat constant
    speed), and the moment the target segment becomes known, a fresh
    physics solve reads the _exact_ velocity the free-spin phase had
    reached and computes a deceleration that brings the wheel to a dead
    stop precisely on target — continuing the same velocity across the
    boundary instead of restarting a new curve.
  - Wheel: reward vs. non-reward segments were a low-contrast gold/muted
    gray pairing that didn't read as an unambiguous win/lose signal.
    Reward segments now render emerald, non-reward segments render muted
    rose.
  - `ScratchCard`: the reveal only animated on the very first cycle — this
    component remounts fresh every scratch cycle, and it used a CSS
    `transition` for the reveal, which needs an already-committed "before"
    frame on the _same_ DOM node to interpolate from; a freshly mounted
    node's very first paint has no such prior frame, so the transition
    silently never played on cycle 2 onward. Replaced with a `@keyframes`
    `animation` (`.scratch-draw-in` in `globals.css`), which always plays
    its full declared timeline on a fresh element regardless of prior
    state — reliably replays every cycle.
  - `ScratchCard`: replaced the single clean zigzag reveal path with 3
    overlapping, staggered, irregular strokes of varying width, run
    through an SVG `feTurbulence`/`feDisplacementMap` filter that roughens
    each stroke's edge into a torn/scratched texture instead of a smooth
    round-capped line — closer to how an actual coin/fingernail scratch
    looks (uneven coverage building up over a few passes) than one
    uniform sweep.
- User-reported, post-deploy follow-up on the card animation-polish pass
  below: `CardShell`'s tilt set `transform-style: preserve-3d`, which
  combined with the same element's `overflow-hidden` is a documented CSS
  rendering conflict — the card visibly distorted/"expanded" whenever
  `CardBurst`'s celebration was active while tilted. Removed (children now
  correctly paint onto the tilted plane as a flat 2D surface, which is what
  a card-tilt effect should do anyway).
- The Wheel's spin read as choppy: the free-spin phase used a CSS
  `animate-spin` keyframe handed off to a separate settle `transition` once
  the result landed — a documented source of a visible jump, since the
  browser doesn't reliably carry the animation's current computed angle
  into the new transition. Replaced with one continuous,
  monotonically-increasing rotation value driven by React state +
  `transition-transform` throughout, so there is only ever one animation
  mechanism, never a handoff.
- The Wheel's landing also used an artificial "back-out" bounce (overshoot
  past the target, then rock back) that didn't read as real physics — a
  friction-decelerating wheel just slows smoothly to a stop, it doesn't
  spring past and rebound. Replaced with a strong `cubic-bezier(0.16,1,0.3,1)`
  ease-out (no overshoot), the curve real prize-wheel implementations use
  for friction-based deceleration.
- `ScratchCard`'s reveal ("a handful of diagonal capsule bars sweep in")
  didn't read as an actual scratch card. Replaced with an SVG mask
  revealed by a randomized, irregular "scratched by hand" path
  (`stroke-dasharray`/`dashoffset`, punching real transparent holes in the
  cover along the trail) instead of uniformly fading the whole cover's
  opacity.
- `CardBurst`'s reward celebration felt sparse. Bigger and more pieces (24
  → 40), randomized size (was a fixed 8px) and a mix of square/circle
  shapes, and a wider spread radius.
- `SupportForm`'s category `ToggleGroup` was missing `spacing={1.5}`,
  rendering the category buttons edge-to-edge instead of qkit's
  separated-pill layout.

### Changed

- Loyalty card visuals get their first animation-polish pass (see
  `docs/superpowers/specs/2026-07-25-loyalty-card-animation-polish-design.md`
  for the full design + research rationale — pure CSS, deliberately no new
  dependency, no three.js): a new shared `CardShell` wrapper
  (`src/components/card-shell.tsx`) gives every card type (stamp, flame,
  points, plant, cup, wheel, scratch, lucky) an idle holographic sheen and a
  capped pointer-tracking 3D tilt via one shared change in both `PreviewCard`
  (`/setup`) and `ProgramCardStatus` (real `/c` card); `LuckyBox` gets an
  idle shimmer (previously had no animation at all); `Wheel`'s settle
  transition now uses a "back-out" easing curve (slight overshoot, then
  rocks back) instead of a flat `ease-out`; `ScratchCard` plays a one-shot
  shine sweep across the revealed prize. All of the above are fully skipped
  under `prefers-reduced-motion`, matching the codebase's existing pattern.
- The dashboard account-menu's "Get help" item is no longer a plain
  `mailto:` link — it now opens a Sheet with `SupportForm`, letting a
  vendor pick a category (Program/cards, Customers, Pro plan, Something
  else) and write a message. Submissions go straight into the shared
  cross-kit `merqo.support_messages` inbox via a new `submit_support_message`
  RPC (`src/lib/merqo-support.ts`'s `submitSupportMessage`, same
  generic-over-caller's-client pattern as `merqo-vendor-feedback.ts`) —
  triaged from merqo's own cross-kit admin console, not a new loopkit
  `/admin` page; no new loopkit-side table or migration needed since there
  was no prior local support-message store to backfill.
- `FeedbackForm`'s NPS score picker and comment field now use shadcn
  `ToggleGroup`/`Textarea` instead of hand-rolled radio buttons and a plain
  `<textarea>`, matching `SupportForm` and qkit's equivalent component. No
  behavior, copy, or schema change.

- Vendor NPS feedback (the dashboard's "Share feedback" sheet) now submits
  into the shared cross-kit `merqo.vendor_feedback` table via a new
  `submit_vendor_feedback` RPC, instead of loopkit's own local
  `loopkit.feedback` table. `loopkit.feedback` stops receiving new rows —
  existing rows were one-time backfilled into `merqo.vendor_feedback`
  (migration `0030`) so no historical feedback is lost. Implemented via
  `src/lib/merqo-vendor-feedback.ts`'s `submitVendorFeedback`, mirroring
  `merqo-vendor-profile.ts`'s existing generic-over-caller's-client RPC
  pattern. No user-facing change to the feedback form itself; the
  SECURITY DEFINER RPC (not app code) is the new authorization boundary,
  writing `auth.uid()` as `vendor_id` itself rather than trusting a
  passed-in value.
- Lucky Tap now renders its own "tap for a surprise" mystery-box visual
  (`LuckyBox`) instead of sharing the generic stamp-dots counter with real
  stamp/plant cards. This changes the **live customer-facing card** (`/c`)
  for any vendor with an active Lucky Tap program today — not just the
  `/setup` preview — via a new `kind: "lucky"` engine `ProgressView`
  (`visitsSinceWin`/`pityCeiling`) in place of the old `kind: "dots"` shape.
  The `/setup` preview's win/lose pill now also fires on Lucky Tap ticks,
  reusing the same pill Wheel/Scratch already show (Lucky Tap does not get
  the reveal-animation delay those two do — its tap stays instant).
- `/setup`'s live preview for Chance Card (Wheel/Scratch) program types now
  plays a reveal animation when showing the rolled result: the Wheel visibly
  spins in place, or the Scratch Card displays animated scratch-mark strokes
  sweeping across the cover, while the result is held back for ~1.4 seconds
  (a new "revealing" phase); the win/lose signal now appears in sync with the
  animation completing, replacing the instant snap-to-result. Presentation-only
  for the preview — does not affect when or how the real chance roll happens
  for customers (still server-side at scan time). Implemented via
  `usePreviewAnimation`'s new revealing-phase hold, `Wheel`'s previously-unused
  `spinning` prop wired up, `ScratchCard`'s `scratching` state, and new
  `@keyframes scratch-stroke-sweep` in `globals.css`.
- `/setup`'s Chance Card (Wheel/Scratch) Basics segment editor now displays
  live win-chance percentages: an "Overall win chance: NN%" summary above the
  segment list, and an "≈NN%" badge next to each segment's weight input.
  Implemented via new pure helpers `segmentWinPercent`/`overallWinPercent` in
  `src/lib/program-config.ts` (using the same weight math that `chance.ts`'s
  `pickSegment` uses internally to determine winners). The weight input itself
  is unchanged — this display is additive, letting vendors see actual odds
  instead of raw weight numbers.
- `/setup`'s Basics/Rules copy trimmed to one short line per field; longer
  rationale or edge-case explanations (head-start's completion-lift claim,
  the wheel/scratch odds-weight meaning, how card-expiry differs from
  reward-expiry) moved into a new tap-to-open `(i)` info tooltip
  (`InfoTooltip`, `ui/popover.tsx`) instead of a second paragraph or a
  hover-only native `title` attribute, which never worked on mobile.

### Fixed

- The dashboard account-menu trigger showed only the bare avatar — the
  stall name was visible only once the dropdown was opened, unlike qkit's
  trigger which shows the name (or an "Account" fallback) plus a chevron
  beside the avatar at `md:` and up. Now matches.
- The dashboard account-dropdown label leaked the vendor's email — as the
  primary line when no stall name was set, or as the subtitle when one
  was. Now matches qkit's dropdown exactly: stall name (or a "Your stall"
  placeholder) as the primary line, a static "Vendor account" subtitle
  always, no email in either.
- `/dashboard/profile`'s two-column layout used CSS `columns-2` (visual
  order could drift from DOM/tab order) with the wrong section order;
  rebuilt onto two independent flex-column stacks with the locked
  cross-kit order (column 1: stall name, profile icon, change password;
  column 2: display name, social links).
- The dashboard's shared shop QR block overflowed its card on mobile: the
  link-text container's parent used `items-start` in the mobile
  (`flex-col`) layout, which sizes flex children to their own content
  width rather than the container's width, so `min-w-0`/`truncate` on the
  long URL never actually took effect. Fixed with a `self-stretch`
  (mobile) / `self-auto` (`sm:` and up) override.
- `/dashboard/customers`'s program-switcher + search row could overflow on
  narrow phones (the search `<input>` had no `min-w-0`, so it refused to
  shrink below its intrinsic width, pushing the Search button off-screen);
  now stacks the switcher above a full-width search form below the `sm`
  breakpoint, matching the activity filters' existing mobile pattern.
- `/dashboard/activity`'s program switcher sat as a bare, unlabeled,
  differently-styled control (no border/shadow, no shared card) next to
  the bordered/shadowed `ActivityFilters` card, and didn't stack full-width
  on mobile like the filter fields did. `ProgramSwitcher` now composes as
  that card's first field (a "Program" label + trigger matching Type's
  styling and mobile stacking) instead of a separate sibling — `ProgramSwitcher`
  gained optional `triggerId`/`triggerClassName` props for this, defaulting
  to its existing bare look on Customers/Stats.
- `GET /api/merqo/vendor-status` and the `/admin` console's vendor-email
  lookup (`admin-data.ts`) both only ever read the first 1000 auth users
  (`listUsers`' default page size) — past that, a vendor would silently
  resolve as "inactive" to merqo, or go missing from the admin console.
  Extracted a shared `listAllUsers()` (`src/lib/list-all-users.ts`) that
  paginates to completion; both call sites now use it.

### Added

- `Stats` gains an "Expired unclaimed (30d)" tile, sourced from the
  `reward_vouchers` ledger (`countExpiredVouchers`) — added alongside,
  not replacing, the existing `stamp_events`-sourced `rewards30d`/
  `redemptionRate` tiles, per
  `docs/superpowers/specs/2026-07-16-reward-voucher-ledger-design.md`'s
  explicit decision not to risk a regression migrating those.
- Test coverage for the `/admin` console's data layer (`admin.ts`,
  `admin-data.ts`) and `rate-limit.ts`, previously untested — the one
  surface handling cross-vendor sensitive data had zero automated
  coverage.
- `e2e/route-protection.spec.ts`: signed-out redirects for
  `/dashboard`/`/setup`, a signed-out 404 for `/admin`, and the
  no-DB-call fallback copy for `/c`/`/earn` without their required query
  param — the e2e suite's first coverage of anything beyond the public
  landing/login smoke pages.

### Changed

- Theme rewritten from "Mulberry & Gold" to "Raspberry-Rose Punch & Gold" —
  a deep-research pass (BMC Psychology 2025; Royal Society Open Science
  2023, both adversarially verified) found brightness and saturation, not
  hue family, are the dominant drivers of whether a color reads as
  "rewarding"/"celebratory" vs. "moody," and that darkness itself isn't
  disqualifying, only darkness combined with low saturation. `--primary`
  moves from a dark, desaturated magenta-plum (`oklch(0.4 0.12 350)`
  light / `oklch(0.63 0.15 350)` dark) to a substantially brighter, more
  saturated raspberry-red (`oklch(0.6 0.19 15)` light /
  `oklch(0.68 0.17 15)` dark) — warmer and clear of qkit's ember hue range
  (~45-60°). Dark mode's canvas stays genuinely dark (not just lightened)
  but warmly tinted, with the brightness/saturation the "celebratory" read
  depends on concentrated in `--primary`/`--ring`, matching how real
  gamified-reward products (Duolingo) pair a bright saturated core hue with
  a bold accent rather than a dark muted one. `--destructive`'s hue nudged
  27°→32° to stay clearly distinct from the new, much-closer primary hue.
  The gold reward accent is unchanged. The favicon/brand-icon
  (`src/lib/brand-icon.tsx`, `BRAND_MULBERRY` renamed `BRAND_RASPBERRY`)
  and the root `global-error.tsx` fallback (hand-converted hex, can't use
  CSS variables) both updated to match.
- App-wide UI-UX consistency pass: dashboard sub-pages (stats, customers,
  activity, plan, settings), the admin console, and the auth forms now use
  the `ElevatedCard`/`Section` visual language introduced for
  dashboard/setup/profile — presentational only, no behavior or copy
  change. Fixed the activity filters wrapping awkwardly on narrow phones
  (fields now stack full-width below the `sm` breakpoint). Rebuilt
  `/earn`'s customer-facing form onto shadcn components (previously the
  one hand-rolled, unstyled form in the app), with new test coverage.

### Added

- Reward-voucher ledger (`loopkit.reward_vouchers`, migration
  `0027_loopkit_reward_vouchers.sql`): every earned reward across all
  program types (Stamp, Plant, Wheel, Scratch, Lucky) now creates a voucher
  row with `active`/`redeemed`/`expired` status. Redeem actions now require
  an active, non-expired voucher rather than only checking raw
  `stamp_count`/`growth` against the threshold.
- New `programs.reward_expiry_days` config (1–3650 days, optional) lets
  vendors set an expiry window for unclaimed Stamp/Plant rewards. Expiry is
  checked lazily — on `add_stamp`, Plant's `apply`, and the counter's
  lookup action — and forfeits the expired voucher's threshold worth of
  `stamp_count`/`growth` (floored at 0). No cron job required.
- Setup form: new reward-expiry field for program types that support it.
- Profile settings: a new "Social & website" section (website/Instagram/
  Facebook/TikTok), backed by the shared `merqo.vendor_profile` table
  loopkit already partially used (`/setup`'s vendor-name seeding). Ported
  from qkit's identical feature.

### Changed

- Auth code (`src/lib/auth.ts`, `src/app/login/actions.ts`, and the
  login/reset-password UI) moved into `src/features/auth/` — a pure
  code-location migration, no behavioral change. External consumers now
  import from `@/features/auth`.
- Card-check code (`src/app/c/actions.ts`, `check-form.tsx`,
  `program-card-status.tsx`, `status-state.ts`) moved into
  `src/features/card-check/` — a pure code-location migration, no
  behavioral change. `src/app/c/page.tsx` now imports `CheckForm` from
  `@/features/card-check`.
- Sprout (Plant) and Fill the Cup (Cup) progress visualizations now grow
  smoothly and continuously between visits instead of snapping to each new
  stage: Cup's liquid-fill transition widens from 500ms to 1600ms, Plant's
  stem now animates via a `scaleY` transform (previously it didn't animate
  at all — its old resized-`<line>` approach used non-CSS-animatable
  endpoint attributes), leaf pairs fade in one at a time without
  repositioning already-placed leaves, and both components' final-stage
  treat (bloom / latte-art) fades and scales in instead of popping. Purely
  visual/timing — no prop or behavioral changes, so this applies wherever
  these components render (`/setup`'s live preview, the vendor's
  serve-customer stamp screen, and the customer's `/c` card view).
- Dashboard: the vendor's program card is now tappable anywhere to open its
  counter page, replacing the separate "Open Counter" button. The pencil
  edit link stays independently tappable. A small chevron signals the card
  opens something.
- `/setup` no longer shows the "Your programs" management list alongside
  the create form (or any other action view) — bare `/setup` is now a
  clean create/upsell page, and the list moved behind a new
  `/setup?manage=1` view reached via a new "Manage your programs" link.
- `/setup`'s card-type picker now groups its 8 styles into 4 families
  (Stamp Card, Growth, Points Club, Chance Card) with a style sub-step,
  instead of one flat grid of 8 tiles. Flame Club moved from Stamp Card
  into a new Growth family (alongside Sprout and Fill the Cup); Points Club
  became its own single-style family (previously sharing Stamp Card); Lucky
  Tap moved from a standalone family into Chance Card (grouping the three
  random-draw-per-visit mechanics: Wheel, Scratch, Lucky Tap). Purely a
  picker UI change — every family/style combination still saves the exact
  same `type`/`variant` pair as before (e.g. Stamp Card → Dots still saves
  `type=stamp, variant=dots`; Growth → Flame still saves
  `type=stamp, variant=flame`), so existing programs and the engine are
  unaffected.
- New shared `Section`/`ElevatedCard` primitive (rounded corners, soft
  lifted shadow, icon-badge header) replaces the plain `Card`-based blocks
  on profile settings, the dashboard, and `/setup`'s create-card form.
  Deliberately not qkit's scalloped "kitchen ticket" look — that's
  food-stall-specific branding qkit owns; loopkit borrows only the
  spacing/hierarchy pattern.
- Dashboard: the Shop QR block and "Scan a customer" button are now a
  side-by-side quick-actions row instead of two stacked full-width blocks
  (stacks back to full-width on mobile), and the program grid now has a
  "Your programs" heading.
- `/setup`'s live preview now docks in a sticky side column on desktop
  instead of scrolling away while filling in a long Rules section (e.g.
  the Wheel/Scratch segment editor); the type picker, Basics, and Rules
  cards become one flowing main column instead of a 2-column split.
- Stall name now reads from and writes to the shared `merqo.vendor_profile`
  table (matching qkit's own cutover) instead of the local
  `loopkit.vendors.name` column — social links already worked this way.
  Mobile burger menu moved to the left of the header (next to the wordmark,
  matching qkit) instead of next to the account avatar, and gained a
  tap-away scrim. The program-switcher dropdown on Stats/Customers/Activity
  now renders below the page header instead of above it.

### Fixed

- `.claude/worktrees/` is now excluded from `.gitignore`, `eslint.config.mjs`,
  and `tsconfig.json` — previously only `.prettierignore` knew about it, so
  a sibling worktree's un-migrated source could trip false-positive lint
  errors on a fresh checkout.
- `/setup`'s "Schedule retirement" action was silently unreachable for Pro
  vendors — `canCreate` is unconditionally true for Pro (unlimited
  programs), so the old view-routing check let it always win over the
  `schedule` query param, showing the create form instead. Fixed via a new
  `resolveSetupView` precedence that gives explicit query-param intents
  priority over the ambient `canCreate` default.
- Opening any Radix dropdown/dialog (e.g. the dashboard's account menu)
  could visibly shift the centered page content, since the scrollbar's
  gutter wasn't reserved ahead of time — `scrollbar-gutter: stable` now
  keeps that space allocated whether or not a scrollbar is actually shown.
- Dashboard's Shop QR + Scan quick-actions row could stretch wider than its
  card (pushing the QR link/labels past their intended width) — the two
  flex children were missing `min-w-0`, so neither could shrink below its
  content's natural width.
