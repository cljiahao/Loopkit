# activity

## Purpose

Vendor-facing activity feed at `/dashboard/activity` — a paginated, filterable log of stamps, plays, and redemptions across one or all of a vendor's programs.

## Contents

- `activity-filters.dom.test.tsx` — jsdom tests for `ActivityFilters`: renders the type/from/to fields and an Apply filters button, shows a Clear filters link and preserves the program id when a filter is active, renders the Program field as one of the card's fields for a multi-program vendor, and omits it entirely for a single-program vendor.
- `activity-filters.tsx` — `ActivityFilters`, a GET `<form>` with Program/type/from/to controls (`ProgramSwitcher` rendered as this card's first field, styled to match its siblings via `triggerClassName`, hidden for a single-program vendor — then a type select, two date inputs, Apply/Clear) that resubmits the page with query params. Previously `ProgramSwitcher` rendered as a separate, differently-styled control (no label, no shared card border/shadow) next to this form; folding it in as a field fixes that visual mismatch.
- `activity-page.dom.test.tsx` — jsdom test asserting `ActivityTable` shows phone/program badge with `showProgram`, hides the Program column when `showProgram` is false, and renders an empty state with zero rows.
- `activity-table.tsx` — `ActivityTable`, renders a table of `VendorActivityRow`s (type icon, phone, optional program badge, formatted date), via `@merqo/ui`'s shared `DataTable`, or an empty-state message. A row's icon/color is picked by the local `activityIcon()` helper — a manual `'adjust'`-kind row (see `../customers/[phone]/adjust-stamp-form.tsx`) gets its own amber `Pencil` icon and shows its reason beneath the label, never visually confusable with a real stamp or reward.
- `page.tsx` — `ActivityPage` server component; requires a vendor, redirects to the single program when there's exactly one, paginates `listActivity()` results (25/page) with type/date-range filters, and renders `ActivityFilters` (which now includes the program switcher as its first field) below the page header, then `ActivityTable`. Its root element is a plain `<div className="space-y-8">` — the page no longer sets its own `max-w-*`/padding; the enclosing `../layout.tsx` `<main>` now owns the shared `max-w-7xl` width and padding for the whole `/dashboard` tree.

## Parent

[dashboard](../README.md)
