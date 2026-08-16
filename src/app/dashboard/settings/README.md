# settings

## Purpose

Vendor integrations page at `/dashboard/settings` — one section for connecting loopkit with qkit's earn config, plus a "Connect Telegram" section for reward-redemption alerts.

## Contents

- `page.tsx` — `SettingsPage` server component; requires a vendor, loads stamp-type programs plus the vendor's existing `qkit_earn_config` row, and renders a `BackButton` ("Back to dashboard") above `QkitEarnSettings` and `ConnectTelegramSection`. Its root element is `<div className="mx-auto max-w-2xl space-y-8">` — deliberately narrower than the `../layout.tsx` `<main>`'s shared `max-w-7xl` (this single-section settings form genuinely reads better constrained), so it nests its own `mx-auto`/`max-w-*` wrapper inside that container rather than stretching full-width; the page no longer sets its own padding, which the layout's `<main>` now owns. `buildDisconnectedTelegramSection` (module-private) reads `vendor_telegram` directly via the page's own `createServerClient()` (own-row RLS select is enough — no service-role needed just to check "is this vendor linked"), and only calls `getOrCreateTelegramLinkToken`/`qrSvg` when disconnected AND `TELEGRAM_BOT_USERNAME` is set — an unconfigured bot renders a plain "not set up yet" message instead of a broken deep link, and a page reload never mints a fresh single-use token while a valid one is still outstanding.
- `connect-telegram-section.dom.test.tsx` — component tests for `ConnectTelegramSection`: renders the QR + tappable deep-link when disconnected and configured, a "not set up yet" message with no QR when unconfigured, a "Connected" state with a working disconnect action, and that a failed disconnect toasts an error without refreshing.
- `connect-telegram-section.tsx` — `ConnectTelegramSection`: a discriminated-union-props client component (`connected` / `connected:false,configured:false` / `connected:false,configured:true`) rendering the deep-link QR+link, a "not configured" message, or a "Connected" state with a `disconnectTelegramAction` button (`@/app/dashboard/actions`) that `router.refresh()`s on success and toasts on failure — the same `useAsyncAction`/`sonner` pattern as `../redeem-button.tsx`.

## Parent

[dashboard](../README.md)
