import Link from "next/link";
import { DataTable, type DataTableColumn } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin";
import { listProgramsOverview } from "@/lib/admin-data";
import { programHealth, type ProgramHealth } from "@/lib/program-health";
import { formatSgtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { HEALTH_BADGE, type BadgeVariant } from "@/app/admin/health-badge";
import { ElevatedCard } from "@/components/elevated-card";

export const revalidate = 0;

export default async function AdminProgramsPage() {
  await requireAdmin();

  const programs = await listProgramsOverview();
  // Reading the wall clock in an async server component is intentional here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // Most-recently-active shops first; never-active ones fall to the bottom.
  const rows = [...programs].sort((a, b) =>
    (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""),
  );

  type ProgramRow = (typeof rows)[number];

  const columns: DataTableColumn<ProgramRow>[] = [
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

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Programs</h1>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No programs yet.
        </p>
      ) : (
        <ElevatedCard className="overflow-x-auto">
          <DataTable rows={rows} columns={columns} getRowKey={(p) => p.id} />
        </ElevatedCard>
      )}
    </main>
  );
}
