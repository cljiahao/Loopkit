# merqo

## Purpose

Merqo-facing route handlers — bearer-token-authenticated endpoints the
Merqo platform polls for metrics, vendor status, qkit earn-config, and (new)
push-provisions a vendor onto loopkit.

## Contents

- `metrics/`
- `qkit-earn-config/`
- `vendor-provision/` — `POST` endpoint that creates a free-tier `vendors` row (and a default "Starter" stamp program) for a vendor id the Merqo hub is one-click-activating on loopkit.
- `vendor-status/`

## Connectivity

`metrics/`, `qkit-earn-config/`, and `vendor-status/` each expose a single
GET `route.ts` and share the same constant-time Bearer-token check —
`bearerOk(request, "MERQO_METRICS_SECRET")` (`@/lib/merqo-auth`) — against
`MERQO_METRICS_SECRET`. `vendor-provision/` instead uses
`provisionBearerOk(request)` (a thin `bearerOk` wrapper pinned to
`MERQO_PROVISION_SECRET`, same file) — it's a write capability (creates a
real tenant row), so it's deliberately not gated by the same secret as the
read-only/reporting routes; this mirrors qkit's identical split. `metrics/`
returns platform-wide counts, `vendor-status/` resolves a single vendor's
status by email, `qkit-earn-config/` returns whether a vendor's qkit-earn
integration is enabled, and `vendor-provision/` calls
`loopkit.provision_default_program` (idempotent, keyed on whether the
vendor already has any program row) via `supabase.rpc(...)` on the
service-role client.

## Parent

[api](../README.md)
