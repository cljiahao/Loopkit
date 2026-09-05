# redeem-voucher

## Purpose

Vendor scan-confirm screen for one catalog-mode Points Club reward voucher — distinct from the Counter page, which handles every other stamp/visit/redeem action.

## Contents

- `page.tsx` — `RedeemVoucherPage` server component; resolves `?token=` via `getVoucherByToken` (owner-gated), redirects to `/dashboard` with no token, shows a not-found/already-redeemed message or renders `RedeemVoucherConfirm`.
- `redeem-voucher-confirm.tsx` — `RedeemVoucherConfirm`: shows the reward text + customer phone, a single "Redeem" button calling `redeemVoucherAction`, and a redeemed confirmation state.
- `redeem-voucher-confirm.dom.test.tsx` — jsdom tests: renders reward/phone, confirms redemption and shows the success state, stays on the confirm screen with a toast on failure.

## Parent

[dashboard](../README.md)
