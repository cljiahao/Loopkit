# vendors

## Purpose

Admin vendors console — vendor list with Pro-tier toggles and pending
upgrade-request approvals.

## Contents

- `page.tsx` — `AdminVendorsPage`: fetches `listVendors()` and `listPendingUpgradeRequests()`, renders the pending-requests section and (via `VendorsTable`) the vendor table, both `ElevatedCard`-wrapped.
- `vendors-table.tsx` — `VendorsTable` client component: renders `@merqo/ui`'s shared `DataTable` with Pro badges/toggles, owning the `columns` cell renderers and `getRowKey` — function props a Client Component can't be handed from the Server Component page.
- `resolve-upgrade-request-button.tsx` — `ResolveUpgradeRequestButton`: calls the `resolveUpgradeRequest` Server Action to grant Pro and clear a pending request in one action.
- `vendor-pro-toggle.tsx` — `VendorProToggle`: calls the `setVendorPro` Server Action to grant/revoke a vendor's Pro tier immediately, no confirm modal.

## Parent

[admin](../README.md)
