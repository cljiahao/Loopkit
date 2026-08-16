# Customer Telegram Connect — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

loopkit's half of `Merqo Business/docs/business/2026-08-16-telegram-
integration-design.md`'s Phase B+D. **Read that doc's "Phase B + D"
section first** — the consent model, the third Merqo-owned bot, and the
`merqo.customers` shape are decided there, not re-derived here. Unlike
qkit's half (a new opt-in button + a connect-token mint), loopkit's is
**reuse-only** — no new UI, no connect flow. Reward redemption is
instant/in-person; there's no "waiting" moment to hang a connect button
off, so this spec adds exactly one thing: `redeemAction` checks whether
the redeeming customer already has a linked Telegram connection (from
having connected via qkit, with a matching phone number) and, if so,
sends a redemption confirmation too.

Depends on merqo's own spec
(`../../../merqo/docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`)
shipping first — specifically its `notify-customer` endpoint's `phone`
lookup mode (added to that spec alongside this one, since loopkit's flow
is what motivated it: loopkit has no `notify_ref` to hand back, only a
`phone` it already reads off the card).

## Guiding decisions

- **Stated limitation, not a bug to work around:** a customer only shows
  up in `merqo.customers` by `phone` if they connected via qkit *while
  also giving a phone number* (the master doc's own stated cross-kit-reuse
  limitation). A Telegram-only qkit connection (no phone) will never match
  here — that's correct, not a gap to close in this phase.
- **`phone` lookup, not `notify_ref`** — loopkit's redemption event has no
  prior connect-token round (unlike qkit's order-status page, nothing
  minted a token when the card was created). `card.phone` (already read by
  `redeemAction` today) is the only key loopkit has, so it calls merqo's
  `notify-customer` in its new `phone` mode, not the `notify_ref` mode
  qkit's own half uses.
- **Fire-and-forget, same rule as the existing Telegram alert.**
  `notifyRedemptionOnTelegram` (the Phase A vendor alert already in
  `redeemAction`) never affects `redeemAction`'s own result on failure;
  the new customer-confirmation call follows the identical pattern —
  wrapped, logged, never thrown.
- **No new loopkit table, no new env var beyond what qkit already
  defines the shape for** — `MERQO_BASE_URL`/`MERQO_CUSTOMER_SECRET`
  are the same two new env vars qkit's own spec introduces; loopkit gets
  its own copies (each kit holds its own env vars, matching every
  existing cross-kit secret in this codebase — `MERQO_METRICS_SECRET` is
  per-kit too, not shared literally across repos' env files even though
  the value is the same).

## What changes

### `src/lib/merqo-customer-notify.ts` (new)

Single function, not the two qkit needs (loopkit never mints a connect
token — there's no button here):

```ts
export async function notifyCustomerByPhone(
  vendorId: string,
  phone: string,
  message: string,
): Promise<void> { ... } // fire-and-forget, catches+logs, never throws
```

Posts to `` `${MERQO_BASE_URL}/api/merqo/notify-customer` `` with
`{ vendor_id: vendorId, phone, message }` (bearer `MERQO_CUSTOMER_SECRET`),
`AbortSignal.timeout(3000)`. Same shape as
`notifyRedemptionOnTelegram`'s existing `sendTelegramMessage` call, one
layer out.

### `src/app/dashboard/actions.ts`

`redeemAction`: after the existing `await notifyRedemptionOnTelegram(user.id, ...)`
call, add a sibling call:

```ts
await notifyCustomerByPhone(
  user.id,
  card.phone,
  `Reward redeemed: ${card.stamp_count} stamps used. See you again soon!`,
);
```

Both calls already run after `revalidatePath` and before the function's
return — same "never blocks the real redemption" placement. No change to
`redeemAction`'s return shape or its existing tests' expectations beyond
the new call itself.

## Testing

- `src/lib/merqo-customer-notify.test.ts`: posts the right body/headers
  (`phone` mode, no `notify_ref`); never throws on non-2xx/timeout/network
  error.
- `src/app/dashboard/actions.test.ts` (extend the existing redeem block):
  `redeemAction` calls `notifyCustomerByPhone` with the card's phone and a
  redemption message; a `notifyCustomerByPhone` failure doesn't change
  `redeemAction`'s success result — same assertion shape already used for
  `notifyRedemptionOnTelegram`'s failure case.

## Self-review

- No placeholders — every file has real, complete logic once written.
- Scope: one new lib function, one new call site. No UI, no new table, no
  new consent flow — all of that is qkit's/merqo's half, not repeated
  here.
- The stated phone-only-match limitation from the master doc is named
  here too, not silently assumed to "just work."

## Parent

[specs](README.md)
