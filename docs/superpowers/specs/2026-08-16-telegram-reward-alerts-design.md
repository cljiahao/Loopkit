# Telegram Reward Redemption Alerts — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

Phase A of `Merqo Business/docs/business/2026-08-16-telegram-integration-
design.md`, loopkit's half — a vendor connects Telegram once, then gets a
message the moment a customer redeems a completed reward. loopkit's
equivalent of qkit's "new order" alert (`qkit/docs/superpowers/specs/
2026-08-16-telegram-order-alerts-design.md`): the trigger event a vendor
needs to know about _right now_, not a routine stamp increment (too
frequent — would be noise, not signal).

## Guiding decisions

- **One bot for loopkit**, own webhook route, own bot token — matches the
  cross-kit design doc's "one bot per kit" decision. Not shared with
  qkit's bot.
- **Trigger point: `redeemAction`** (`src/app/dashboard/actions.ts`), not
  `redeemOldestVoucher`/`redeem_oldest_voucher` in `src/lib/vouchers.ts` —
  confirmed by grep that only `redeemAction` (calling the `redeem` RPC) is
  actually wired to the dashboard's redeem button; `redeemOldestVoucher`
  has no caller anywhere in `src/app/`. Verify this is still true at
  implementation time before wiring the alert to the wrong function.
- **Simpler than qkit's case: no anonymous-customer resolution needed.**
  `redeemAction` already runs inside `requireVendor()` — `auth.uid()` _is_
  the vendor_id directly, no booth→vendor lookup required.
- **Same deep-link linking flow, same webhook route shape, same
  fire-and-forget-never-blocks-the-action rule** as qkit's Phase A spec —
  not re-derived here, see that doc for the full webhook/signature/
  token-linking mechanics, identical in loopkit modulo the schema prefix.

## What changes

### `supabase/migrations/0036_vendor_telegram.sql` (new)

Identical shape to qkit's `qkit.vendor_telegram`/`qkit.telegram_link_tokens`
(see qkit's spec for the exact SQL) — same RLS/grant pattern (own-row
select via `authenticated`, no client write grant, writes only through the
service-role webhook route and token-issuing action), same reasoning.

### `src/lib/telegram.ts` (new)

Same `sendTelegramMessage`/`generateLinkToken` shape as qkit's — a
no-op when `TELEGRAM_BOT_TOKEN` is unset, catches and logs a fetch
failure instead of throwing.

### `src/app/api/telegram/webhook/route.ts` (new)

Same shape as qkit's: verify `X-Telegram-Bot-Api-Secret-Token`, handle
`/start <token>`, upsert `loopkit.vendor_telegram`, delete the token,
always `200`. Excluded from `src/proxy.ts`'s auth-gate matcher.

### Dashboard settings

New "Connect Telegram" section (check where loopkit's vendor-level
settings already live — likely `src/app/dashboard/settings/` mirroring
qkit's own layout, confirm the actual route before assuming) — same
QR-deep-link flow as qkit's.

### `src/app/dashboard/actions.ts`

After `redeemAction`'s existing successful-RPC branch (the `card` result
is already available — `card.phone`, `card.stamp_count`), look up
`loopkit.vendor_telegram` for `auth.uid()` (the vendor, already resolved
by `requireVendor()`); if found, fire `sendTelegramMessage(chat_id, ...)`
with the redeeming customer's phone and which card. Wrapped in try/catch —
a failed send never changes `redeemAction`'s own returned result.

## Testing

- `src/lib/telegram.test.ts`: identical assertions to qkit's own (same
  module shape).
- `src/app/api/telegram/webhook/route.test.ts`: identical assertions to
  qkit's own (401 on bad signature, valid token links + deletes, invalid
  token rejected without writing).
- `src/app/dashboard/actions.test.ts` (extend, or wherever `redeemAction`
  is already tested): a vendor with a linked `chat_id` triggers
  `sendTelegramMessage` after a successful redeem; a vendor without one
  skips it silently; a send failure doesn't change `redeemAction`'s own
  success response.
- New settings-section component test, mirroring qkit's own.

## Self-review

- No placeholders — every file has real, complete logic.
- Scope: Phase A only, loopkit's half. No customer-facing flow, no Mini
  App, no `merqo.customers` change.
- Trigger point verified against actual code (`redeemAction`, not the
  unused `redeemOldestVoucher`) rather than assumed from the table schema
  alone.

## Parent

[specs](README.md)
