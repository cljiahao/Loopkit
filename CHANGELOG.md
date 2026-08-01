# Changelog

All notable changes to loopkit are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `BackToTop` scroll-to-top button on the landing page (ported from qkit).
- Shared-session SSO across `*.merqo.io` kits: `NEXT_PUBLIC_AUTH_COOKIE_DOMAIN`
  scopes the Supabase auth cookie to `.merqo.io` in production, so signing
  in on one kit signs you in on the rest. A one-time cleanup in
  `src/lib/supabase/middleware.ts` clears each already-signed-in vendor's
  pre-existing host-only cookie (forcing a single re-login) without
  clobbering a same-request token refresh.

### Fixed

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
