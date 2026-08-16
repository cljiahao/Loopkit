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
signing in on one Merqo kit signs you in on the rest. No per-IP rate
limiting on public actions (never provisioned in production, so it was a
fail-open no-op) — `supabase/config.toml` matches the local-dev CLI
config the other 4 Merqo kits already share. The dashboard's onboarding
tour (`src/components/dashboard-tour.tsx`) stamps its "seen" state as
soon as it auto-runs rather than when it finishes, via a `keepalive` POST
to `src/app/api/tour-seen/` rather than a Server Action, so the write
survives not just a mid-tour refresh but a hard-navigation page unload,
which mattered because `@merqo/ui`'s shared `DashboardNav` defaulted to
plain `<a>` nav links (root cause, now fixed — see below). Migrated onto
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
vendor row gracefully.
Every `/dashboard` page now shares one canonical `max-w-7xl` content
container set at the layout level (`src/app/dashboard/layout.tsx`,
matching qkit's `dashboard/layout.tsx` pattern) instead of each page
picking its own width — a page whose content genuinely reads better
narrower (profile, counter, plan, settings) still nests its own
narrower wrapper `<div>` inside that shared container. `/dashboard/settings`
also gained a "Connect Telegram" section: a vendor scans a deep-link QR
once (`src/app/dashboard/settings/connect-telegram-section.tsx`, reusing
the existing `src/lib/qr.ts` renderer), and every reward redemption
(`redeemAction`) then fires a Telegram message to their linked chat —
see "Data model" below and `docs/DEPLOY.md`'s "Telegram bot setup". See
`CHANGELOG.md` for the latest changes, including deduplication of the
shared bearer-auth and Merqo-RPC-call helpers and the addition of
templateCentral 5.13.0's comment-hygiene enforcement layer.

Vendors run a stamp/points program from `/dashboard` (programs, cards,
stamping, flame progress, "lucky" chance rewards); customers collect and view
cards from a phone-friendly `/c` flow via QR. Includes a scratch-card /
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
cross-kit consistency goal, not a coincidence. Theme is "Raspberry-Rose Punch & Gold"
(`src/app/globals.css`) — a bright, saturated raspberry-red primary plus a
gold reward accent, chosen (over the earlier, dimmer "Mulberry & Gold") to
read as celebratory rather than moody-fintech. Form fields keep their
primary copy to one short line, pushing rationale/edge-case detail into a
shared tap-to-open `(i)` info tooltip (`@merqo/ui`'s `InfoTooltip`).
The login form (`src/features/auth/components/login-form.tsx`) runs on
React Hook Form + Zod (a `loginSchema` in `src/lib/schemas.ts`) with a
`zodResolver`, surfacing auth/server errors via sonner toasts rather than
an inline alert paragraph; its post-navigation success branches `await`
`navigatingAway()` (`src/hooks/use-async-action.ts`) so the submit button
doesn't visibly re-enable mid-transition to `/dashboard`. Google OAuth
sign-in forces the consent screen to English (`hl=en`), matching the
same fix in paykit/merqo.

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
src/lib/telegram.ts     — sendTelegramMessage + generateLinkToken (Bot API, no SDK)
src/lib/telegram-link.ts — service-role link-token issuing + disconnect for Connect Telegram
src/lib/merqo-vendor-status.ts — reports status/metrics to merqo over HTTP
src/lib/supabase/       — browser / server / service clients (schema: loopkit)
src/app/api/telegram/webhook/ — Telegram Bot API webhook (signature-verified, no session)
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

Telegram reward-redemption alerts (migration `0036`, `loopkit.vendor_telegram`/
`loopkit.telegram_link_tokens`) are loopkit's half of the cross-kit Telegram
Phase A rollout: a vendor connects Telegram once via a deep-link QR in
`/dashboard/settings`, then `redeemAction` fires a message to their linked
chat on every reward redemption. Both tables have RLS enabled;
`vendor_telegram` grants `authenticated` `SELECT` on the caller's own row
only, `telegram_link_tokens` has zero client policies/grants at all — every
write goes through the service-role client (the webhook route on link, the
settings page's token-issuing/disconnect actions). A missing link or a send
failure is caught and logged, never affects `redeemAction`'s own returned
result. See `docs/superpowers/specs/2026-08-16-telegram-reward-alerts-design.md`.

Separately, a Pro vendor can let customers earn a stamp from a completed
qkit order (`src/app/dashboard/qkit-earn-settings.tsx`) — this is a pull-model
claim link, not push automation: qkit shows an "Earn a stamp" link on the
customer's order page, which sends them to loopkit's own `/earn?order=...`
page to enter their phone number and claim it (`src/app/earn/`), rather than
the stamp being awarded automatically the moment the qkit order completes.

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
