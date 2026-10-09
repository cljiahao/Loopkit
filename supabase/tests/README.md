# Database tests

## Purpose

Run rollback-only pgTAP fixtures against a migrated local Supabase database with
`supabase test db`. These tests require Docker's Linux engine; prepared audit
fixtures have not yet been executed in this checkout.

## Contents

- `rls.test.sql` contains 96 assertions for vendor isolation, upgrade requests,
  retired local feedback writes, notification settings, referral operations,
  provisioning, birthday bonuses, manual adjustments, legal-cache isolation and
  storage limits. Owner-level legacy reward fixtures do not prove anonymous
  authorization of the current customer endpoints.
- `customer-capability.test.sql` and `earn-customer-capability.test.sql` exercise
  customer and earn proofs; `retired-rpc-permissions.test.sql` checks retired RPC
  grants.
- `reward-rpc.test.sql`, `plant-redemption.test.sql` and
  `plant-redemption-parity.test.sql` exercise reward state and redemption contracts.
- `visit-compare-and-swap.test.sql` and `referral-cas.test.sql` cover state snapshot
  conflicts; `atomic-program-replacement.test.sql` covers replacement contracts.
- `points-and-voucher-locks.test.sql` and `stamp-redemption.test.sql` cover lock
  ordering and voucher status; `isolation/stamp-redemption.spec` is a separate
  PostgreSQL multi-session isolation fixture, not automatically run by pgTAP.
- `audit-truncate-privilege.test.sql` checks effective maintenance privileges and
  denied audit truncation; `legacy-feedback-privileges.test.sql` checks retired
  client writes and retained service maintenance access.

Mocked application tests and SQL source-string assertions cannot establish live
RLS or concurrent transaction behavior. Report database execution separately.

## Parent

[supabase](../README.md)
