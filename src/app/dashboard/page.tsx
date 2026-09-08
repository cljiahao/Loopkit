import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { listPrograms, applyDueCutovers } from "@/lib/program";
import { getVendorProfile } from "@/lib/vendor";
import {
  getVendorStats,
  getVendorOverviewInputs,
  countExpiredVouchers,
  returnRate90d,
  regularsGoneQuiet,
  cardsNearReward,
  countRegulars,
  countNewThisMonth,
} from "@/lib/stats";
import { listActivity } from "@/lib/activity";
import { formatSgtDate } from "@/lib/format";
import {
  buildOverviewModel,
  buildOverviewPrograms,
  pickServeDefault,
} from "@/app/dashboard/dashboard-view";
import { ServeCta } from "@/app/dashboard/serve-cta";
import { Briefing } from "@/app/dashboard/overview/briefing";
import { BaseStrip } from "@/app/dashboard/overview/base-strip";
import { VisitsTrend } from "@/app/dashboard/overview/visits-trend";
import { WorthALook } from "@/app/dashboard/overview/worth-a-look";
import { RecentActivity } from "@/app/dashboard/overview/recent-activity";
import { RewardCostPanel } from "@/app/dashboard/overview/reward-cost-panel";
import { YourPrograms } from "@/app/dashboard/overview/your-programs";
import { ElevatedCard } from "@/components/elevated-card";

export default async function DashboardPage() {
  await requireVendor();
  await applyDueCutovers();

  const programs = await listPrograms();
  // True first run: no programs of any kind yet. Keep the original redirect.
  if (programs.length === 0) redirect("/setup");

  const programIds = programs.map((p) => p.id);
  const nowMs = new Date().getTime();

  const [stats, expiredUnclaimed, activity, inputs, profile] =
    await Promise.all([
      getVendorStats(programIds),
      countExpiredVouchers(programIds),
      listActivity({ programIds, limit: 6, offset: 0 }),
      getVendorOverviewInputs(programIds),
      getVendorProfile(),
    ]);

  const vendorName = profile.name;

  const near = programs.reduce(
    (acc, program) => {
      const programCards = inputs.cards.filter(
        (c) => c.program_id === program.id,
      );
      const n = cardsNearReward(programCards, program.stamps_required);
      return {
        oneAway: acc.oneAway + n.oneAway,
        twoAway: acc.twoAway + n.twoAway,
      };
    },
    { oneAway: 0, twoAway: 0 },
  );

  const overviewPrograms = buildOverviewPrograms(
    programs,
    inputs.cards,
    inputs.activityEvents,
    inputs.rewardEvents,
    nowMs,
  );

  const model = buildOverviewModel({
    nowMs,
    vendorName: vendorName ?? "",
    stats,
    vendorReturnRate: returnRate90d(inputs.activityEvents, nowMs),
    regularsCount: countRegulars(inputs.activityEvents, nowMs),
    newThisMonth: countNewThisMonth(inputs.cards, nowMs),
    goneQuiet: regularsGoneQuiet(inputs.activityEvents, nowMs).count,
    near,
    expiredUnclaimed,
    programs: overviewPrograms,
    serveDefaultProgramId: pickServeDefault(
      programs,
      inputs.cards,
      inputs.activityEvents,
      nowMs,
    ),
  });

  const programIdByName = Object.fromEntries(
    programs.map((p) => [p.name, p.id]),
  );
  const twoZone = programs.length >= 2;
  const heading = vendorName
    ? `${model.greeting}, ${vendorName}`
    : model.greeting;

  const head = (
    <div
      data-tour="shop-qr"
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {heading}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {vendorName ? `${vendorName} · ` : ""}
          {formatSgtDate(new Date(nowMs).toISOString())}
        </p>
      </div>
      <ServeCta
        defaultProgramId={model.serveDefaultProgramId}
        programIds={programIds}
      />
    </div>
  );

  if (stats.enrolled === 0) {
    return (
      <div className="mx-auto flex max-w-[46rem] flex-col gap-6">
        {head}
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">
            No customers yet. Share your join QR from the Counter to start
            enrolling.
          </p>
        </ElevatedCard>
      </div>
    );
  }

  const main = (
    <div className="flex min-w-0 flex-col gap-6">
      <Briefing text={model.briefing} />
      <BaseStrip
        stats={model.baseStats}
        redemptionRatePct={model.redemptionRatePct}
        returnRatePct={model.returnRatePct}
      />
      <VisitsTrend
        bars7={model.trend.bars7}
        bars14={model.trend.bars14}
        deltaVsLastWeek={model.trend.deltaVsLastWeek}
      />
      <WorthALook items={model.worthALook} />
      <RecentActivity rows={activity.rows} programIdByName={programIdByName} />
    </div>
  );

  const rail = (
    <div className="flex min-w-0 flex-col gap-6">
      <RewardCostPanel cost={model.cost} />
      <YourPrograms programs={model.programs} />
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[46rem] flex-col gap-6 lg:max-w-none">
      {head}
      {twoZone ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8">
          {main}
          {rail}
        </div>
      ) : (
        <>
          {main}
          {rail}
        </>
      )}
    </div>
  );
}
