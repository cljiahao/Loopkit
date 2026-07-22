# merqo

## Purpose

Vitest tests for the `src/app/api/merqo/` route handlers — the HTTP surface
merqo calls into loopkit over.

## Contents

- `metrics.test.ts` — `GET /api/merqo/metrics`: bearer-secret auth (missing/wrong → 401) and the happy-path metrics payload
- `qkit-earn-config.test.ts` — `GET /api/merqo/qkit-earn-config`: bearer-secret auth, missing `vendor_id` → 400, config lookup by vendor
- `vendor-status.test.ts` — `GET /api/merqo/vendor-status`: 401/400 auth and validation, resolves a vendor found on `listUsers`' first page, paginates past a full first page to find one on page 2 (asserting the exact `{page, perPage}` args per call), stops once a partial page comes back, and 503s on a `listUsers` or table-read error

## Parent

[api](../README.md)
