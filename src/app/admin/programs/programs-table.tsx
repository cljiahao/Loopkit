"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@merqo/ui";
import type { ProgramOverviewRow } from "@/lib/admin-data";
import { programHealth, type ProgramHealth } from "@/lib/program-health";
import { formatSgtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { HEALTH_BADGE, type BadgeVariant } from "@/app/admin/health-badge";

// `DataTable` is a `@merqo/ui` Client Component, so its `columns` cell
// renderers and `getRowKey` function can't be handed to it from the Server
// Component page. This client boundary owns them; the page passes only
// serializable data (`rows` plus `now`, a server-captured timestamp).
// Mirrors src/app/admin/vendors/vendors-table.tsx.
export function ProgramsTable({
  rows,
  now,
}: {
  rows: ProgramOverviewRow[];
  now: number;
}) {
  const columns: DataTableColumn<ProgramOverviewRow>[] = [
    {
      header: "Shop",
      cell: (p) => (
        <>
          <Link
            href={`/admin/programs/${p.id}`}
            className="font-medium text-primary hover:underline"
          >
            {p.name}
          </Link>
          {!p.active && (
            <span className="ml-2 text-xs text-muted-foreground">inactive</span>
          )}
        </>
      ),
    },
    {
      header: "Vendor",
      cell: (p) => (
        <span className="text-muted-foreground">{p.vendor_email ?? "—"}</span>
      ),
    },
    {
      header: "Customers",
      cell: (p) => <span className="tabular-nums">{p.customer_count}</span>,
      className: "text-right",
    },
    {
      header: "Stamps",
      cell: (p) => <span className="tabular-nums">{p.stamps_issued}</span>,
      className: "text-right",
    },
    {
      header: "Rewards",
      cell: (p) => <span className="tabular-nums">{p.rewards_redeemed}</span>,
      className: "text-right",
    },
    {
      header: "Health",
      cell: (p) => {
        const health: ProgramHealth = programHealth(
          {
            customer_count: p.customer_count,
            last_activity_at: p.last_activity_at,
            created_at: p.created_at,
          },
          now,
        );
        const badge: BadgeVariant = HEALTH_BADGE[health];
        return (
          <Badge variant={badge.variant} className="capitalize">
            {badge.label}
          </Badge>
        );
      },
    },
    {
      header: "Last activity",
      cell: (p) => (
        <span className="text-muted-foreground">
          {p.last_activity_at ? formatSgtDate(p.last_activity_at) : "—"}
        </span>
      ),
    },
  ];

  return <DataTable rows={rows} columns={columns} getRowKey={(p) => p.id} />;
}
