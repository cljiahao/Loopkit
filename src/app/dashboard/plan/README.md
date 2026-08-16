# plan

## Purpose

Vendor billing/plan page at `/dashboard/plan` — shows Free vs. Pro feature comparison, program-performance stats, and a self-serve upgrade-request flow.

## Contents

- `actions.ts` — server action `requestUpgrade()`; files an idempotent `upgrade_requests` row for the signed-in vendor (a no-op success if one is already pending).
- `page.tsx` — `PlanPage` server component; requires a vendor, shows current tier badge, an optional program-performance blurb (repeat-visit rate, rewards total, `ElevatedCard`-wrapped), the live admin-tunable Pro price (`getPricing()`, `$4.99/mo` by default), and a Free/Pro feature comparison table with `UpgradeCta` when not Pro (the Pro-upsell/Pro-active blocks are also `ElevatedCard`-wrapped). Its root element is `<div className="mx-auto max-w-2xl space-y-7">` — deliberately narrower than the `../layout.tsx` `<main>`'s shared `max-w-7xl` (this single-column billing summary genuinely reads better constrained), so it nests its own `mx-auto`/`max-w-*` wrapper inside that container rather than stretching full-width; the page no longer sets its own padding, which the layout's `<main>` now owns. The feature comparison grid renders through `@merqo/ui`'s shared `PlanComparisonTable` (2 tiers: `{key:"free",label:"Free"}`/`{key:"pro",label:"Pro"}`) — the local `FEATURES` const array stays here, mapped into the component's `rows` prop; only the rendering (formerly a local grid + local `Cell` helper) moved. The component's check icon uses the `text-status-ready` Tailwind class, mapped in `src/app/globals.css` to `--primary` since loopkit has no order-status palette of its own to supply that token.
- `upgrade-cta.tsx` — `UpgradeCta` client component; a button that calls `requestUpgrade()` via `useAsyncAction` and shows a success/error toast.

## Parent

[dashboard](../README.md)
