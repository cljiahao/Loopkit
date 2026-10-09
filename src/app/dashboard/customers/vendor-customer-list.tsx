import Link from "next/link";
import type { VendorCustomerRow } from "@/lib/customers";
import { formatSgtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ElevatedCard } from "@merqo/ui";
export function VendorCustomerList({
  customers,
}: {
  customers: VendorCustomerRow[];
}) {
  if (customers.length === 0) {
    return (
      <ElevatedCard className="p-6">
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      </ElevatedCard>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {customers.map((customer) => (
        <ElevatedCard
          as="li"
          key={customer.phone}
          className="flex flex-col gap-2 p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                {(customer.name ?? "#").charAt(0)}
              </span>
              <Link
                href={`/dashboard/customers/${encodeURIComponent(customer.phone)}`}
                className="truncate font-medium hover:underline"
              >
                {customer.name ?? customer.phone}
              </Link>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatSgtDate(customer.lastSeenAt)}
            </span>
          </div>
          {customer.name && (
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          )}
          <div className="flex flex-wrap items-center gap-1">
            {customer.programNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
            {customer.rewardReady ? (
              <Badge>Ready</Badge>
            ) : (
              customer.bestGap !== null && (
                <span className="text-xs text-muted-foreground">
                  {customer.bestGap} to go
                </span>
              )
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {customer.totalStamps} total stamps/visits · {customer.totalRewards}{" "}
            reward{customer.totalRewards === 1 ? "" : "s"}
          </p>
          {customer.recentProgramId && (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="mt-1 w-full rounded-lg"
            >
              <Link
                href={`/dashboard/counter?p=${customer.recentProgramId}&phone=${encodeURIComponent(customer.phone)}`}
              >
                Serve
              </Link>
            </Button>
          )}
        </ElevatedCard>
      ))}
    </ul>
  );
}
