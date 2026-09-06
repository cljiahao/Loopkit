# accept

## Purpose

The legal-acceptance interstitial `requireCurrentLegalAcceptance`
(`@/lib/legal-gate`) redirects a signed-in vendor to when their accepted
terms/privacy versions are behind `@merqo/ui`'s `LEGAL_VERSIONS`.

## Contents

- `page.tsx` — `LegalAcceptPage`. Reads the `next` search param (through
  `safeRedirectPath`, `@/lib/safe-redirect`) and renders the client form.
  Deliberately runs **no** legal-gate check itself — it is what the gate
  redirects to, so gating it would loop.
- `accept-form.tsx` — `AcceptForm`, a client component wrapping
  `@merqo/ui`'s `TermsAcceptanceCheckbox` (checkbox + legal-name field); the
  submit button is disabled until both are filled. Posts to `acceptLegalTerms`.
- `actions.ts` — `acceptLegalTerms` server action. Re-checks for a
  signed-in user (redirects to `/login` otherwise), reads and trim-validates
  the submitted `legal_name` (throws if empty), and reads the real `ip`
  (via a local `clientIp` helper reading `x-forwarded-for`/`x-real-ip`) and
  `user_agent` off the request's own `headers()`. It then `POST`s
  `/api/merqo/legal-accept` on merqo once per doc type (`terms`, `privacy`) —
  bearer-authed with `MERQO_CUSTOMER_SECRET`, `kit_slug: "loopkit"`, each body
  carrying the SHA-256 of that doc's `getLegalDocSource(...)` plus
  `legal_name`/`ip`/`user_agent`. Each call is independent, and merqo maps a
  duplicate `(email, doc_type, doc_version)` to a success, so a conflict on
  one doc never blocks the other. On success it primes the local
  `legal_check_state` cache to `is_current = true` and redirects to a
  `safeRedirectPath`-checked `next` (default `/dashboard`).
- `actions.test.ts` — covers the two independent posts (asserting
  `legal_name`/`ip`/`user_agent` land in both bodies), the missing/whitespace-
  only `legal_name` throw, the cache prime, `next`-param safety (absolute /
  protocol-relative rejected), the no-user and missing-secret branches, and a
  non-2xx throw.

## Parent

[legal](../README.md)
