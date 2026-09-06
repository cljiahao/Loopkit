# terms

## Purpose

The public Terms of Service page.

## Contents

- `page.tsx` — `TermsPage`, a one-line Server Component rendering
  `@merqo/ui`'s `<LegalDocument doc="terms" />` (the component brings its own
  `mx-auto max-w-3xl` prose container, so there's no local layout).
- `page.dom.test.tsx` — jsdom test asserting `TermsPage` renders
  `LegalDocument` with `doc="terms"`.

## Parent

[legal](../README.md)
