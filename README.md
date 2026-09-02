# loopkit

Digital stamp-card loyalty for SG small vendors. A Merqo kit — owns the
`loopkit` schema in the shared Merqo Supabase project, reports metrics to
merqo over HTTP. Browser-tab title follows the cross-kit "Name | Tagline"
Title Case convention: "Loopkit | Loyalty Cards". Display font is Fraunces
(`src/app/layout.tsx`), the shared family face every Merqo kit now uses —
see `docs/business/2026-08-13-typography-family-standard.md` in the
workspace root for why. The landing page's
footer matches qkit's exactly (single-row wordmark/tagline/copyright/
sign-in link, no CTA band above it) and its `BackToTop` button matches
the cross-kit landing-page parity pass. In production, the Supabase auth
cookie is scoped to
`.merqo.io` (`NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`, `src/lib/supabase/`), so
signing in on one Merqo kit signs you in on the rest. `/login` now offers
only Google OAuth and email/password, matching every sibling kit — a
name+phone anonymous-session onboarding option unique to loopkit was
removed (`src/features/auth/README.md`). `admin_audit`'s
coverage now extends past `/admin` (merqo's own `/api/merqo/vendor-provision`
write is recorded too, attributed via a `merqo_system` sentinel), it's now
readable via the `/admin/activity` tab (`@merqo/ui`'s shared `AuditLogTable`
— see `src/app/admin/activity/README.md`), the activity/programs/vendors
admin tables now render via `@merqo/ui`'s shared `DataTable`. `/admin/activity`
and `/admin/vendors` reach those Client Components through a small
`"use client"` wrapper each (`activity-log.tsx`, `vendors-table.tsx`) that
owns the callback props, since a Server Component can't pass a function
across the client boundary. The audit table
is append-only at
the grant level (`service_role` can no longer `UPDATE`/`DELETE` it, only
`SELECT`/`INSERT`) — see `AGENTS.md`'s data
model section for the retention policy. `GET /api/merqo/vendor-activity`
gives merqo's cross-kit vendor detail view real per-vendor loyalty activity
(programs, cards, stamps/rewards in the last 30 days) instead of nothing —
see `src/app/api/merqo/vendor-activity/README.md`. No per-IP rate
limiting on public actions (never provisioned in production, so it was a
fail-open no-op) — `supabase/config.toml` matches the local-dev CLI
config the other 4 Merqo kits already share. The dashboard's onboarding
tour (`src/components/dashboard-tour.tsx`) stamps its "seen" state as
soon as it auto-runs rather than when it finishes, via a `keepalive` POST
to `src/app/api/tour-seen/` rather than a Server Action. That client-fired
stamp is still fire-and-forget, so a fast page refresh can complete before
it lands — `src/app/dashboard/layout.tsx` now also calls
`src/lib/tour-prefs.ts`'s `stampTourSeen` directly, synchronously, as part
of its own server render, closing that race for good. The tour's first-step
"example card" progress text renders the real `stampStrategy.progress()`
output instead of a hand-copied string, so it can't drift from what the
engine actually computes — see
`../docs/superpowers/specs/2026-08-25-tour-example-badge-drift-fix-design.md`
in the workspace root. Migrated onto
the shared `@merqo/ui` component package (v0.14.0, `package.json`): the
dashboard nav/account dropdown, `useAsyncAction`, `InfoTooltip`,
`ImageUploader`, `DashboardTour`, `PricingForm` (the `/admin` pricing
section, `src/app/admin/pricing-form-client.tsx`), the landing page's
sticky header (`LandingNav`, via `src/components/landing/nav.tsx`), and
the profile page's two-column layout all now delegate to `@merqo/ui`'s
versions — see `AGENTS.md`'s File Layout and this README's Data model
section below for what's still loopkit-local (`ElevatedCard`, the upload
adapter, step/action wiring). `DashboardNav`'s wrapper
(`src/app/dashboard/dashboard-nav.tsx`) passes `LinkComponent={Link}`
(v0.10.0+) so the package renders `next/link`'s `Link` instead of a
plain `<a>` for its nav links and the `AccountMenu` it composes
internally (loopkit has no standalone `AccountMenu` usage) — dashboard
nav clicks are client-side transitions again, not full-page reloads.
The account dropdown also renders a "Switch products" submenu
(`@merqo/ui` v0.13.0's `switchKits` prop, resolved via v0.14.0's
`getSwitchKits("loopkit")` helper against its centralized `KIT_FAMILY`
registry rather than a locally hardcoded list) pointing at the other three
live Merqo kits (qkit, paykit, stockkit) — no live API call and no
per-vendor filtering, since SSO already signs a vendor in on every kit and
each kit's own dashboard handles a signed-in vendor without that kit's
vendor row gracefully. Bumped to v0.14.1: `KIT_FAMILY` had pointed each
kit at its `-sg.vercel.app` deployment host, a different domain from the
shared-session cookie's `.merqo.io` scope, bouncing a switching vendor
into a login loop — now points at each kit's real `<kit>.merqo.io` domain.
Every `/dashboard` page now shares one canonical `max-w-7xl` content
container set at the layout level (`src/app/dashboard/layout.tsx`,
matching qkit's `dashboard/layout.tsx` pattern) instead of each page
picking its own width — a page whose content genuinely reads better
narrower (profile, counter, plan, settings) still nests its own
narrower wrapper `<div>` inside that shared container. loopkit no longer
runs its own Telegram bot for reward-redemption vendor alerts — that
retired Phase A infrastructure (deep-link QR, own webhook/tables) has
been replaced by a call to merqo's own shared bot (Phase A2); see "Data
model" below. Bumped `@merqo/ui` to v0.16.0: `/dashboard/plan`'s Free/Pro
feature comparison grid now renders through the package's shared
`PlanComparisonTable` (matching qkit's own migration onto the same
component) instead of a local `FEATURES`-rendering grid + local `Cell`
helper — see `src/app/dashboard/plan/README.md`. Bumped `@merqo/ui` to
v0.18.0 for its built-in, always-rendered `AccountMenu` Light/Dark/System
theme control (`next-themes`' `useTheme()`); `src/app/globals.css` moved
its dark-mode tokens from pure `@media (prefers-color-scheme: dark)` CSS
to a `@custom-variant dark` + `.dark`-class approach, and
`src/app/layout.tsx` now wraps `<Providers>` in `next-themes`'
`ThemeProvider` (`attribute="class"`, `defaultTheme="system"`) so that
control actually works — OS-auto behavior is unchanged, this only adds a
manual override. Bumped `@merqo/ui` to v0.19.0: the theme control now sits
behind a collapsed "Theme · {current}" submenu (matching the existing
"Switch products"/"Get help" pattern) instead of three always-expanded
radio options. Bumped again to v0.20.0: the vendor stats page's tile now
wraps `@merqo/ui`'s new shared `StatTile`/`DeltaPill` content instead of a
fully local implementation, no visible change. Cup, Plant/Sprout, and
Flame Club's progress visuals were redesigned as hand-drawn SVG art with
real stage-to-stage growth transitions, replacing the earlier flat-shape/
icon-cluster placeholders (`src/components/README.md`), plus two
fast-follow rounds fixing Plant's leaf positioning/Flame's icon size, then
Flame's grow direction, Plant's idle sway, Cup/Flame's on-screen scale, a
mislabeled cup stage, and Plant/Cup's missing progress counter, plus a fix
for the dashboard onboarding tour re-triggering on every load for any
vendor who'd never visited `/profile` (`src/lib/README.md`). See
`CHANGELOG.md`
for the latest changes, including deduplication of the
shared bearer-auth and Merqo-RPC-call helpers, the addition of
templateCentral 5.13.0's comment-hygiene enforcement layer, and a fix
restoring card/background contrast (both modes) after the Sealing Wax
rebrand had accidentally collapsed them to the same color, plus follow-up
passes that widened both deltas further. Flame/Sprout/Cup's setup preview
now defaults to 5/5 (was a mixed 5/6/10), and Flame Club's own layer
dropped its duplicate stage/count label (`src/components/README.md`).

Vendors run a stamp/points program from `/dashboard` (programs, cards,
stamping, flame progress, "lucky" chance rewards); customers collect and view
cards from a phone-friendly `/c` flow via QR. A vendor's day-2 correction
tool for a classic Stamp card — a reasoned `+`/`-` adjustment, not a full
card reset — lives on each customer's own `/dashboard/customers/[phone]`
detail page, alongside their cards across every program and full activity
history. First-run program creation at `/setup` walks through a real
Type → Basics → Rules step sequence instead of one long page — editing an
existing program keeps the original single-page layout. Includes a
scratch-card /
wheel reward layer, tiered plans, and an admin console for vendor
management. `/setup`'s type picker groups by mechanic, not raw DB type —
Stamp Card, Growth (Flame Club/Sprout/Fill the Cup), Points Club, and
Chance Card (Wheel/Scratch/Lucky Tap) — whose Basics editor shows odds as a
live percentage, not a raw weight, and whose `/setup` preview plays a spin/
scratch reveal animation before the win/lose result lands. Lucky Tap renders
its own "tap for a surprise" mystery-box visual (`LuckyBox`), on both the
preview and the real `/c` card, instead of the generic stamp-dots counter
real stamp/plant cards use. Every card type shares one `CardShell` wrapper
(`src/components/card-shell.tsx`) giving it a capped pointer-tracking 3D
tilt — pure CSS, deliberately no three.js/animation-library dependency
(see `docs/superpowers/specs/2026-07-25-loyalty-card-animation-polish-design.md`).
The Wheel drives its spin via a real `requestAnimationFrame` physics
simulation (not CSS), owns its own win/lose result overlay (derived
directly from the landed segment, rendered on the wheel itself), and its
segments can take a vendor-picked color via `src/components/color-picker.tsx`
(a shadcn-composed picker using the `react-colorful` library — shadcn/ui
has no official color-picker primitive). The dashboard's
account-menu trigger, order, and content
deliberately mirror qkit's (see `src/app/dashboard/dashboard-nav.tsx`) — a
cross-kit consistency goal, not a coincidence. Theme is "Sealing Wax" (`src/app/globals.css`, as of 2026-08-19) — an
oxblood-crimson primary plus an antique-brass counter-tone, pushed
darker/denser than the prior "Raspberry-Rose Punch & Gold," which itself
had replaced the earlier, dimmer "Mulberry & Gold" chosen to read as
celebratory rather than moody-fintech. `src/lib/brand-icon.tsx`'s
ImageResponse-generated favicon/apple-touch-icon carries the same
rebrand. Form fields keep their
primary copy to one short line, pushing rationale/edge-case detail into a
shared tap-to-open `(i)` info tooltip (`@merqo/ui`'s `InfoTooltip`).
The login form (`src/features/auth/components/login-form.tsx`) runs on
React Hook Form + Zod (a `loginSchema` in `src/lib/schemas.ts`) with a
`zodResolver`, surfacing auth/server errors via sonner toasts rather than
an inline alert paragraph; its post-navigation success branches `await`
`navigatingAway()` (`src/hooks/use-async-action.ts`) so the submit button
doesn't visibly re-enable mid-transition to `/dashboard`. Google OAuth
sign-in forces the consent screen to English (`hl=en`), matching the
same fix in paykit/merqo. The vendor-wide `/dashboard/stats` page now
also shows a "By mechanic" breakdown (`src/lib/stats.ts`'s
`getVendorMechanicBreakdown`) — which of Stamp/Growth/Chance Card is
actually driving redemption, shown only when a vendor runs 2+ mechanics.
Stamp programs can also opt into a birthday bonus (migration `0041`,
`loopkit.set_customer_birthday` + a lazy check-on-next-visit trigger on
`stamp_events`) — see `src/features/card-check/README.md`.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 ·
shadcn/ui (new-york) · React Hook Form · Zod · Supabase (`@supabase/ssr`) ·
Vitest · pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev            # dev server — http://localhost:3000
pnpm build          # production build
pnpm test           # run test suite (vitest)
pnpm test:mutation  # stryker mutation testing (scoped to src/lib; advisory)
pnpm test:e2e       # playwright e2e smoke (needs local Supabase up)
pnpm check          # prettier --check + eslint + tsc --noEmit
pnpm format         # prettier --write
```

## File layout

```
src/app/dashboard/     — vendor console (programs, cards, stats)
src/app/c/              — customer-facing card view (QR entry point)
src/app/admin/          — Merqo-team admin console
src/app/setup/          — vendor onboarding
src/app/login/          — auth pages
src/lib/engine/         — stamp/points/lucky-reward core logic
src/lib/program.ts      — program CRUD + rules
src/lib/cards.ts        — customer card state
src/lib/loyalty.ts      — stamping/redemption flow
src/lib/stats.ts        — vendor-facing metrics
src/lib/merqo-customer-notify.ts — notifyCustomerByPhone/notifyVendor: kit → merqo HTTP calls (customer Telegram reuse + vendor alerts via merqo's shared bot)
src/lib/merqo-vendor-status.ts — reports status/metrics to merqo over HTTP
src/lib/supabase/       — browser / server / service clients (schema: loopkit)
src/components/         — wheel, scratch-card, flame-layers, cup, points-bar, stamp-dots, etc.
supabase/migrations/    — SQL schema + RLS
```

## Data model

Owns the `loopkit` schema in the shared Merqo Supabase project. All
Supabase clients are scoped to `db: { schema: "loopkit" }` — loopkit never
reads/writes another kit's schema (e.g. qkit's) directly. Cross-kit data
goes over HTTP (the merqo metrics API), except four deliberate exceptions,
all same-Postgres-instance `SECURITY DEFINER` RPCs, never a raw
cross-schema query: a vendor's stall name and social links live in the
shared `merqo.vendor_profile` table (`get_or_create_vendor_profile`/
`upsert_vendor_profile`, see `src/lib/merqo-vendor-profile.ts`); vendor NPS
feedback (the dashboard's "Share feedback" sheet) is submitted straight
into the shared `merqo.vendor_feedback` table (`submit_vendor_feedback`, see
`src/lib/merqo-vendor-feedback.ts`) instead of a local table — loopkit's own
`loopkit.feedback` table is now historical-only (one-time backfilled into
`merqo.vendor_feedback` by migration `0030`); the dashboard's "Get
help" Sheet (`@merqo/ui`'s `HelpSheet`, opened from `dashboard-nav.tsx`'s
`AccountMenu`) submits straight into the shared `merqo.support_messages`
inbox (`submit_support_message`, see `src/lib/merqo-support.ts`) —
triaged from merqo's own cross-kit admin console, with no loopkit-side
table at all; and customer identity is mirrored into the shared
`merqo.customers` table (migration `0035`) by the same two SQL triggers
that already sync loopkit's own local `loopkit.customers` table on card/
stamp-event inserts (`loopkit.sync_customer_on_card`/
`sync_customer_on_activity`, called from a trigger body, not application
code) — additive only, loopkit's own dashboard still reads
`loopkit.customers` directly, and the write is guarded to silently no-op
if `merqo.upsert_customer` doesn't exist (a loopkit-only local `supabase
start` has no merqo schema at all). See
`docs/business/2026-07-21-profile-settings-page-standard.md` (in the parent
`Merqo Business/docs/` repo) for the locked cross-kit pattern.

loopkit's first-ever live price ships as a single-row, admin-tunable
`loopkit.pricing` table (migration `0034`, seeded at $4.99/mo, no write
RLS policy — writes only via the service-role `setPricing` admin action,
`src/lib/pricing.ts`/`src/app/admin/actions.ts`). `/admin` shows a
`PricingForm` section to retune it with no redeploy, and `/dashboard/plan`
reads the live value in place of the previous no-price copy. The manual
"ask us to upgrade" grant flow (`requestUpgrade`/`UpgradeCta`/
`setVendorPro`/`resolveUpgradeRequest`) is unchanged — this is a display
change, not real Stripe billing.

Reward-redemption vendor alerts route through merqo's own shared Telegram
bot (Phase A2, `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`):
`redeemAction` calls `notifyVendor` (`src/lib/merqo-customer-notify.ts`),
which posts to merqo's `POST /api/merqo/notify-vendor` (bearer
`MERQO_CUSTOMER_SECRET`, same env vars as the customer notify call below).
loopkit no longer runs its own Telegram bot/webhook/tables for this — that
retired Phase A infrastructure (`loopkit.vendor_telegram`/
`loopkit.telegram_link_tokens`, migration `0036`, dropped by migration
`0037`) required a vendor to connect once via a loopkit-hosted deep-link QR;
a vendor who'd linked loopkit's own bot must reconnect once via merqo's own
profile page instead — no data carried over. A missing connection or a send
failure is caught and logged, never affects `redeemAction`'s own returned
result.

`redeemAction` also calls `notifyCustomerByPhone` (`src/lib/merqo-customer-notify.ts`)
as a sibling to that vendor alert — loopkit's reuse-only half of the
cross-kit customer Telegram-connect design. It posts to merqo's
`/api/merqo/notify-customer` in its `phone` lookup mode (bearer
`MERQO_CUSTOMER_SECRET`, both env vars optional) so a customer who already
connected Telegram via qkit _with a matching phone number_ also gets a
redemption confirmation — no connect flow on loopkit's side, and a failure
never affects `redeemAction`'s own returned result. See
`docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`.

That call is gated by a fast-follow vendor-level on/off toggle
(`loopkit.vendor_notify_settings`, migration `0038`; default on, opt-out —
the customer already consented by connecting Telegram, this only lets a
vendor who finds it off-brand turn it off): `redeemAction` reads the
vendor's row via `customerNotifyEnabled` and skips the call only when a
row exists AND the flag is explicitly `false` — a vendor with no row at
all (never visited `/dashboard/settings`) still gets the call. A vendor
flips it from a switch there (`src/app/dashboard/customer-notify-settings.tsx`,
`saveCustomerNotifySettingsAction`), which upserts its own row directly
under RLS (`for all` own-row policy, not service-role-only). See
`docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`.

Separately, a Pro vendor can let customers earn a stamp from a completed
qkit order (`src/app/dashboard/qkit-earn-settings.tsx`) — this is a pull-model
claim link, not push automation: qkit shows an "Earn a stamp" link on the
customer's order page, which sends them to loopkit's own `/earn?order=...`
page to enter their phone number and claim it (`src/app/earn/`), rather than
the stamp being awarded automatically the moment the qkit order completes.

Host/couple-facing referral mechanic for event-cart vendors (migration
`0040`, `src/app/dashboard/referrals/`): a wedding guest is a one-off the
vendor will likely never see again, but the host (bride/groom/organizer) who
chose this vendor is a real repeat/referral relationship worth rewarding.
This is credit-routing on an EXISTING program a vendor already runs, not a
sixth engine `type` — `loopkit.referral_hosts` (`vendor_id`, `program_id`,
`host_phone`, `label`, a unique `referral_code`, `guest_count`) names one of
the vendor's own active programs plus a host phone, and the vendor shares
the resulting `/c?v=<vendorId>&ref=<code>` link. `checkStatusAction`
(`src/features/card-check/api/actions.ts`) calls `vendor_join_referred`
instead of plain `vendor_join` whenever a `ref` is present (falling back to
`vendor_join`, unchanged, otherwise) — both now share their enrollment/read
logic via `vendor_join_enroll`/`vendor_join_cards`. `vendor_join_referred`
scopes the referral-code lookup to the calling `p_vendor`, so a code minted
by one vendor can never credit anything at another; a guest referring
themselves (`guest phone == host phone`) is a no-op; and `loopkit.
referral_credits` (unique on `(referral_host_id, guest_phone)`) ensures a
host is credited only the first time each distinct guest phone joins via
that link. Stamp-type programs are credited inline (mirroring `add_stamp`'s
own body, minus its vendor-session gate — this path is anonymous/public);
every other type needs the TypeScript engine's `applyVisit` to compute the
next state, so `vendor_join_referred` only _reserves_ the credit and
`checkStatusAction` finishes it via `apply_referral_credit`, the same
read-compute-persist shape `recordVisitAction` uses for a vendor-triggered
visit. VIP tiers, birthday rewards, and wallet passes are separate,
out-of-scope roadmap items.

## Docs

- Deploy runbook: `docs/DEPLOY.md`
- Plans/specs: `docs/superpowers/`
- Release history: `CHANGELOG.md`
- Dependency security overrides (force-patched transitive CVEs, each
  scoped/commented with its advisory ID, e.g. nanoid GHSA-2v37-7h3g-55p8):
  `pnpm-workspace.yaml`. `pnpm audit --prod --audit-level=high` is CI's hard
  gate (`security.yml`) — bump the relevant floor there when a new advisory
  lands rather than waiting on the upstream package to update.

See `AGENTS.md` for full engineering rules, harness details, and skills.

## Structure

### Contents

- `.claude/` — Claude Code harness: hooks, project skills, harness manifest
- `.github/` — CI workflows
- `.husky/` — git hook scripts (pre-commit/commit-msg/pre-push)
- `docs/` — deploy runbook, superpowers specs/plans, CONSTITUTION
- `e2e/` — Playwright end-to-end smoke + signed-out route-protection tests (both run without Supabase provisioning)
- `src/` — application source (App Router pages, lib, components)
- `supabase/` — SQL migrations and seed data
- `test/` — Vitest unit/integration tests

### Connectivity

`src/app/` (App Router pages) composes from `src/lib/` (domain logic, Supabase
clients, the stamp/points/lucky engine) and `src/components/` (shared UI).
`supabase/migrations/` is the schema `src/lib/types.ts` mirrors by hand and
`src/lib/supabase/` connects to at runtime. `test/` mirrors `src/`'s
structure one-to-one for unit/integration coverage; `e2e/` drives the app
as a browser would, independent of that structure. `.claude/` and
`.github/` are the enforcement layer around all of the above — they gate
what can be committed/merged but contain no application logic themselves.
