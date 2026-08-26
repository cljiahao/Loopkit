import { DataTable, type DataTableColumn } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin";
import { listVendors, listPendingUpgradeRequests } from "@/lib/admin-data";
import { formatSgtDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { ElevatedCard } from "@/components/elevated-card";
import { VendorProToggle } from "@/app/admin/vendors/vendor-pro-toggle";
import { ResolveUpgradeRequestButton } from "@/app/admin/vendors/resolve-upgrade-request-button";

export const revalidate = 0;

export default async function AdminVendorsPage() {
  await requireAdmin();

  const [vendors, pendingRequests] = await Promise.all([
    listVendors(),
    listPendingUpgradeRequests(),
  ]);

  type VendorRow = (typeof vendors)[number];

  const columns: DataTableColumn<VendorRow>[] = [
    {
      header: "Vendor",
      cell: (v) => <span className="font-medium">{v.email ?? "—"}</span>,
    },
    {
      header: "Programs",
      cell: (v) => <span className="tabular-nums">{v.program_count}</span>,
      className: "text-right",
    },
    {
      header: "Tier",
      cell: (v) =>
        v.is_pro ? (
          <Badge variant="gold">Pro</Badge>
        ) : (
          <Badge variant="outline">Free</Badge>
        ),
    },
    {
      header: "Pro",
      cell: (v) => (
        <VendorProToggle
          vendorId={v.vendor_id}
          email={v.email}
          isPro={v.is_pro}
        />
      ),
      className: "text-right",
    },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Vendors</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant Pro to lift a vendor&apos;s one-program limit.
        </p>
      </div>

      {pendingRequests.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pending upgrade requests
          </h2>
          <ElevatedCard className="divide-y overflow-hidden">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {r.email ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested {formatSgtDateTime(r.created_at)}
                  </p>
                </div>
                <ResolveUpgradeRequestButton
                  requestId={r.id}
                  vendorId={r.vendor_id}
                  email={r.email}
                />
              </div>
            ))}
          </ElevatedCard>
        </section>
      )}

      {vendors.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No vendors yet.
        </p>
      ) : (
        <ElevatedCard className="overflow-x-auto">
          <DataTable
            rows={vendors}
            columns={columns}
            getRowKey={(v) => v.vendor_id}
          />
        </ElevatedCard>
      )}
    </main>
  );
}
