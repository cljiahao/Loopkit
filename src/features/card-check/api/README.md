# api

## Purpose

Server-side card-check logic: the two public `"use server"` actions behind
`/c?v=<vendorId>`.

## Contents

- `actions.ts` — `checkStatusAction`: no-auth action that enrolls a phone
  into every active program at a vendor via the `vendor_join` RPC (which
  also returns every card the phone already holds there), then computes
  per-card progress with `getProgress` and a QR (`qrSvg`) for each row.
  When the form carries a `ref` field (a host/couple referral link, `/c?ref=`
  — `src/app/dashboard/referrals/`), it calls `vendor_join_referred`
  instead, same return shape plus a `referral_credit` column; when that
  column signals a pending non-stamp-type credit (stamp-type programs are
  already credited inline by the RPC), `creditReferralHost` computes the
  next state via the TS engine's `applyVisit` and finishes it through
  `apply_referral_credit` — wrapped so a failure there never affects
  `checkStatusAction`'s own result, the guest's own join having already
  succeeded by that point. `regenerateCardAction`: reissues one program's
  card via the `regenerate_card` RPC for a lost or expired card, same
  phone-as-identity trust model, acting on one program at a time (invoked
  per-card from the check-form's card list)
- `actions.test.ts` — vitest tests for `checkStatusAction`'s referral path:
  dispatches to `vendor_join` vs. `vendor_join_referred` based on whether
  `ref` is present, calls `apply_referral_credit` only for a pending
  non-stamp credit (never for an already-credited stamp-type row), and logs
  (without throwing or changing the result) when the finish call fails

## Connectivity

N/A — no subfolders. Note that `types.ts` (the shared `CardStatus`/
`StatusState` types `actions.ts` returns) lives one level up at the
feature root, not inside this folder, since both `api/actions.ts` and
`components/check-form.tsx` import it.

## Parent

[card-check](../README.md)
