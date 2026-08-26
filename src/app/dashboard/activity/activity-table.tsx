import { Gift, Stamp, Pencil } from "lucide-react";
import { DataTable, type DataTableColumn } from "@merqo/ui";
import { Badge } from "@/components/ui/badge";
import { ElevatedCard } from "@/components/elevated-card";
import { formatSgtDateTime } from "@/lib/format";
import type { VendorActivityRow } from "@/lib/activity";

function activityIcon(event: VendorActivityRow) {
  if (event.isAdjust) {
    return { bg: "bg-amber-500/15 text-amber-600", Icon: Pencil };
  }
  if (event.isReward) {
    return { bg: "bg-gold/20 text-gold-accent", Icon: Gift };
  }
  return { bg: "bg-primary/10 text-primary", Icon: Stamp };
}

// Extracted so it's testable with plain props, mirroring this repo's
// existing precedent for list/table extraction (e.g. VendorCustomerList).
export function ActivityTable({
  activity,
  showProgram,
}: {
  activity: VendorActivityRow[];
  showProgram: boolean;
}) {
  if (activity.length === 0) {
    return (
      <ElevatedCard className="p-6">
        <p className="text-sm text-muted-foreground">
          No activity matches these filters.
        </p>
      </ElevatedCard>
    );
  }

  const columns: DataTableColumn<VendorActivityRow>[] = [
    {
      header: "Type",
      cell: (event) => {
        const { bg, Icon } = activityIcon(event);
        return (
          <span className="flex items-center gap-2">
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full ${bg}`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium capitalize">
                {event.label}
              </span>
              {event.isAdjust && event.reason && (
                <span className="block truncate text-xs text-muted-foreground">
                  {event.reason}
                </span>
              )}
            </span>
          </span>
        );
      },
    },
    {
      header: "Phone",
      cell: (event) => (
        <span className="text-muted-foreground">{event.phone}</span>
      ),
    },
    ...(showProgram
      ? [
          {
            header: "Program",
            cell: (event: VendorActivityRow) => (
              <Badge variant="secondary">{event.programName}</Badge>
            ),
          },
        ]
      : []),
    {
      header: "Date",
      cell: (event) => (
        <span className="text-muted-foreground">
          {formatSgtDateTime(event.createdAt)}
        </span>
      ),
      className: "text-right",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border">
      <DataTable
        rows={activity}
        columns={columns}
        getRowKey={(event) => event.id}
      />
    </div>
  );
}
