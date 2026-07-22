# vendor-status

## Purpose

GET endpoint resolving a vendor's status by email for Merqo — used to look
up whether an email belongs to an active/Pro loopkit vendor.

## Contents

- `route.ts` — `GET`: bearer-auth via `bearerOk()`, validates an `email` query param with Zod, reads every auth user (via `listAllUsers()`, `src/lib/list-all-users.ts` — paginates past the first 1000, fixing a prior known limitation) plus `programs`/`vendor_pro` via the service-role client, resolves status with `resolveVendorStatus()`, returns it as JSON.

## Parent

[merqo](../README.md)
