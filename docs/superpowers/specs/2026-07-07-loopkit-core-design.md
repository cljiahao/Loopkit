# loopkit — Digital Stamp-Card Loyalty (v1)

**Date:** 2026-07-07
**Status:** Approved (brainstorm)
**Repo:** new `cljiahao/loopkit`, folder `Coding/loopkit`.

## What loopkit is

Standalone loyalty for Singapore small vendors (home food sellers, pop-ups, cafes).
A "buy N, get 1 free" digital stamp card. Customers are identified by **phone
number**; the vendor stamps them at the counter; the reward is redeemed at N.

A **Merqo kit** — shares the one Supabase project (schema-per-kit: loopkit owns
`loopkit.*`, qkit owns `public`), and reports metrics to merqo over the HTTP
metrics API (bearer secret), never a cross-schema query. Sells + runs on its own;
no qkit dependency in v1.

## Decisions (locked)

- **Standalone, phone-based** identity (qkit orders carry only an anonymous
  `customer_name`, so auto-earn-from-qkit is a future add-on, not v1).
- **Digital stamp card** mechanic (not points).
- **Vendor stamps** — the vendor enters the customer's phone and adds a stamp (no
  self-stamp fraud). Customer views progress read-only.
- **One program per vendor** in v1.
- Public customer view (`/c`) **included** in v1. **No SMS** in v1.
- loopkit gets its **own product brand** (playful loyalty identity), distinct from
  merqo's neutral "Control Room" and qkit's food-stall theme — set at build via
  frontend-design.

## Scope (MVP)

Vendor:

1. Sign in — shared Supabase auth (email/password + Google), same pattern as qkit/merqo.
2. **Set up program** (first run): card name, `stamps_required` (N), `reward_text`
   ("Free kopi"). Editable later.
3. **Stamp a customer**: enter phone → +1 stamp; shows progress (e.g. 3/10). When a
   card reaches N → "Reward ready" → **Redeem** (logs a redeem, resets `stamp_count`
   to 0, increments `reward_count`). Undo last stamp within the session.
4. **Customers**: list + search cards (phone, stamps, rewards, last visit).

Customer: 5. **`/c`** — public page: enter phone → see your stamp progress at this vendor
(read-only). No account, no SMS.

Platform: 6. **`GET /api/merqo/metrics`** (bearer `MERQO_METRICS_SECRET`) → JSON with
`product: "loopkit"` + metrics (active programs, total cards, stamps issued,
rewards redeemed, signups 7d). Mirrors qkit's endpoint so merqo `/team` renders
loopkit with no merqo change beyond flipping its `products` row to live.

## Data model (`loopkit.*` schema)

- **`programs`** — `id`, `vendor_id uuid` (→ `auth.users`, **unique** — one per
  vendor), `name text`, `stamps_required int` (check 2–20), `reward_text text`,
  `active bool default true`, `created_at`.
- **`cards`** — `id`, `program_id` (→ programs), `phone text` (normalized to
  `+65XXXXXXXX`), `stamp_count int default 0`, `reward_count int default 0`,
  `created_at`, `updated_at`. **Unique (program_id, phone)**.
- **`stamp_events`** — `id`, `card_id` (→ cards), `kind text` (`'stamp' | 'redeem'`),
  `created_at`. Append-only audit; powers undo + the metrics counts.

**RLS (default-deny):**

- A vendor reads/writes only their own `programs` row and its `cards` /
  `stamp_events` (predicate: the row's `program.vendor_id = auth.uid()`), enforced
  by a `loopkit.owns_program(program_id)` SECURITY DEFINER helper.
- Stamps/redeems are applied by a **SECURITY DEFINER function**
  `loopkit.add_stamp(p_program, p_phone)` / `loopkit.redeem(p_card)` (atomic:
  upsert card, ++count, insert event; redeem resets + logs) — the vendor's authed
  client calls it; the function checks ownership.
- Public `/c` lookup: a `loopkit.card_status(p_program, p_phone)` SECURITY DEFINER
  function returning only `{stamp_count, stamps_required, reward_text}` for that
  phone — no anon table read, no PII leak (returns nothing if no card).
- The metrics endpoint reads via the **service-role client** (bypasses RLS,
  server-only), like qkit.

## Pages / routes

```
/                       — landing (brand loopkit + sign up), light like qkit
/login                  — email/password + Google (shared Supabase)
/auth/callback          — OAuth code exchange
/setup                  — create/edit the program (first-run redirect target)
/dashboard              — vendor home: program summary + Stamp-a-customer + recent activity
/dashboard/customers    — cards list + phone search
/c                      — public customer stamp check (enter phone)
/api/merqo/metrics      — bearer-guarded metrics JSON
src/proxy.ts            — Supabase session refresh + guard for /dashboard,/setup
```

## Stack + scaffold

Next.js 16 · App Router · TypeScript strict · Tailwind v4 · shadcn/ui · Zod ·
`@supabase/ssr` (schema `loopkit`) · Vitest · Playwright · pnpm 11 · Node ≥24 ·
Vercel. **templateCentral nextjs@5.8 Supabase variant** harness.

Build approach: **scaffold the harness with `templatecentral:scaffold` (nextjs)**,
then layer the kit-specific pieces modeled on qkit — schema-scoped browser/server/
service supabase clients, `proxy.ts` route guard, the login/auth-callback flow, the
`/api/merqo/metrics` endpoint, and CI/husky/prettier — so loopkit starts on a clean,
complete harness (avoids merqo's hand-copied-from-qkit harness gaps). Own brand
tokens set at frontend-design time.

## Integration with merqo

- Same shared `MERQO_METRICS_SECRET` in loopkit's Vercel env + `merqo.products`
  `metrics_secret` for the loopkit row.
- On deploy: set loopkit's `app_url` + `metrics_url` in `merqo.products` and flip
  status `coming_soon` → `live`. No merqo code change needed.

## Testing

- Unit (Vitest): phone normalization (SG formats → `+65XXXXXXXX`), stamp/redeem
  reducers (pure logic mirroring the SQL fns), metrics computation.
- Component (jsdom): stamp flow renders progress + reward-ready state.
- Contract: a test asserting the `/api/merqo/metrics` payload shape matches what
  merqo's `metricsPayloadSchema` expects (keep the two in lockstep).
- DB: pgTAP or a migration-applies check for the RLS predicates (vendor isolation).
- Playwright smoke: landing + login render.
- Gate: `pnpm check` + `pnpm test` + `pnpm build` green.

## Out of scope (v1)

Multiple programs per vendor · points mechanic · SMS / push · qkit auto-earn ·
customer accounts/logins · tiers · stamp expiry · multi-outlet.
