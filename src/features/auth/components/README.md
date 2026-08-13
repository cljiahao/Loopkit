# components

## Purpose

Client-side auth UI.

## Contents

- `google-mark.tsx` — `GoogleMark`: the Google "G" icon SVG, extracted out
  of `login-form.tsx` so it matches the shared component used across every
  kit's login page.
- `login-form.tsx` — `LoginForm`: `ElevatedCard`-wrapped Google OAuth
  sign-in (forces `hl=en` on the consent screen, cross-kit parity), a
  name+phone onboarding form (own hand-rolled busy/error state —
  establishes an anonymous Supabase session then calls
  `vendorPhoneOnboardAction`), and email/password sign-in/sign-up on
  react-hook-form + `loginSchema` (`@/lib/schemas`) with a "check your email"
  state for signup confirmation and password-reset links; auth/server errors
  (Google OAuth, sign-in/up, forgot-password) surface via sonner toasts,
  field-validation errors render inline. The wordmark above the card is a
  home link with a mode-independent tagline ("Loyalty for Singapore's small
  vendors."), matching qkit's reference login pattern — it previously read
  a static "Sign in to your loopkit dashboard." even in signup mode, while
  the card below it correctly switched to "Create your account."
- `reset-password-form.tsx` — `ResetPasswordForm`: `ElevatedCard`-wrapped
  password + confirm-password form on an active recovery session, calls
  `supabase.auth.updateUser` then redirects to `/dashboard`

## Parent

[auth](../README.md)
