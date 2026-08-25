# card-check

## Purpose

The public, unauthenticated card-check flow reached via `/c?v=<vendorId>`
(optionally `&ref=<code>`, a host/couple referral link —
`src/app/dashboard/referrals/`) — a customer checks or enrolls their
loyalty card by phone number, and can self-service regenerate a
lost/expired card. A `ref` link additionally credits the referring host
one stamp/visit the first time each distinct guest phone joins through it.
A found card also offers an optional, self-entered birthday — vendors can
opt a Stamp program into granting a bonus stamp on it (migration `0041`).

## Contents

- `api/`
- `components/`
- `index.ts` — barrel re-exporting `CheckForm`
- `types.ts` — shared `CardStatus`/`StatusState` types and the
  `STATUS_IDLE` constant

## Connectivity

`index.ts` is the only path external code should import from —
`src/app/c/page.tsx` imports `CheckForm` through it. `api/` and
`components/` are private implementation, consumed internally by
`index.ts` and by each other (`components/check-form.tsx` imports
`checkStatusAction` from `../api/actions`, `components/program-card-status.tsx`
imports `regenerateCardAction` from `../api/actions`).

## Parent

[features](../README.md)
