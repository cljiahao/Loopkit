# merqo

## Purpose

Vitest tests for the `src/app/api/merqo/` route handlers — the HTTP surface
merqo calls into loopkit over.

## Contents

- `metrics.test.ts` — `GET /api/merqo/metrics`: bearer-secret auth (missing/wrong → 401) and the happy-path metrics payload
- `qkit-earn-config.test.ts` — `GET /api/merqo/qkit-earn-config`: bearer-secret auth, missing `vendor_id` → 400, config lookup by vendor
- `vendor-provision.test.ts` — `POST /api/merqo/vendor-provision`: bearer auth (missing → 401), first-provision creates the vendor row and calls `provision_default_program`, re-provision (vendor row `23505` conflict) still calls `provision_default_program` unconditionally — which is a no-op returning a null id when the vendor already has a program, not an error — reports `plan: "pro"` when a `vendor_pro` row exists, 500 when `provision_default_program` errors (both on first provision and on a re-provision), 400 on a foreign-key violation (unknown `user_id`), and that a successful response (first provision or re-provision alike) records an `admin_audit` row attributing the action to the provisioned vendor's own id with `detail.actor: "merqo_system"` — while a failed provision records nothing
- `vendor-status.test.ts` — `GET /api/merqo/vendor-status`: 401/400 auth and validation, resolves a vendor found on `listUsers`' first page, paginates past a full first page to find one on page 2 (asserting the exact `{page, perPage}` args per call), stops once a partial page comes back, and 503s on a `listUsers` or table-read error
- `vendor-activity.test.ts` — `GET /api/merqo/vendor-activity`: 401 missing/wrong bearer, 400 missing `email`, 404 unknown vendor, 200 `active:false` for a vendor with no programs, 200 with real computed metrics for a vendor with programs, 503 on a `listUsers`/table-read failure

## Parent

[api](../README.md)
