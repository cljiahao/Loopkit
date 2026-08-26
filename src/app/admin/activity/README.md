# activity

## Purpose

Admin Activity tab — a read-only viewer over the `admin_audit` trail
(`loopkit.admin_audit`, migration `0003`) written by every real admin action.

## Contents

- `page.tsx` — `AdminActivityPage`: fetches `listAdminAudit(100)` (`@/lib/admin-data`) and renders the rows through `@merqo/ui`'s `AuditLogTable`, with a `formatAction` map for the real `action` strings `actions.ts`/`vendor-provision/route.ts` write and a `detailText` helper that renders the jsonb `detail` column as `key: value` pairs; the `detail.actor === "merqo_system"` sentinel (see `recordAudit`'s docstring) is surfaced as "Merqo (system)" instead of the raw vendor id `admin_id` holds for that one action.

## Parent

[admin](../README.md)
