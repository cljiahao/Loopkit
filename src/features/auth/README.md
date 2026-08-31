# auth

## Purpose

Authentication: login (Google OAuth, email/password), the shared
`requireVendor` guard used across dashboard/setup, and password reset.

## Contents

- `api/`
- `components/`
- `index.ts` — barrel re-exporting `requireVendor`, `LoginForm`,
  `ResetPasswordForm`

## Connectivity

`index.ts` is the only path external code should import from — dashboard/setup
pages import `requireVendor` through it, and `src/app/login/` and
`src/app/reset-password/` import their form components through it. `api/`
and `components/` are private internals, not meant to be imported directly
from outside this folder.

## Parent

[features](../README.md)
