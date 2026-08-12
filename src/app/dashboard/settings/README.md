# settings

## Purpose

Vendor integrations page at `/dashboard/settings` — currently a single section for connecting loopkit with qkit's earn config.

## Contents

- `page.tsx` — `SettingsPage` server component; requires a vendor, loads stamp-type programs plus the vendor's existing `qkit_earn_config` row, and renders a `BackButton` ("Back to dashboard") above `QkitEarnSettings`. Its root element is `<div className="mx-auto max-w-2xl space-y-8">` — deliberately narrower than the `../layout.tsx` `<main>`'s shared `max-w-7xl` (this single-section settings form genuinely reads better constrained), so it nests its own `mx-auto`/`max-w-*` wrapper inside that container rather than stretching full-width; the page no longer sets its own padding, which the layout's `<main>` now owns.

## Parent

[dashboard](../README.md)
