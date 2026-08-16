# webhook

## Purpose

`POST` endpoint Telegram calls on every bot update — the one place a
vendor's Telegram account gets linked to their `vendor_id`.

## Contents

- `route.test.ts` — unit tests for `POST`: 401 on a missing/wrong
  `X-Telegram-Bot-Api-Secret-Token` header (checked before any data is
  touched); a valid unexpired `/start <token>` upserts `vendor_telegram`
  and deletes the token, then sends a confirmation; an expired or unknown
  token, a non-`/start` message, and a token-lookup failure all respond
  `200` without writing anything; a non-Telegram-shaped (unparsable) body
  responds `200` instead of `500`.
- `route.ts` — `POST`: verifies the secret-token header via a constant-time
  compare against `TELEGRAM_WEBHOOK_SECRET` (same rationale as
  `@/lib/merqo-auth`'s `bearerOk`, since this endpoint has no session
  cookie — the header value IS the entire authentication). Parses the
  Telegram `Update`; a `/start <token>` message resolves the token in
  `telegram_link_tokens` (service-role client), rejects a missing/expired
  token silently, else upserts `vendor_telegram` with the message's
  `chat.id`, deletes the token, and sends a confirmation via
  `sendTelegramMessage` (`@/lib/telegram`). Always responds `200` to a
  Telegram-shaped request — Telegram retries aggressively on non-2xx, so
  every failure path (lookup error, upsert error, unparsable body) is
  logged and swallowed rather than surfaced as an HTTP error.

## Connectivity

Linked from `src/app/dashboard/settings/`'s "Connect Telegram" section,
which issues the short-lived `telegram_link_tokens` row this route
resolves and renders the `https://t.me/<bot_username>?start=<token>`
deep-link as a QR code. Once linked, `redeemAction`
(`src/app/dashboard/actions.ts`) is the sole caller of `sendTelegramMessage`
for the vendor's own reward-redemption alerts — this route only handles
the one-time linking handshake, not the ongoing alert traffic.

## Parent

[telegram](../README.md)
