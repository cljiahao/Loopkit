# Vendor Telegram Connect (Phase A2) — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

loopkit's half of `Merqo Business/docs/business/2026-08-16-telegram-
integration-design.md`'s Phase A2 — retires loopkit's own Telegram bot
(shipped in `2026-08-16-telegram-reward-alerts-design.md`, Phase A) in
favor of merqo's shared one. **Read the master doc's "Phase A2" section
first**, same reasoning as qkit's own equivalent spec
(`../../qkit/docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`) —
not re-derived here.

Depends on merqo's own spec
(`../../merqo/docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`)
shipping first.

## Guiding decisions

- **Retirement, not addition** — delete `loopkit.vendor_telegram`,
  `loopkit.telegram_link_tokens`, `src/app/api/telegram/webhook/`,
  `src/lib/telegram.ts`, `src/lib/telegram-link.ts`, the dashboard's
  `connect-telegram-section.tsx` and its render call in
  `src/app/dashboard/settings/page.tsx`, `disconnectTelegramAction` (in
  `src/app/dashboard/actions.ts`), and `TELEGRAM_BOT_TOKEN`/
  `TELEGRAM_WEBHOOK_SECRET`.
- **No data carries over** — same real consequence as qkit's spec: a
  vendor who linked loopkit's own bot loses that link and must reconnect
  via merqo's profile page once.
- **`notifyRedemptionOnTelegram` keeps its name and call site**
  (`redeemAction`, `src/app/dashboard/actions.ts`) — only its internals
  change, from a local `vendor_telegram` lookup + local
  `sendTelegramMessage` to merqo's `notify-vendor` endpoint. Same
  fire-and-forget rule as before.
- **Distinct from, and unaffected by, this repo's `notifyCustomerByPhone`
  call** (the separate, already-shipped customer-facing Phase B+D reuse
  path in the same `redeemAction`) — that one stays exactly as-is, it
  already calls merqo, this spec only touches the vendor-alert call
  sitting right next to it.

## What changes

### `supabase/migrations/00XX_drop_vendor_telegram.sql` (new — next free id)

```sql
drop table loopkit.telegram_link_tokens;
drop table loopkit.vendor_telegram;
```

### `src/app/dashboard/actions.ts`

`notifyRedemptionOnTelegram(vendorId, card)`: replace its body — instead
of a local `vendor_telegram`/`sendTelegramMessage` call, calls
`notifyVendor(vendorId, message)` from `src/lib/merqo-customer-notify.ts`
(the module this repo already added for the customer-facing reuse call —
add `notifyVendor` as a sibling export there, same HTTP-client shape as
the existing `notifyCustomerByPhone`). Still wrapped so a failure never
affects `redeemAction`'s own returned result.

Remove `disconnectTelegramAction` entirely (it managed loopkit's own bot
link, which no longer exists) and its call site in the settings page.

### Deleted entirely

- `src/app/api/telegram/webhook/` (route + test)
- `src/lib/telegram.ts` (+ test)
- `src/lib/telegram-link.ts` (+ test)
- `src/app/dashboard/settings/connect-telegram-section.tsx` (+ test) and
  its render call in `src/app/dashboard/settings/page.tsx`
- `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` from `.env.example`

### `src/lib/merqo-customer-notify.ts` (extend)

Add `notifyVendor(vendorId: string, message: string): Promise<void>`,
same fail-closed/never-throw shape as the existing `notifyCustomerByPhone`,
posting to merqo's `POST /api/merqo/notify-vendor`.

## Testing

- Extend `src/lib/merqo-customer-notify.test.ts`: `notifyVendor` posts
  the right body/headers, never throws.
- `test/app/dashboard-actions.test.ts` (rewrite the existing Telegram
  vendor-alert block, not add alongside): `redeemAction` calls
  `notifyVendor` with the vendor's own id; a `notifyVendor` failure
  doesn't change `redeemAction`'s own returned result. The separate
  `notifyCustomerByPhone` assertions stay untouched.
- Delete the deleted files' own test files along with them.

## Self-review

- No placeholders.
- Deletion-heavy spec, same self-review requirement as qkit's — confirm
  every Phase A file is actually removed, not left as dead code.
- Does not touch or re-litigate the already-shipped customer-facing
  `notifyCustomerByPhone` path in the same file.

## Parent

[specs](README.md)
