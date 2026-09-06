# about

## Purpose

The public "Why Merqo" page. Content is `@merqo/ui`'s shared `AboutMerqo`
component (the qkit origin story), not local copy — one source reused by
merqo and every kit's own `/about` page.

## Contents

- `page.tsx` — `AboutPage`, an async Server Component. Reflects the
  session (same pattern as `page.tsx` at the app root) so `Nav`'s CTA
  reads "Dashboard" for a signed-in vendor and the sign-in links
  otherwise. Wraps `AboutMerqo kitName="loopkit"` in loopkit's own
  `Nav`/`Footer`, with a "Back to loopkit" button as `AboutMerqo`'s
  `children`.
- `page.dom.test.tsx` — covers the story rendering, the "Back to
  loopkit" CTA's href, and the signed-in-vendor Dashboard CTA.

## Connectivity

Linked from `Nav` (`src/components/landing/nav.tsx`) and `Footer`
(`src/components/landing/footer.tsx`).

## Parent

[app](../README.md)
