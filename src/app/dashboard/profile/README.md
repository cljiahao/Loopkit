# profile

## Purpose

Vendor profile page at `/dashboard/profile` — lets a vendor edit their stall name, social/website links, profile icon, private display name, and sign-in password, each saved independently.

## Contents

- `actions.test.ts` — unit tests for `updateSocialLinksAction`: saves valid links while preserving the existing `stall_name`, rejects an invalid URL without calling `upsertVendorProfile`, errors when not signed in, and errors (without revalidating) when the upsert throws.
- `actions.ts` — server actions `updateStallNameAction()` (thin wrapper around `saveStallName`, `src/lib/vendor.ts`, revalidates the dashboard layout), `updatePasswordAction()` (Zod-validates an 8-72 char password, updates it via the Supabase auth client), and `updateSocialLinksAction()` (Zod-validates each link as an optional URL, preserves the shared `merqo.vendor_profile` row's `stall_name` while upserting `social_links`).
- `page.tsx` — `ProfilePage` server component; requires a vendor, loads the vendor profile (`getVendorProfile()`, `src/lib/vendor.ts`) and auth `user_metadata` display name, reads the shared `merqo.vendor_profile` row's `social_links` (degrading to `{}` on failure, same pattern as `/setup`'s page), and renders a `BackButton` ("Back to dashboard") above `ProfileForm`. Its root element is `<div className="mx-auto max-w-lg space-y-8 md:max-w-4xl">` — deliberately narrower than the `../layout.tsx` `<main>`'s shared `max-w-7xl` (this form genuinely reads better constrained), so it nests its own `mx-auto`/`max-w-*` wrapper inside that container rather than stretching full-width; the page no longer sets its own padding, which the layout's `<main>` now owns.
- `profile-form.dom.test.tsx` — jsdom tests for `ProfileForm`: renders all 5 sections, prefills the social-links fields from `socialLinks` and saves them via `updateSocialLinksAction`, saves the stall name via `updateStallNameAction`.
- `profile-form.tsx` — `ProfileForm` client component; `@merqo/ui`'s `TwoColumnSections` (column 1: stall name, profile icon, change password; column 2: display name, social links — the locked cross-kit order) of five independently-saving `Section` cards (stall name via server action, social/website links via `SocialLinksFields` + server action, avatar via `@merqo/ui`'s `ImageUploader` + browser auth client, display name via browser auth client, password change with client-side confirm match).

## Parent

[dashboard](../README.md)
