# profile

## Purpose

Vendor profile page at `/dashboard/profile` — lets a vendor edit their stall name, social/website links, profile icon, private display name, and sign-in password, each saved independently.

## Contents

- `actions.test.ts` — unit tests for `updateStallNameAction` (saves a valid name while preserving the existing `social_links`, rejects an empty name without calling `upsertVendorProfile`, errors when not signed in, errors without revalidating when the upsert throws) and `updateSocialLinksAction` (saves valid links while preserving the existing `stall_name`, rejects an invalid URL without calling `upsertVendorProfile`, errors when not signed in, and errors (without revalidating) when the upsert throws).
- `actions.ts` — server actions `updateStallNameAction()` and `updateSocialLinksAction()` both write the shared `merqo.vendor_profile` row via `getOrCreateVendorProfile`/`upsertVendorProfile` (each preserving the other's field), revalidating the dashboard layout/profile path — NOT `loopkit.vendors.name`, which is a pre-cutover local column no longer written by this page — plus `updatePasswordAction()` (Zod-validates an 8-72 char password, updates it via the Supabase auth client).
- `page.tsx` — `ProfilePage` server component; requires a vendor, loads the auth `user_metadata` display name and the local `loopkit.vendors.name` (used only as the shared row's seed default), reads the shared `merqo.vendor_profile` row for the live stall name + social links (degrading to the local name/`{}` on failure, same pattern as `/setup`'s page), and renders `ProfileForm`.
- `profile-form.dom.test.tsx` — jsdom tests for `ProfileForm`: renders all 5 sections, prefills the social-links fields from `socialLinks` and saves them via `updateSocialLinksAction`, saves the stall name via `updateStallNameAction`.
- `profile-form.tsx` — `ProfileForm` client component; two independent flex-column stacks (column 1: stall name, profile icon, change password; column 2: display name, social links — the locked cross-kit order) of five independently-saving `Section` cards (stall name via server action, social/website links via `SocialLinksFields` + server action, avatar via `ImageUploader` + browser auth client, display name via browser auth client, password change with client-side confirm match).

## Parent

[dashboard](../README.md)
