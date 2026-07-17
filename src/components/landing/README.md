# landing

## Purpose

Marketing sections composed by `src/app/page.tsx` into the public loopkit
landing page.

## Contents

- `benefits.tsx` — `Benefits`: 3-column value-prop grid ("Regulars, not one-offs" / "Zero friction" / "Built for a stall"), icon + title + body per item
- `cta.tsx` — `Cta`: bottom call-to-action band, links to `/dashboard` when `authed` else `/login?mode=signup`
- `footer.tsx` — `Footer`: site footer with `Wordmark`, tagline, login link, copyright line
- `hero.tsx` — `Hero`: above-the-fold headline/subhead/CTA buttons/trust bullets plus the `StampCard` illustration, links to `/dashboard` when `authed` else `/login?mode=signup`
- `how-it-works.tsx` — `HowItWorks`: numbered 3-step explainer (set up card → stamp by phone → they come back), anchored `id="how"`
- `nav.tsx` — `Nav`: sticky header with `Wordmark`, and either a Dashboard button (authed) or Log in link + Get started button (signed out)
- `stamp-card.tsx` — `StampCard`: static illustrative 8-slot stamp card (6 stamped, 1 reward slot) used in the hero, pure markup with no image
- `wordmark.tsx` — `Wordmark`: "LoopKit" text logo with the "oo" rendered in gold as the brand's stamp-dot motif

## Parent

[components](../README.md)
