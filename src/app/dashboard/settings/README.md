# settings

## Purpose

Vendor integrations page at `/dashboard/settings` — one section for connecting loopkit with qkit's earn config, another for the customer redemption-notification toggle. Reward-redemption vendor alerts now route through merqo's own shared Telegram bot (Phase A2) — vendors connect once via merqo's profile page, not here.

## Contents

- `page.tsx` — `SettingsPage` server component; requires a vendor, loads stamp-type programs plus the vendor's existing `qkit_earn_config` and `vendor_notify_settings` rows, and renders `@merqo/ui`'s `BackButton` ("Back to dashboard") above `QkitEarnSettings` and `CustomerNotifySettings` (`../customer-notify-settings.tsx`). Its root element is `<div className="mx-auto max-w-2xl space-y-8">` — deliberately narrower than the `../layout.tsx` `<main>`'s shared `max-w-7xl` (this single-section settings form genuinely reads better constrained), so it nests its own `mx-auto`/`max-w-*` wrapper inside that container rather than stretching full-width; the page no longer sets its own padding, which the layout's `<main>` now owns.

## Server-component note

The back nav here renders `@merqo/ui`'s `BackButton` with no
`LinkComponent` override. This page is a Server Component, and passing
`next/link` in as a prop sends a function across the Server → Client
boundary (`@merqo/ui` is client-bannered package-wide), which Next rejects
at render. `BackButton` falls back to a plain `<a>`.

## Parent

[dashboard](../README.md)
