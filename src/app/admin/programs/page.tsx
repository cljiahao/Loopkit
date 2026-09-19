import { ElevatedCard } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin";
import { listProgramsOverview } from "@/lib/admin-data";
import { ProgramsTable } from "@/app/admin/programs/programs-table";

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
          <ProgramsTable rows={rows} now={now} />
        </ElevatedCard>
      )}
    </main>
  );
}
