import Link from "next/link";
import type { CostView } from "@/app/dashboard/dashboard-view";
import { formatSgd } from "@/lib/money";
import { ElevatedCard } from "@/components/elevated-card";

export function RewardCostPanel({
  cost,
  manageHref = "/setup",
}: {
  cost: CostView;
  manageHref?: string;
}) {
  const knownCost = formatSgd(cost.knownCostCents);
  const costValue =
    cost.programsMissingCost === 0 ? knownCost : `${knownCost}+`;

  return (
    <ElevatedCard className="flex flex-col gap-3 p-4">
      <h2 className="font-display text-base font-semibold tracking-tight">
        What the rewards cost this month
      </h2>

      <div className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-baseline gap-3">
          <span className="min-w-6 font-mono font-semibold">
            {cost.rewardsThisMonth}
          </span>
          <span className="flex-1">rewards redeemed</span>
          <span className="font-mono text-muted-foreground">{costValue}</span>
        </div>
        {cost.programsMissingCost > 0 && (
          <p className="pl-9 text-xs text-muted-foreground">
            <Link href={manageHref} className="underline">
              {cost.programsMissingCost === 1
                ? "1 program has no cost set"
                : `${cost.programsMissingCost} programs have no cost set`}
            </Link>
          </p>
        )}
        <div className="flex items-baseline gap-3">
          <span className="min-w-6 font-mono font-semibold">
            {cost.pendingReturnSoon}
          </span>
          <span className="flex-1">pending, expect them back soon</span>
        </div>
        <div className="flex items-baseline gap-3 text-muted-foreground">
          <span className="min-w-6 font-mono">{cost.expiredUnclaimed}</span>
          <span className="flex-1">expired unclaimed</span>
        </div>
      </div>

      <details className="border-t border-border pt-3 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          Breakdown
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {cost.perProgram.map((p) => (
            <div
              key={p.name}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 text-xs"
            >
              <span className="min-w-0 truncate">
                {p.redeemed} x {p.rewardText}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {p.unitCents === null
                  ? "cost not set"
                  : `${formatSgd(p.unitCents)} ea`}
              </span>
              <span className="min-w-12 text-right font-semibold">
                {p.lineCents === null ? "" : formatSgd(p.lineCents)}
              </span>
            </div>
          ))}
          <Link
            href={manageHref}
            className="text-xs font-semibold text-primary underline"
          >
            Set what each reward costs you
          </Link>
        </div>
      </details>
    </ElevatedCard>
  );
}
