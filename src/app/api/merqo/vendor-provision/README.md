# vendor-provision

## Purpose

Push-provisioning endpoint: Merqo hub calls this to activate loopkit for a vendor who hasn't signed up directly, keyed on their existing (shared) `auth.users.id`. Creates the vendor row AND a default "Starter" stamp program (loopkit's own `create_program` RPC can't be used here — see `provision_default_program`'s migration comment) so the vendor is genuinely active immediately, not left without a program.

## Contents

- `route.ts` — `POST(request)`. Guarded by `provisionBearerOk()` (`MERQO_PROVISION_SECRET`, distinct from `vendor-status`/`metrics`'s `MERQO_METRICS_SECRET`). Inserts into `vendors`; a `23505` is treated as already-provisioned, not an error. On first creation only, calls `loopkit.provision_default_program(p_vendor_id)` (service-role-only RPC) to create one default stamp program — never on re-provision, so an existing/customized program is never touched.

## Connectivity

Calls `createServiceClient()`, `provisionBearerOk()`, and the `provision_default_program` RPC (`supabase/migrations/0032_loopkit_provision_default_program.sql`).

## Parent

[merqo](../README.md)
