# Points Club reward shop

Date: 2026-09-04

## Problem

Points Club today is `type: "stamp"`, `variant: "points"` — mechanically
identical to a classic Stamp card (one fixed `reward_text`, one
`stamps_required` threshold, redeem resets `stamp_count` to 0), just
rendered with `PointsBar` (a caption + flat progress track) instead of
`StampDots`. It doesn't read as its own mechanic; it reads as Stamp Card
with a different unit label.

The ask: Points Club becomes a genuine accumulate-then-spend shop. A
customer picks which reward to redeem once they can afford it (not "the
one reward everyone gets"), and separately, a vendor can instead choose to
let points directly offset a customer's payment — two different
redemption philosophies, vendor-picked once per program.

## Decisions (from brainstorming)

- **Redemption mode is fixed per program at setup**: `"catalog"` or
  `"offset"`. No third "classic single-reward" option — every new
  Points Club program picks one of the two. (Existing Stamp/Flame/Growth/
  Chance mechanics are untouched; they already have the voucher-ledger +
  vendor-set expiry from `0027_loopkit_reward_vouchers.sql` and are out of
  scope here.)
- **Catalog mode**: vendor defines 2-6 reward items (label + point cost),
  same editor shape Wheel/Scratch's segment list already establishes.
  Customer self-service picks one on their own `/c` card once affordable —
  not vendor-picked at the counter. Redeeming an item deducts its cost
  from the balance; the remainder carries over (real "points shop" math,
  not a full reset).
- **Offset mode**: vendor sets a fixed conversion rate at setup (e.g.
  100 points = $1). Redemption is vendor-initiated at the register (there
  is nothing for a customer to pick — it's a running balance, not a
  catalog), partial-balance allowed. The RPC returns a dollar figure; the
  vendor applies it manually at their own register. loopkit does not
  touch payment processing, same as every other reward in this app.
- **Every picked catalog reward becomes its own scannable voucher.** Reuse
  `cards.card_token`'s exact proven shape (`reward_vouchers.voucher_token`,
  same random-opaque-string default, same owner-gated resolve RPC
  pattern) rather than inventing new anti-replay machinery. This also lets
  several picked rewards sit pending at once, each independently
  redeemable — a real limitation of a single fixed "the" reward slot.
- **QR only**, not a literal second barcode format — consistent with
  every other scannable code in the app (the main card, referral links).
- **Vouchers snapshot their reward text at selection time.** A catalog
  item is vendor-editable config, not a stable row a voucher can
  reference by id — if it referenced the live config, a vendor editing or
  removing an item later would retroactively corrupt the wording on
  already-issued vouchers. Storing the label as a plain string on the
  voucher (exactly how `reward_text` already works for every other
  mechanic) avoids that by construction.
- **Not addressed here: `PointsBar`'s visual redesign.** This spec is the
  data/redemption architecture. The 4 visual concepts already sketched
  (Ledger Tab, Odometer, Coin Stack, Fuel Gauge) need adapting to actually
  show a catalog picker or an offset balance, not a generic percentage —
  that's a follow-up design pass once this architecture is approved, same
  two-step shape Stamp Card's redesign took (architecture first when it
  turned out to be more than a reskin; here it's architecture-first from
  the start).

## A. Migration `0043_loopkit_points_reward_shop.sql`

```sql
alter table loopkit.reward_vouchers
  add column voucher_token text unique
    default replace(gen_random_uuid()::text, '-', '');

alter table loopkit.stamp_events
  drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
    check (kind in ('stamp','redeem','visit','win','adjust',
                     'points_reward_selected','points_offset_applied'));
```

New RPCs:

- **`voucher_by_token(p_token text)`** — owner-gated (`owns_program` on the
  resolved voucher's `program_id`), mirrors `card_by_token` exactly.
  Returns `program_id, card_id, voucher_id, phone, reward_text, status`.
- **`redeem_voucher_by_token(p_token text)`** — owner-gated, marks the
  voucher `status = 'redeemed'`, `redeemed_at = now()`; raises if it's
  already redeemed or expired (lazy-expire check first, same shape as
  `redeem_oldest_voucher`).
- **`select_points_reward(p_program uuid, p_phone text, p_item_id text)`**
  — anon-grantable, same phone+program trust model `regenerate_card`
  already uses (no customer auth exists in this app). Validates the
  program is active, `type = 'stamp'`, `config->>'variant' = 'points'`,
  `config->>'redemption_mode' = 'catalog'`, and that `p_item_id` exists in
  `config->'catalog'`. Re-derives the item's cost/label from the
  program's own config server-side (never trusts a client-supplied cost)
  — checks `stamp_count >= cost`, deducts `cost`, inserts one
  `reward_vouchers` row (`reward_text` = the item's label, `status =
'active'`, `expires_at` from `reward_expiry_days` same as
  `grant_reward_voucher`), logs a `stamp_events` row
  (`kind = 'points_reward_selected'`).
- **`apply_points_offset(p_card uuid, p_points int)`** — owner-gated
  (vendor-authenticated, called from `serve-customer.tsx`). Validates the
  program's `redemption_mode = 'offset'` and `p_points <= stamp_count`,
  deducts `p_points`, computes
  `dollars = p_points * (config->'offset_rate'->>'dollars')::numeric /
(config->'offset_rate'->>'points')::numeric`, logs a `stamp_events` row
  (`kind = 'points_offset_applied'`). Returns the updated card plus
  `dollars` for the vendor to read off and apply at their register.

RLS/grants: `voucher_by_token`/`redeem_voucher_by_token`/
`apply_points_offset` → `authenticated` (vendor-only, same as
`card_by_token`/`redeem`). `select_points_reward` → `anon, authenticated`
(same as `regenerate_card`/`enroll_card`).

**`vendor_join` gains an array column.** Today it returns one scalar
`voucher_expires_at` (the card's oldest active voucher's expiry) — enough
for the single-fixed-reward case every other mechanic still uses. Catalog
mode can have several simultaneously pending vouchers, so `vendor_join`
additionally returns `active_vouchers jsonb` — an array of `{id,
voucher_token, reward_text, expires_at}` for the card's `active`,
non-expired vouchers, populated for every card (cheap: 0-1 rows for every
non-catalog mechanic, same as today) but only ever rendered by
`program-card-status.tsx` for `redemption_mode === "catalog"`. The
existing scalar `voucher_expires_at` stays untouched for the other
mechanics' existing banner — this is additive, not a replacement.

## B. Engine (`src/lib/engine/stamp.ts`, `types.ts`)

`StampConfig` gains, meaningful only when `variant === "points"`:

```ts
redemption_mode?: "catalog" | "offset";
catalog?: { id: string; label: string; cost: number }[];
offset_rate?: { points: number; dollars: number };
```

`ProgressView`'s `"dots"` kind gains, same points-only scoping (`undefined`
for `dots`/`flame`, dropped for the non-points branch exactly like
`style`/`color` already are for `variant === "points"`):

```ts
redemptionMode?: "catalog" | "offset";
catalog?: { id: string; label: string; cost: number; affordable: boolean }[];
offsetRate?: { points: number; dollars: number };
offsetValue?: number; // current balance's dollar equivalent, offset mode only
```

`progress()`'s `rewardReady`: for `redemption_mode: "catalog"`, true once
the balance covers the _cheapest_ catalog item (was: `stamp_count >=
stamps_required`); for `"offset"`, true once the balance is above 0.
`stamps_required` keeps being read/stored (the column is `not null`) but
no longer drives `rewardReady` for either new mode — callers stop
treating it as "the" target once a `redemption_mode` is set.

## C. Setup UI (`setup-form.tsx`, `program.ts`)

New "Points redemption" `Section`, shown only for `type === "stamp" &&
variant === "points"`: a mode `ToggleGroup` (Catalog / Payment offset).

- **Catalog**: a reward-item editor — label + point-cost inputs per row,
  add/remove, 2-6 items — same component shape the Wheel/Scratch segment
  editor already establishes (`PointsCatalogItemInput`, sibling to
  `SegmentInput`).
- **Offset**: two number inputs composing the rate (points, dollars).
- The existing `stamps_required` field and its 5/10/15 quick-pick chips
  are hidden once a mode is chosen — no longer a meaningful single
  target for either mode. The column stays `not null`, so a value still
  submits underneath the hidden field: the catalog's most expensive
  item's cost (catalog mode) or the rate's `points` value (offset mode) —
  same "compute a sane fallback for a column the UI no longer surfaces"
  pattern `buildProgramFields` already uses for Wheel/Scratch's
  `stampsRequired: data.pity_ceiling ?? 10`.

`saveProgramSchema`'s stamp branch gains `redemption_mode`, `catalog`
(JSON-encoded like `segments`), `offset_rate_points`/`offset_rate_dollars`
— all optional, only meaningful for `variant === "points"`.
`buildProgramFields` writes them into `config` under the field names
above, same inline pattern `stamp_mark`/`stamp_style` already use (no
`program-config.ts` builder needed, matching how Points already has no
dedicated builder today).

## D. Customer `/c` UI

No new field on `CardStatus` for card identity — the trust model stays
phone+program, matching `regenerateCardAction`'s existing shape, not a
raw internal id. A new `selectPointsRewardAction(formData)` in
`src/features/card-check/api/actions.ts` takes `phone`, `program`,
`item_id` (the label/cost the customer sees already came from
`view.catalog`, rendered client-side — the RPC re-derives cost/label from
the program's own config server-side, per Migration section above, so
there's nothing sensitive to trust from the form beyond which item was
picked).

`program-card-status.tsx`'s dots branch, points variant:

- **Catalog mode**: a "Choose your reward" list of `view.catalog` items
  where `affordable`, each opening an `AlertDialog` confirm (the
  deduction is immediate and not reversible from the customer's side) that
  calls `selectPointsRewardAction`. On success, the new voucher's own QR
  renders in a small "Your rewards" list below the main card — supports
  several simultaneously pending vouchers, each with the same
  expiry-countdown banner `0027`'s spec already added for the single-
  voucher case.
- **Offset mode**: the current balance's dollar equivalent
  (`view.offsetValue`) rendered inline — no picker, nothing to choose;
  the customer shows the vendor their existing card QR as normal, same
  scan flow as any other card.

## E. Vendor scan routing (`scan-and-route.tsx`, new `redeem-voucher.tsx`)

A scanned token now needs to resolve against two possible shapes. Try
`card_by_token` first (today's only path, unchanged for every non-catalog
program and the overwhelming majority of scans); only on a miss, try
`voucher_by_token`. One extra round trip, paid only on an actual voucher
scan.

A voucher match routes to a new, narrow `redeem-voucher.tsx` screen —
not the full `serve-customer.tsx` (there's no stamping/other actions to
offer here) — showing just the reward's text and the customer's phone,
one "Redeem" button calling `redeem_voucher_by_token`.

## F. Vendor offset redemption UI (`serve-customer.tsx`)

For an offset-mode program's card, the existing single fixed
`RedeemButton`/confirm-dialog is replaced by a small form: current
balance and its dollar equivalent shown, a number input (defaults to the
full balance, capped at it) for how many points to apply, "Apply" calls
`apply_points_offset` and shows a toast with the resulting dollar figure
for the vendor to key into their own register.

## Testing

- SQL migration: hand-verified against the SQL body, same project
  convention as `0027`/`0042` — no automated DB integration test.
- `stamp.ts`: `progress()`'s `rewardReady`/`catalog[].affordable`/
  `offsetValue` computation for both modes, and that `style`/`color`-style
  scoping keeps these fields `undefined` outside `variant === "points"`.
- `program.test.ts`: `saveProgramSchema`/`buildProgramFields` for the new
  mode/catalog/offset-rate fields, mirroring the existing `stamp_mark`/
  `stamp_style` test shape.
- `program-card-status.dom.test.tsx`: catalog picker rendering only
  affordable items, the confirm dialog, the offset balance display.
- `scan-and-route.dom.test.tsx`: the card-miss-then-voucher-lookup
  fallback, routing a voucher match to `redeem-voucher.tsx` instead of
  `serve-customer.tsx`.
- Full `pnpm check` + `pnpm test` + `pnpm build` before commit, per
  project convention.

## Out of scope

- `PointsBar`'s actual visual redesign — separate follow-up pass once
  this architecture lands (see Decisions).
- Growth/Chance/classic-Stamp changes of any kind — already complete via
  `0027`, not touched here.
- Real payment-processing integration for offset mode — an informational
  dollar figure only, same "vendor applies it manually" boundary every
  other reward in this app already has.
- Editing/removing a catalog item after a program is live retroactively
  renaming outstanding vouchers — moot by construction, vouchers snapshot
  their label at selection time (see Decisions).
- Literal (non-QR) barcode support — confirmed QR-only.
- A background job to proactively expire vouchers — reuses `0027`'s
  existing lazy-expire-on-touch pattern, no new cron. One real behavior
  difference worth being explicit about: `0027`'s expiry sweep _forfeits_
  a threshold's worth of `stamp_count`, because a Stamp/Plant voucher is
  auto-granted without deducting anything at grant time. A catalog
  voucher already deducted its item's cost at _selection_ time (Section A
  above) — its own expiry sweep only flips `status = 'expired'`, no
  further `stamp_count` change, since there's nothing left to claw back.
- Switching an existing program's `redemption_mode` after creation — not
  offered in the setup UI; out of scope per the "fixed at setup" decision.

## Cleanup

Per standing project convention: no vendors are onboarded on any kit yet
(breaking changes are fine), so there is no live points-variant program
to migrate or keep a legacy path for. The single-fixed-reward Points
behavior is removed outright for newly created programs, not kept
side-by-side with the 2 new modes.
