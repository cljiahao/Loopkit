# programs

## Purpose

Admin programs list — a table of every vendor's program with health and
activity, linking into the per-program detail route.

## Contents

- `[id]/`
- `page.tsx` — `AdminProgramsPage`: fetches `listProgramsOverview()`, sorts rows by last activity, renders a table (wrapped in `ElevatedCard`, `overflow-x-auto` for mobile) of shop/vendor/customers/stamps/rewards/health/last-activity with links to each program's detail page, via `@merqo/ui`'s shared `DataTable` (the wrapping `ElevatedCard` also now from `@merqo/ui`).

## Connectivity

`[id]/` holds the per-program detail route this list's rows link to; both
share the `health-badge.ts` and `Stat` helpers from the parent `admin/`
folder.

## Server-component note

`DataTable`'s `columns[].cell` and `getRowKey` are functions, so they
cannot be passed from a Server Component into `@merqo/ui` (which is
client-bannered package-wide). They live behind a `"use client"` wrapper
that takes plain rows as props — same pattern as
`src/app/admin/vendors/vendors-table.tsx`.

## Parent

[admin](../README.md)
