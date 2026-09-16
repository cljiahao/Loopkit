# terms

## Purpose

The public Terms of Service page.

## Contents

- `page.tsx` — `TermsPage`, a one-line Server Component rendering
  `@merqo/ui`'s `<LegalDocument doc="terms" kit="loopkit" />` (the component
  brings its own `mx-auto max-w-3xl` prose container, so there's no local
  layout). The `kit` prop scopes the rendered Annex to loopkit's own
  schedule only, not every sibling kit's.
- `page.dom.test.tsx` — jsdom test asserting `TermsPage` renders
  `LegalDocument` with `doc="terms"`.

## Parent

[legal](../README.md)
