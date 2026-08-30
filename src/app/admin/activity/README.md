# activity

## Purpose

Admin Activity tab — a read-only viewer over the `admin_audit` trail
(`loopkit.admin_audit`, migration `0003`) written by every real admin action.

## Contents

- `page.tsx` — `AdminActivityPage`: fetches `listAdminAudit(100)` (`@/lib/admin-data`), maps each row to a serializable `AuditLogEntry` (a `detailText` helper renders the jsonb `detail` column as `key: value` pairs; the `detail.actor === "merqo_system"` sentinel — see `recordAudit`'s docstring — is surfaced as "Merqo (system)" instead of the raw vendor id `admin_id` holds for that one action), and hands the array to `AdminActivityLog`.
- `activity-log.tsx` — `AdminActivityLog` client component: renders `@merqo/ui`'s `AuditLogTable`, owning the `formatAction` map (human labels for the real `action` strings `actions.ts`/`vendor-provision/route.ts` write) and the SGT `dateFormatter` — function props a Client Component can't be handed from the Server Component page.

## Parent

[admin](../README.md)
