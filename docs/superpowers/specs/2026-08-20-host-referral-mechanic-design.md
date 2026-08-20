# Host/Couple-Facing Referral Mechanic — Design

**Date:** 2026-08-20
**Status:** Implemented.

## Summary

loopkit's existing loyalty mechanics only reward the person physically
stamped at the counter — but for an event-cart vendor (weddings/private
events), a guest is a one-off visitor the vendor will likely never see
again, so guest-only stamps have near-zero value there. The host
(bride/groom/organizer) IS a real repeat/referral relationship worth
rewarding — they chose this vendor and will refer others in the future.

This is **credit-routing on an existing program a vendor already runs, not
a sixth engine `type`**: a vendor names one of their own active programs
plus a host's phone, and every distinct guest who joins through that
host's `/c?ref=` link bumps the host one stamp/visit on the named program,
reusing the existing stamp/points/lucky/plant/wheel/scratch engine
untouched. VIP tiers, birthday rewards, and wallet passes are separate,
out-of-scope roadmap items.

## Guiding decisions

- **No new program `type`.** A referral just redirects who gets credited
  on whichever program the vendor picks — the guest still gets their own
  card exactly as the generic `/c?v=` link already gives them.
- **`vendor_join`'s existing signature/behavior is untouched** — other
  callers depend on it staying exactly as-is. A new `vendor_join_referred`
  RPC handles the referral-aware path instead, sharing the enrollment/read
  logic with `vendor_join` via two extracted helpers
  (`vendor_join_enroll`/`vendor_join_cards`) rather than duplicating it.
- **Stamp-type credits happen inline, in SQL** (mirroring `add_stamp`'s own
  body, minus its `owns_program` gate — this call is anonymous/public, a
  guest's browser has no vendor session to check against). **Every other
  type needs the TypeScript engine's `applyVisit`** (`src/lib/engine`) to
  compute the next state, which can't run inside a SQL function without
  reimplementing that dispatch — so for those, `vendor_join_referred` only
  _reserves_ the credit and returns a `referral_credit` jsonb blob;
  `checkStatusAction` (`src/features/card-check/api/actions.ts`) finishes
  it via a new `apply_referral_credit` RPC, the same read-compute-persist
  shape `recordVisitAction` (`src/app/dashboard/actions.ts`) already uses
  for a vendor-triggered visit.
- **Self-referral is a no-op, not an error.** If the resolved referral
  row's `host_phone` equals the joining phone, the guest still enrolls
  normally but the host is never credited — guards against someone farming
  their own link.
- **A guest re-visiting the same link a second time must not double-credit
  the host.** `loopkit.referral_credits` (`referral_host_id`,
  `guest_phone`, unique together, nullable `credited_at`) is the dedup
  ledger: the host is credited only the first time
  `insert ... on conflict do nothing` actually inserts a row for that
  guest+referral pair. For a deferred non-stamp credit, `credited_at`
  starts `null` and only `apply_referral_credit`'s guarded
  `null -> now()` transition can finish it once — a retried/duplicate
  finish call is a safe no-op.
- **Cross-vendor isolation is structural, not an extra check.**
  `referral_code` is globally unique (same generation shape as
  `card_token`: `replace(gen_random_uuid()::text, '-', '')`), and
  `vendor_join_referred` looks it up scoped to the calling `p_vendor`. A
  code minted by vendor A simply never resolves when called with vendor
  B's id — it degrades to a plain enrollment with no referral side effects
  at all, which is exactly the isolation guarantee.

## What changed

### `supabase/migrations/0040_loopkit_referral_hosts.sql`

- `loopkit.referral_hosts` (`id`, `vendor_id`, `program_id`, `host_phone`,
  `label`, unique `referral_code` defaulted the same way `card_token` is,
  `guest_count`, `created_at`) — RLS `for all` own-row (same shape as
  `programs_own`), but only `select, insert` granted to `authenticated`
  (no update/delete this round — a vendor who makes a mistake creates a
  new one).
- `loopkit.referral_credits` (`referral_host_id`, `guest_phone` unique
  together, nullable `credited_at`) — RLS enabled, zero policies/grants to
  anon or authenticated, only ever touched by `SECURITY DEFINER`
  functions (same shape the retired `telegram_link_tokens` table used).
- `loopkit.vendor_join_enroll`/`loopkit.vendor_join_cards` — the
  phone-validate-and-enroll loop and the guest's-own-cards read query,
  extracted out of `vendor_join`'s old inline body so both `vendor_join`
  and `vendor_join_referred` share them.
- `loopkit.vendor_join` — rebuilt on the two helpers above; identical
  16-column return shape and behavior (0031).
- `loopkit.vendor_join_referred(p_vendor, p_phone, p_referral_code)` — the
  referral-aware join: everything `vendor_join` does for the guest, plus
  the referral bookkeeping described above. Returns the same 16 columns
  plus a `referral_credit` jsonb column (denormalized onto every row, same
  pattern `vendor_avatar_url` already uses).
- `loopkit.apply_referral_credit(p_referral_host_id, p_guest_phone,
p_state, p_kind, p_payload)` — finishes a reserved non-stamp credit;
  `loopkit.record_visit`'s own insert-or-update-plus-event-log body, minus
  its `owns_program` gate (the `referral_credits` guarded transition
  stands in for that authorization instead).

### `src/features/card-check/api/actions.ts`

`checkStatusAction` reads an optional `ref` field from the form data and
calls `vendor_join_referred` instead of `vendor_join` when present
(unchanged behavior for every existing `ref`-less caller). When the
resolved row's `referral_credit.pending` is `true`, `creditReferralHost`
computes `applyVisit` and calls `apply_referral_credit` — wrapped so a
failure there is logged and swallowed, never affecting the guest's own
join result (the guest's join has already succeeded by that point).

### `src/app/c/page.tsx` / `src/features/card-check/components/check-form.tsx`

`/c` accepts an optional `?ref=` query param, threaded through `CheckForm`
as a hidden `ref` form field (rendered only when present).

### `src/app/dashboard/referrals/`

New dashboard page: pick one of the vendor's active programs, enter the
host's phone (`normalizePhone`, same SG-only validation as everywhere
else) and an optional label ("Sarah & Wei's Wedding"), and get back a
shareable `/c?v=<vendorId>&ref=<code>` link with a copy-to-clipboard
affordance (`card-link.tsx`'s existing `CardLinkActions`) and a QR code
(the existing `qrSvg` helper) — plus each host's running `guest_count`.
Added as a fifth inline nav link (`dashboard-nav.tsx`).

## Testing

- pgTAP (`supabase/tests/rls.test.sql`): `referral_hosts` RLS (own-row
  create/read, cross-vendor denial, no update/delete grant); a
  `vendor_join_referred` functional suite (self-referral no-op, first vs.
  repeat guest for a stamp-type program only crediting once, cross-vendor
  code isolation, a non-stamp program's deferred `apply_referral_credit`
  finish step also only firing once).
- `src/features/card-check/api/actions.test.ts`: `vendor_join` vs.
  `vendor_join_referred` dispatch on `ref` presence; `apply_referral_credit`
  called only for a pending non-stamp credit, never for a stamp-type row
  (already credited inline by the RPC); a failed finish call is logged and
  doesn't change `checkStatusAction`'s own result.
- `src/app/dashboard/referrals/actions.test.ts` and
  `referrals-panel.dom.test.tsx`/`referrals-page.dom.test.tsx`: create-form
  validation, the created host's link/QR shape, and page/panel rendering.
- `check-form.dom.test.tsx`: the hidden `ref` field renders only when a
  referral code is passed in.

## Self-review

- No placeholders.
- Reuses the existing engine dispatch (`applyVisit`/`getProgress`) rather
  than reimplementing per-type logic in SQL.
- Does not modify `vendor_join`'s signature or behavior for existing
  callers.

## Parent

[specs](README.md)
