# actions

## Purpose

Top-level (not route-scoped) Server Actions — cross-cutting actions that
don't belong to any single `src/app/<route>/` page.

## Contents

- `feedback.test.ts` — vitest tests for `submitFeedbackAction`: RPC call shape (kit slug/nps/message), out-of-range `nps` rejected before the RPC, unauthenticated rejection, and a friendly error surfaced when the RPC fails
- `feedback.ts` — `submitFeedbackAction`: validates NPS (0–10) + optional message, then submits vendor feedback into the shared cross-kit `merqo.vendor_feedback` table via `submitVendorFeedback` (`src/lib/merqo-vendor-feedback.ts`) — the `SECURITY DEFINER` RPC is the authorization boundary, not this action; backs the dashboard's "Share feedback" sheet (`src/components/feedback-form.tsx`)
- `support.test.ts` — vitest tests for `submitSupportMessageAction`: RPC call shape (kit slug/category/body), empty body rejected before the RPC, unauthenticated rejection, and a friendly error surfaced when the RPC fails
- `support.ts` — `submitSupportMessageAction`: validates category (enum) and body, then submits a vendor's Get-help message into the shared cross-kit `merqo.support_messages` inbox via `submitSupportMessage` (`src/lib/merqo-support.ts`); inline session check (backs a Sheet-embedded widget off the dashboard nav, not a full page); backs the dashboard's "Get help" sheet

## Parent

[app](../README.md)
