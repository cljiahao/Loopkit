# c

## Purpose

Customer-facing, unauthenticated QR-entry route — the actual card-check UI
lives in `@/features/card-check`.

## Contents

- `page.tsx` — `CheckPage`: thin route entry that resolves the vendor's
  active programs from the `v` search param via the `vendor_active_programs`
  RPC (public, `SECURITY DEFINER`; an unknown vendor id just returns an
  empty list), then renders `CheckForm` from `@/features/card-check`, passing
  through an optional `ref` search param (a host/couple referral link —
  `src/app/dashboard/referrals/`) as `CheckForm`'s `referralCode` prop

## Parent

[app](../README.md)
