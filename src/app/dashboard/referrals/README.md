# referrals

## Purpose

Vendor page at `/dashboard/referrals` for creating and sharing host/couple
referral links — a wedding or event's bride, groom, or organizer names one
of the vendor's own active programs plus their own phone, and gets a
shareable `/c?v=<vendorId>&ref=<code>` link. Every distinct guest who joins
through that link earns their own card as usual AND bumps the host one
stamp/visit on the named program — credit-routing on an existing program,
not a sixth engine `type`. See
`docs/superpowers/specs/2026-08-20-host-referral-mechanic-design.md`.

## Contents

- `actions.ts` — `"use server"` `createReferralHostAction`: validates the
  picked program (must belong to the signed-in vendor and be active, via
  `getProgramById`) and the host's phone (`normalizePhone`, same SG-only
  validation used everywhere else), inserts the `referral_hosts` row (RLS
  scopes it to the signed-in vendor; `referral_code` is DB-generated), then
  builds the shareable link (`referralLink`, `src/lib/referrals.ts`) and its
  QR (`qrSvg`) to return immediately, so the new host appears in the list
  without a page reload
- `page.tsx` — `ReferralsPage` server component: requires a vendor, loads
  their programs (offering only the active ones to the create form) and
  existing `referral_hosts` rows (`listReferralHosts`), pre-computes each
  existing host's link/QR from the request origin (same
  `NEXT_PUBLIC_BASE_URL`-or-request-host fallback `dashboard/page.tsx`'s
  shop QR uses), and renders a setup prompt instead of the form when the
  vendor has no active program yet
- `referrals-panel.tsx` — client `ReferralsPanel`: the create form
  (`useActionState` + `createReferralHostAction`, a program `Select`, phone
  and optional label `Input`s) above the host list; a freshly created host
  is prepended to local state from the action's own result (comparing
  against the last-applied host id during render, same idiom
  `card-check`'s `CheckForm` uses to react to a fresh action result) rather
  than waiting on a full page revalidation. Each list row shows the host's
  label (falling back to the program name), guest count, QR, and link with
  `card-link.tsx`'s existing `CardLinkActions` (copy link / print QR)
- `actions.test.ts` — vitest tests for `createReferralHostAction`: rejects
  a missing/inactive program and an invalid phone without inserting, builds
  the correct `vendor_id`/`program_id`/`host_phone`/`label` insert payload
  (an empty label normalizes to `null`), returns the created host's
  link/QR built from the request origin, and surfaces an insert failure
- `referrals-panel.dom.test.tsx` — jsdom tests for `ReferralsPanel`: the
  empty-state message, an existing host's label/program-name-fallback/guest
  count/link, a `role="alert"` error on a failed create, and a successful
  create prepending the new host without dropping existing ones
- `referrals-page.dom.test.tsx` — jsdom tests for `ReferralsPage`: only
  active programs are offered to the create form, each existing host's
  link is built from the request origin, and the setup-prompt renders
  instead of the panel with zero active programs
- `types.ts` — `ReferralHostSummary` (a host plus its resolved program name
  and shareable link/QR) and `CreateReferralHostState` (the
  `useActionState` result union) plus its `CREATE_REFERRAL_HOST_IDLE`
  initial value — a plain module, since `actions.ts`'s `"use server"`
  directive only allows exporting async functions, same split
  `src/features/card-check/types.ts` uses for the identical reason

## Connectivity

`page.tsx` is the only server entry point, composing `ReferralsPanel` with
data from `src/lib/referrals.ts` (`listReferralHosts`, `referralLink`) and
`src/lib/program.ts` (`listPrograms`). `referrals-panel.tsx` calls
`actions.ts`'s `createReferralHostAction` directly (not through a barrel —
this folder has no `index.ts`, unlike `src/features/`). The referral
link this folder generates is consumed by `src/app/c/page.tsx`'s `?ref=`
query param, and the actual per-guest crediting logic lives in
`loopkit.vendor_join_referred`/`apply_referral_credit`
(`supabase/migrations/0040_loopkit_referral_hosts.sql`) and
`src/features/card-check/api/actions.ts`'s `checkStatusAction` — none of
that logic lives in this folder.

## Parent

[dashboard](../README.md)
