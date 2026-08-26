# vendor-activity

## Purpose

`GET /api/merqo/vendor-activity?email=` — merqo's cross-kit vendor detail
view calls this to show real per-vendor loyalty activity instead of just
kit grants. Generalizes the `vendor-status` endpoint's `{active, plan}`
into richer, generic `{active, plan, status, metrics, lastActivityAt}`.

## Contents

- `route.ts` — `GET`: bearer-auth via `bearerOk()`, resolves the email to
  a vendor via `listAllUsers()`, 404s if no such user exists, otherwise
  rolls up their programs/cards/stamp events via
  `src/lib/merqo-vendor-activity.ts`'s `computeVendorActivity` and returns
  the shared contract (`status` is always `null` — loopkit has no
  per-vendor health concept yet, only program-level).

## Parent

[merqo](../README.md)
