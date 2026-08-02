# landing

## Purpose

Marketing sections composed by `src/app/page.tsx` into the public loopkit
landing page.

## Contents

- `benefits.tsx` — `Benefits`: 3-column value-prop grid ("Regulars, not one-offs" / "Zero friction" / "Built for a stall"), icon + title + body per item
- `footer.tsx` — `Footer`: single-row site footer matching qkit's landing footer exactly — `Wordmark`, tagline, copyright line, `Vendor sign in →` link. No bottom call-to-action band above it (removed to match qkit, which never had one).
- `back-to-top.tsx` — `BackToTop`: fixed-position scroll-to-top button (ported from qkit), shown past a scroll threshold
- `hero.tsx` — `Hero`: above-the-fold headline/subhead/CTA buttons/trust bullets plus the `StampCard` illustration, links to `/dashboard` when `authed` else `/login?mode=signup`
- `how-it-works.tsx` — `HowItWorks`: numbered 3-step explainer (set up card → stamp by phone → they come back), anchored `id="how"`
- `nav.tsx` — `Nav`: sticky header (`px-5 py-4`, matching qkit's landing-header sizing exactly) with `Wordmark`, an FAQ button (`#faq` same-page anchor, hidden below `sm`), and either a Dashboard button (authed) or Sign in link + Get started button (signed out)
- `nav.test.tsx` — asserts the sticky header carries qkit's `px-5 py-4 backdrop-blur-md` classes
- `stamp-card.tsx` — `StampCard`: static illustrative 8-slot stamp card (6 stamped, 1 reward slot) used in the hero, pure markup with no image
- `wordmark.tsx` — `Wordmark`: "LoopKit" text logo with the "oo" rendered in gold as the brand's stamp-dot motif

## Parent

[components](../README.md)
