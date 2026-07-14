import { Gift, Stamp } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatSgtDateTime } from "@/lib/format";
import type { VendorActivityRow } from "@/lib/activity";

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
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          No activity matches these filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Phone</TableHead>
            {showProgram && <TableHead>Program</TableHead>}
            <TableHead className="text-right">Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activity.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      event.isReward
                        ? "grid size-7 shrink-0 place-items-center rounded-full bg-gold/20 text-gold-accent"
                        : "grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                    }
                  >
                    {event.isReward ? (
                      <Gift className="size-3.5" />
                    ) : (
                      <Stamp className="size-3.5" />
                    )}
                  </span>
                  <span className="font-medium capitalize">{event.label}</span>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {event.phone}
              </TableCell>
              {showProgram && (
                <TableCell>
                  <Badge variant="secondary">{event.programName}</Badge>
                </TableCell>
              )}
              <TableCell className="text-right text-muted-foreground">
                {formatSgtDateTime(event.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
