import { redirect } from "next/navigation";
import { StatTile } from "@merqo/ui";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import {
  getProgramStats,
  getVendorStats,
  getVendorMechanicBreakdown,
  countExpiredVouchers,
} from "@/lib/stats";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
import { VisitsChart } from "@/app/dashboard/stats/visits-chart";
import { ElevatedCard } from "@/components/elevated-card";

/** Wraps @merqo/ui's shared StatTile (value-above-label) in loopkit's own card shell. */
function Tile({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number | null;
}) {
  return (
    <ElevatedCard className="p-5">
      <StatTile
        label={label}
        value={value}
        valueClassName="tracking-tight"
        reverse
        delta={delta}
        deltaSize="xs"
        deltaTooltip="vs. the prior 30 days"
      />
    </ElevatedCard>
  );
}

type StatsPageProps = {
  searchParams: Promise<{ p?: string }>;
};

export default async function StatsPage({ searchParams }: StatsPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p } = await searchParams;

  if (!p && programs.length === 1) {
    redirect(`/dashboard/stats?p=${programs[0].id}`);
  }

  if (!p) {
    const programIds = programs.map((prog) => prog.id);
    const [stats, expiredUnclaimed, mechanicBreakdown] = await Promise.all([
      getVendorStats(programIds),
      countExpiredVouchers(programIds),
      getVendorMechanicBreakdown(programIds),
    ]);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How your shop is performing across every program.
          </p>
        </div>

        <ProgramSwitcher
          programs={programs}
          currentId=""
          basePath="/dashboard/stats"
        />

        {stats.enrolled === 0 ? (
          <ElevatedCard className="p-6">
            <p className="text-sm text-muted-foreground">
              No customers yet — share your QR from the Counter page to start
              enrolling.
            </p>
          </ElevatedCard>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile label="Enrolled customers" value={String(stats.enrolled)} />
              <Tile
                label="Active / lapsed (30d)"
                value={`${stats.active} / ${stats.lapsed}`}
                delta={stats.activeDelta}
              />
              <Tile
                label="Redemption rate"
                value={`${Math.round(stats.redemptionRate * 100)}%`}
              />
              <Tile
                label="Repeat-visit rate"
                value={`${Math.round(stats.repeatVisitRate * 100)}%`}
              />
              <Tile
                label="Visits (30d)"
                value={String(stats.visits30d)}
                delta={stats.visitsDelta}
              />
              <Tile
                label="Rewards redeemed (30d)"
                value={String(stats.rewards30d)}
                delta={stats.rewardsDelta}
              />
              <Tile
                label="Avg days between visits"
                value={
                  stats.avgDaysBetweenVisits === null
                    ? "—"
                    : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
                }
              />
              <Tile
                label="Expired unclaimed (30d)"
                value={String(expiredUnclaimed)}
              />
            </div>

            <ElevatedCard className="p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Last 30 days
              </h2>
              <div className="mt-4">
                <VisitsChart data={stats.visitsByDay} />
              </div>
            </ElevatedCard>

            {mechanicBreakdown.length > 1 && (
              <ElevatedCard className="p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  By mechanic
                </h2>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {mechanicBreakdown.map((m) => (
                    <div key={m.mechanic} className="rounded-lg border p-3">
                      <p className="text-sm font-semibold">{m.mechanic}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.enrolled} enrolled · {m.visitsTotal} visits ·{" "}
                        {Math.round(m.redemptionRate * 100)}% redemption
                      </p>
                    </div>
                  ))}
                </div>
              </ElevatedCard>
            )}
          </>
        )}
      </div>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const [stats, expiredUnclaimed] = await Promise.all([
    getProgramStats(program.id),
    countExpiredVouchers([program.id]),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {program.name} is performing.
        </p>
      </div>

      <ProgramSwitcher
        programs={programs}
        currentId={program.id}
        basePath="/dashboard/stats"
      />

      {stats.enrolled === 0 ? (
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">
            No customers yet — share your QR from the Counter page to start
            enrolling.
          </p>
        </ElevatedCard>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Enrolled customers" value={String(stats.enrolled)} />
            <Tile
              label="Active / lapsed (30d)"
              value={`${stats.active} / ${stats.lapsed}`}
              delta={stats.activeDelta}
            />
            <Tile
              label="Redemption rate"
              value={`${Math.round(stats.redemptionRate * 100)}%`}
            />
            <Tile
              label="Repeat-visit rate"
              value={`${Math.round(stats.repeatVisitRate * 100)}%`}
            />
            <Tile
              label="Visits (30d)"
              value={String(stats.visits30d)}
              delta={stats.visitsDelta}
            />
            <Tile
              label="Rewards redeemed (30d)"
              value={String(stats.rewards30d)}
              delta={stats.rewardsDelta}
            />
            <Tile
              label="Avg days between visits"
              value={
                stats.avgDaysBetweenVisits === null
                  ? "—"
                  : `${stats.avgDaysBetweenVisits.toFixed(1)}d`
              }
            />
            <Tile
              label="Expired unclaimed (30d)"
              value={String(expiredUnclaimed)}
            />
          </div>

          <ElevatedCard className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Last 30 days
            </h2>
            <div className="mt-4">
              <VisitsChart data={stats.visitsByDay} />
            </div>
          </ElevatedCard>
        </>
      )}
    </div>
  );
}
