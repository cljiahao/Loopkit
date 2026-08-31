# components

## Purpose

Client-side auth UI.

## Contents

- `google-mark.tsx` — `GoogleMark`: the Google "G" icon SVG, extracted out
  of `login-form.tsx` so it matches the shared component used across every
  kit's login page.
- `login-form.tsx` — `LoginForm`: `ElevatedCard`-wrapped Google OAuth
  sign-in (forces `hl=en` on the consent screen, cross-kit parity) and
  email/password sign-in/sign-up on react-hook-form + `loginSchema`
  (`@/lib/schemas`) with a "check your email" state for signup confirmation
  and password-reset links; auth/server errors (Google OAuth, sign-in/up,
  forgot-password) surface via sonner toasts, field-validation errors
  render inline. The wordmark above the card is a home link with a
  mode-independent tagline ("Loyalty for Singapore's small vendors."),
  matching qkit's reference login pattern exactly — same two sign-in paths,
  no third. A 2026-07-11 name+phone onboarding option (anonymous Supabase
  session, no account recovery) was removed 2026-09-01 for this reason —
  see `docs/superpowers/specs/2026-07-11-vendor-phone-onboarding-design.md`.
- `reset-password-form.tsx` — `ResetPasswordForm`: `ElevatedCard`-wrapped
  password + confirm-password form on an active recovery session, calls
  `supabase.auth.updateUser` then redirects to `/dashboard`

## Parent

[auth](../README.md)
