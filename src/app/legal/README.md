# legal

## Purpose

The public legal-document pages and the acceptance interstitial. Content
lives in `@merqo/ui` (one source, shared by merqo and every kit); loopkit
only routes to it and, on `accept/`, records the vendor's acceptance with
merqo.

## Contents

- `terms/`
- `privacy/`
- `accept/`

## Connectivity

loopkit owns no acceptance record — merqo does (`merqo.legal_acceptances`).
The gate that sends vendors here lives in `@/lib/legal-gate`
(`requireCurrentLegalAcceptance`), wired into `requireVendor`
(`src/features/auth/api/require-vendor.ts`), loopkit's single vendor-gate
entry point — every dashboard/setup page and layout goes through it, so
there is no second call site to wire. `terms/` and `privacy/` are also
linked from the landing footer (`@merqo/ui`'s `LegalFooterLinks` in
`src/components/landing/footer.tsx`).

## Parent

[app](../README.md)
