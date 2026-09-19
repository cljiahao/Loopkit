# redeem-voucher

## Purpose

Vendor scan-confirm screen for one catalog-mode Points Club reward voucher — distinct from the Counter page, which handles every other stamp/visit/redeem action.

## Contents

- `page.tsx` — `RedeemVoucherPage` server component; resolves `?token=` via `getVoucherByToken` (owner-gated), redirects to `/dashboard` with no token, shows a not-found/already-redeemed message or renders `RedeemVoucherConfirm`. Its own "Back to dashboard" nav is also `@merqo/ui`'s `BackButton` (`LinkComponent={Link}`).
- `redeem-voucher-confirm.tsx` — `RedeemVoucherConfirm`: shows the reward text + customer phone, a single "Redeem" button calling `redeemVoucherAction`, and a redeemed confirmation state. Its "Back to dashboard" nav is `@merqo/ui`'s `BackButton`, passed `LinkComponent={Link}` for a client-side transition.
- `redeem-voucher-confirm.dom.test.tsx` — jsdom tests: renders reward/phone, confirms redemption and shows the success state, stays on the confirm screen with a toast on failure.

## Server-component note

The back nav here renders `@merqo/ui`'s `BackButton` with no
`LinkComponent` override. This page is a Server Component, and passing
`next/link` in as a prop sends a function across the Server → Client
boundary (`@merqo/ui` is client-bannered package-wide), which Next rejects
at render. `BackButton` falls back to a plain `<a>`.

## Parent

[dashboard](../README.md)
