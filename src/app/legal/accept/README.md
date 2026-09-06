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
- `page.dom.test.tsx` — jsdom tests asserting the heading renders and that a
  safe `next` param passes through to `AcceptForm` unchanged while an
  unsafe/missing one falls back to `/dashboard`.
- `accept-form.tsx` — `AcceptForm`, a client component wrapping
  `@merqo/ui`'s `TermsAcceptanceCheckbox` (just the agree checkbox — no
  typed name); the submit button is disabled until it's checked. Posts to
  `acceptLegalTerms`.
- `accept-form.dom.test.tsx` — jsdom tests asserting the hidden `next`
  field carries the prop through and Continue stays disabled until the
  checkbox is checked.
- `actions.ts` — `acceptLegalTerms` server action. Re-checks for a
  signed-in user (redirects to `/login` otherwise), reads the real `ip`
  (via a local `clientIp` helper reading `x-forwarded-for`/`x-real-ip`) and
  `user_agent` off the request's own `headers()`. It then `POST`s
  `/api/merqo/legal-accept` on merqo once per doc type (`terms`, `privacy`) —
  bearer-authed with `MERQO_CUSTOMER_SECRET`, `kit_slug: "loopkit"`, each body
  carrying the SHA-256 of that doc's `getLegalDocSource(...)` plus
  `ip`/`user_agent`. Each call is independent, and merqo maps a
  duplicate `(email, doc_type, doc_version)` to a success, so a conflict on
  one doc never blocks the other. On success it primes the local
  `legal_check_state` cache to `is_current = true` and redirects to a
  `safeRedirectPath`-checked `next` (default `/dashboard`).
- `actions.test.ts` — covers the two independent posts (asserting
  `ip`/`user_agent` land in both bodies), the cache prime, `next`-param
  safety (absolute / protocol-relative rejected), the no-user and
  missing-secret branches, a non-2xx throw, and `clientIp`'s fallback
  chain (`x-real-ip` when `x-forwarded-for` is absent, `"unknown"` when
  neither header is present).

## Parent

[legal](../README.md)
