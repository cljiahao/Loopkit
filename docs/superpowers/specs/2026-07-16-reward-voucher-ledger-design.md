# Reward-voucher ledger

Date: 2026-07-16

## Problem

Today a "reward" is just a counter (`cards.reward_count` / Plant's `blooms`),
incremented by the vendor's redeem action. There's no record of _when_ a
reward became available, no expiry, and no history — only a `stamp_events`
row with `kind = 'redeem'` (a bare audit-log timestamp, not a claimable
entity). This was explicitly flagged and deferred during the
`2026-07-14-stamp-plant-redeem-carryover` brainstorm ("a separate
reward-voucher ledger with per-reward expiry dates... deliberately deferred
to its own future spec").

Motivation is twofold: (1) vendors want unclaimed rewards to expire instead
of being open-ended liability, and (2) a proper history of every reward
earned/redeemed, for vendor and customer trust.

## Decisions (from brainstorming)

- **New table, not a repurposed `stamp_events` row** — a voucher needs
  mutable status (`active` → `redeemed`/`expired`) and an expiry timestamp;
  `stamp_events` is an append-only log, wrong shape for that.
- **Scope: every program type**, not just Stamp/Plant. Wheel/Scratch/Lucky
  resolve instantly (reward granted the moment they win) — they get a
  ledger row too, but it's born `redeemed`, `expires_at = null`. This gives
  a unified reward history across all types even though only Stamp/Plant
  have a meaningful "unclaimed, pending expiry" window.
- **New config field name: `reward_expiry_days`, not `expiry_days`.**
  `programs.expiry_days` already exists (`0012_loopkit_card_lifecycle.sql`)
  for a different concept — card-cycle inactivity expiry
  (`src/lib/expiry.ts`'s `isCardExpired`). Reusing that name would collide
  two unrelated expiry concepts on one field.
- **Hard forfeit on expiry**: an expired voucher forfeits its threshold's
  worth of `stamp_count`/`growth` (deducted, floored at 0), not just a
  cosmetic flag. Checked lazily — on `add_stamp`, Plant's `apply`, and the
  counter's `lookup` action — no cron job needed.
- **Voucher state becomes the source of truth for "is a reward claimable"**:
  `redeem`/Plant-redeem now require an `active`, non-expired voucher to
  exist, rather than only checking raw `stamp_count >= stamps_required`.
- **Existing `stats.rewards30d`/`redemptionRate` (sourced from
  `stamp_events`/chance-win rows) stay as-is** — they already work; this
  spec adds a new, separately-sourced "Expired unclaimed" tile rather than
  risking a regression by migrating them onto the new table.

## A. Migration `0027_loopkit_reward_vouchers.sql`

```sql
create table loopkit.reward_vouchers (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references loopkit.cards(id) on delete cascade,
  program_id   uuid not null references loopkit.programs(id) on delete cascade,
  reward_text  text not null,
  earned_at    timestamptz not null default now(),
  expires_at   timestamptz,
  redeemed_at  timestamptz,
  status       text not null default 'active'
               check (status in ('active','redeemed','expired')),
  updated_at   timestamptz not null default now()
);

create index reward_vouchers_card_idx on loopkit.reward_vouchers(card_id, status);

alter table loopkit.programs
  add column reward_expiry_days int
  check (reward_expiry_days is null or reward_expiry_days between 1 and 3650);
```

RLS: same ownership shape as `cards`/`stamp_events` — a policy scoped through
`loopkit.owns_program(program_id)`, vendor can select/no direct
insert/update (all writes go through the `security definer` RPCs below).

`create_program`/`update_program` (existing RPCs in
`0012_loopkit_card_lifecycle.sql` and later migrations) gain a trailing,
defaulted `p_reward_expiry_days int default null` parameter, mirroring how
`p_expiry_days` was added — additive, no signature break for existing
callers.

## B. Voucher creation — Stamp (`add_stamp`)

New migration replacing `add_stamp`'s body again (same signature). Because
`points_per_visit` (`0026`) lets one visit increment `stamp_count` by more
than 1, a single visit can cross more than one reward multiple — voucher
count isn't a boolean "did we cross a threshold," it's
`floor(new_stamp_count / stamps_required) - floor(prev_stamp_count / stamps_required)`.
After computing the new `stamp_count`, insert that many voucher rows (loop),
each `earned_at = now()`, `expires_at = now() + reward_expiry_days days` if
configured.

## C. Voucher creation — Plant (`plant.ts` `apply()` + caller)

Plant's `apply()` stays pure TS, no DB access — same pattern as today. It
already returns a boolean `rewardUnlocked`; extend the same crossing-count
logic (`floor(growth / bloom) - floor(settled / bloom)`, since
`growth_per_visit` could similarly overshoot one threshold) as a numeric
`rewardsUnlockedCount` alongside the existing boolean (kept for backward
compat with existing callers/tests that only need the boolean). The caller —
`recordVisitAction` in `src/app/dashboard/actions.ts`, which already detects
`rewardUnlocked` — inserts that many voucher rows via a new RPC call (`insert
reward_vouchers ...`, plain insert through a small `security definer`
helper function `loopkit.grant_reward_voucher(p_card, p_reward_text,
p_expiry_days)`, reused by Stamp's path too instead of duplicating the
insert SQL in two places).

## D. Voucher creation — instant types (Lucky, Wheel, Scratch)

Same `recordVisitAction` path, when `rewardUnlocked` is true for these
types: call `grant_reward_voucher`, then immediately mark it redeemed in the
same call (`p_immediate := true` — the helper sets `redeemed_at = now()`,
`status = 'redeemed'` on insert instead of `active`/`expires_at`).

## E. Redeem-time lazy expiry + consumption

`redeem(p_card)` (Stamp) and `redeemPlantAction`'s call into
`plantStrategy.redeem` (Plant), before the existing carryover math:

1. **Lazy-expire pass**: for this card, every `active` voucher with
   `expires_at < now()` → `status = 'expired'`, `updated_at = now()`, and
   forfeit its threshold's worth: `stamp_count = greatest(stamp_count -
stamps_required, 0)` (Stamp) / `growth = greatest(growth - bloom, 0)`
   (Plant), once per expired voucher.
2. Run the existing carryover redeem logic against whatever remains.
3. Mark the oldest still-`active` voucher `redeemed_at = now()`,
   `status = 'redeemed'`.
4. If no `active` non-expired voucher remains after step 1, return an error
   ("Nothing to redeem — that reward expired.") instead of proceeding —
   voucher state gates redemption, not just the raw counter.

Same lazy-expire pass (step 1 only, no consumption) also runs inside
`add_stamp`, Plant's visit path, and the counter's `lookupAction` — so an
expired-but-unviewed voucher is swept the next time the card is touched at
all, not only at redeem time.

## F. UI — Setup page (`src/app/setup`)

`reward_expiry_days` field next to existing numeric config (same pattern as
`expiry_days` in `setup-form.tsx`), Zod-validated 1–3650 or empty=off, in
`src/lib/program.ts`'s per-type schemas. Shown for Stamp/Plant/Points-club
types; hidden for Wheel/Scratch/Lucky (their vouchers never have a pending
window).

## G. UI — Counter / serve-customer (`src/app/dashboard/counter`,

`serve-customer.tsx`, `redeem-button.tsx`)

`lookupAction`/`stampAction`/`recordVisitAction` responses include the
card's active voucher(s) (earned_at, expires_at). When a reward is ready,
show its expiry inline — "Reward ready — expires in 12 days" / "expires
today." If the lazy-expire pass on this lookup just forfeited one, toast:
"A reward for {phone} expired unclaimed."

## H. UI — Customers page (`src/app/dashboard/customers`, `src/lib/customers.ts`)

Program-scoped card list (`cards.map` in `page.tsx`): each card's reward
history — small badge row per voucher (`earned_at`, status badge
active/redeemed/expired, expiry countdown if active). Vendor-level merged
list (`VendorCustomerList`/`aggregateCustomers` in `src/lib/customers.ts`):
`totalRewards` gains a lightweight "+N expired" note when the phone has any
`expired` vouchers in a recent window (last 30 days, matching the stats
tile's window).

## I. UI — Stats page (`src/app/dashboard/stats`, `src/lib/stats.ts`)

New tile "Expired unclaimed (30d)": count of this vendor's/program's
`reward_vouchers` where `status = 'expired' and updated_at` within 30 days.
Added alongside, not replacing, the existing `rewards30d`/`redemptionRate`
tiles (see Decisions — those stay on their current `stamp_events` source).

## J. UI — Customer-facing `/c` (`program-card-status.tsx`, `src/app/c/actions.ts`, `status-state.ts`)

`checkStatusAction` already computes `rewardReady` per card via `getProgress`
— extend `CardStatus` with `voucherExpiresAt: string | null`, populated by
looking up the card's oldest active voucher. `program-card-status.tsx`
renders a banner next to the existing "🎉 Reward ready!" line: "Redeem
within {N} days" when `voucherExpiresAt` is set.

## Testing

- SQL migration: hand-verified against the SQL body (existing project
  convention — no automated DB integration test).
- `add_stamp`'s crossing-count math: covered at the TS layer via a small
  pure helper (`countThresholdCrossings(prev, next, required)`) extracted
  and unit-tested directly — multiples-in-one-visit (`points_per_visit`
  large relative to `stamps_required`), exact-boundary, and zero-crossing
  cases.
- `plant.ts`: extend `test/lib/engine/plant.test.ts` for the numeric
  `rewardsUnlockedCount` crossing multiple bloom thresholds in one
  `growth_per_visit` jump, plus the existing single-crossing case unchanged.
- `redeem`/Plant-redeem lazy-expire + forfeit: test the full sequence —
  active voucher past `expires_at` → forfeited on next touch → redeem then
  errors if nothing left active.
- `redeem-button.tsx`, `serve-customer.tsx`: extend existing dom tests for
  the new expiry-inline copy and the forfeited-voucher toast.
- `customers-page.dom.test.tsx`: extend for the per-voucher badge row and
  the vendor-level "+N expired" note.
- `program-card-status.dom.test.tsx`: extend for the "Redeem within N days"
  banner.
- Full `pnpm check` + `pnpm test` + `pnpm build` before commit, per
  project convention.

## Out of scope

- Migrating `stats.rewards30d`/`redemptionRate` onto the new
  `reward_vouchers` table as their source of truth — deferred, see
  Decisions.
- A background/cron job to proactively expire vouchers ahead of the next
  card touch — lazy (on-touch) expiry is sufficient per Decisions; a
  voucher that's expired but never looked up again simply stays `active`
  with a past `expires_at` until the next stamp/lookup/redeem, which is
  fine (it doesn't over-count in the stats tile until it's actually swept).
- Any change to the existing card-cycle `expiry_days`/`isCardExpired`
  concept (`src/lib/expiry.ts`) — unrelated, same-sounding-but-different
  feature, not touched here.
- Streak carryover/voucher behavior — Streak was already removed as a
  program type (`0025_loopkit_remove_streak_type.sql`), so it's moot.
- `qkit_earn`'s flat +1 order-webhook path — unaffected; it still just
  calls the same `add_stamp` RPC, which now also produces voucher rows for
  it same as any other stamp, no special-casing needed there.

## Cleanup

Per standing project convention: `add_stamp`, `redeem`, and `plant.ts`'s
`apply`/`redeem` are replaced outright (no old behavior left dead or
flagged). The counter/serve-customer confirmation copy is replaced in
place, not duplicated alongside the old text.
