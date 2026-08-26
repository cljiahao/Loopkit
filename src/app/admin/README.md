# admin

## Purpose

Merqo-team internal admin console — the gated layout, shared nav, and shared
figure/badge helpers used by the overview, programs, and vendors screens.

## Contents

- `actions.ts` — Server Actions (all admin-only via `requireAdmin()`): `setProgramActive`, `setVendorPro`, `removeCard`, `resolveUpgradeRequest`, `setPricing`, each writing via the service-role client and appending an `admin_audit` row via `recordAudit` (`@/lib/admin-audit`, shared with `vendor-provision/route.ts`).
- `activity/` — `AdminActivityPage`: read-only viewer over `admin_audit` (`listAdminAudit`, `@/lib/admin-data`), rendered via `@merqo/ui`'s `AuditLogTable` with a `formatAction` map for the real action strings `actions.ts`/`vendor-provision/route.ts` write, and the `detail.actor === "merqo_system"` sentinel surfaced as "Merqo (system)" instead of a raw vendor id.
- `admin-nav.tsx` — `AdminNav` client component: the Overview/Programs/Vendors/Activity tab bar, highlighting the active section by path.
- `health-badge.ts` — `HEALTH_BADGE` map from `ProgramHealth` to a Badge variant/label, shared by the programs list and the program detail header.
- `layout.tsx` — `AdminLayout`: gates every `/admin` route with `requireAdmin()`, renders the header (wordmark, Admin badge, sign-out) and `AdminNav`.
- `page.tsx` — `AdminOverviewPage`: platform-wide totals (programs, customers, stamps, rewards), a recent cross-shop activity feed, and the live-pricing admin form (`PricingFormClient`), wrapped in `ElevatedCard`.
- `pricing-form-client.tsx` — `PricingFormClient` client component: wraps `@merqo/ui`'s presentational `PricingForm`, wiring its `onSave`/`onError` contract to `setPricing` + a success/error toast + `router.refresh()`.
- `programs/`
- `stat.tsx` — `Stat`: a small labeled-value tile (`ElevatedCard`-based) used across the admin overview and program detail pages.
- `vendors/`

## Connectivity

`programs/`, `vendors/`, and `activity/` are the admin sections linked from
`admin-nav.tsx`'s tab bar; all render inside `layout.tsx`'s gated shell.
`programs/`'s and `vendors/`'s page/detail components pull shared pieces from
this folder — `stat.tsx` for figure tiles, `health-badge.ts` for health
badges, and `actions.ts` for the Server Actions their client components call
(`Manage` in `programs/[id]`, `ResolveUpgradeRequestButton` and
`VendorProToggle` in `vendors/`). `activity/` reads the audit trail those same
actions write via `recordAudit`.

## Parent

[app](../README.md)
