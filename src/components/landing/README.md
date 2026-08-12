# landing

## Purpose

Marketing sections composed by `src/app/page.tsx` into the public loopkit
landing page.

## Contents

- `benefits.tsx` — `Benefits`: eyebrow ("Why vendors switch") + `h2` heading above a 3-column value-prop grid ("Regulars, not one-offs" / "Zero friction" / "Built for a stall"), icon + title + body per item — `border-t` section wrapper matches `how-it-works.tsx`'s divider/heading pattern
- `footer.tsx` — `Footer`: single-row site footer matching qkit's landing footer exactly — `Wordmark`, tagline, copyright line, `Vendor sign in →` link. No bottom call-to-action band above it (removed to match qkit, which never had one).
- `footer.test.tsx` — asserts the wordmark link, tagline, copyright line, and sign-in link all render.
- `back-to-top.tsx` — `BackToTop`: fixed-position scroll-to-top button (ported from qkit), shown past a scroll threshold
- `faq.tsx` — `Faq`: eyebrow ("Questions") + `h2` heading, `border-t` section wrapper matching `how-it-works.tsx`'s pattern, above an accordion of `<details>`-based `FaqItem`s (setup time, app-free claim, reward payout, multi-program tiering), anchored `id="faq"`
- `hero.tsx` — `Hero`: above-the-fold headline/subhead/CTA buttons/trust bullets plus the `StampCard` illustration, links to `/dashboard` when `authed` else `/login?mode=signup`
- `how-it-works.tsx` — `HowItWorks`: numbered 3-step explainer (set up card → stamp by phone → they come back), anchored `id="how"`
- `nav.tsx` — `Nav`: delegates the sticky-header shell to `@merqo/ui`'s `LandingNav` (`wordmark`/`end` slot component — sticky, bordered, `px-5 py-4 backdrop-blur-md`, `max-w-6xl` inner row, matching qkit's landing-header sizing exactly), supplying `Wordmark` + sr-only "loopkit home" text as `wordmark` and an FAQ button (`#faq` same-page anchor, hidden below `sm`) plus either a Dashboard button (authed) or Sign in link + Get started button (signed out) as `end`
- `nav.test.tsx` — asserts the sticky header carries qkit's `px-5 py-4 backdrop-blur-md` classes
- `stamp-card.tsx` — `StampCard`: illustrative 8-slot stamp card (6 stamped, 1 reward slot) used in the hero, pure markup with no image; the 6th (last-stamped) dot plays `motion-safe:animate-stamp-pop` once on load, delayed 0.5s to land just after the hero's `fade-rise` reveal finishes — same class/keyframe `StampDots` uses for a real stamp landing
- `wordmark.tsx` — `Wordmark`: "LoopKit" text logo with the "oo" rendered in gold as the brand's stamp-dot motif

## Parent

[components](../README.md)
