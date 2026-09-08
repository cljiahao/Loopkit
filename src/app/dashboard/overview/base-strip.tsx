"use client";

import { StatTile, InfoTooltip } from "@merqo/ui";
import type { BaseStat } from "@/app/dashboard/dashboard-view";
import { ElevatedCard } from "@/components/elevated-card";

const TONE_CLASS: Record<BaseStat["tone"], string> = {
  plain: "",
  pos: "text-emerald-600 dark:text-emerald-400",
  soft: "text-muted-foreground",
};

function StatCard({ stat }: { stat: BaseStat }) {
  return (
    <ElevatedCard className="p-4">
      <StatTile
        reverse
        label={stat.label}
        value={stat.display}
        valueClassName={`font-mono tracking-tight ${TONE_CLASS[stat.tone]}`}
        deltaSlot={
          <InfoTooltip
            trigger="tap"
            ariaLabel={stat.title}
            content={
              <span className="block">
                <strong className="block text-sm font-bold text-foreground">
                  {stat.title}
                </strong>
                <span className="mt-1 block">{stat.body}</span>
                <span className="mt-1.5 block border-t border-border pt-1.5 text-xs">
                  {stat.hint}
                </span>
              </span>
            }
          />
        }
      />
    </ElevatedCard>
  );
}

export function BaseStrip({
  stats,
  redemptionRatePct,
  returnRatePct,
}: {
  stats: BaseStat[];
  redemptionRatePct: number;
  returnRatePct: number | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.key} stat={stat} />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-foreground">
            {redemptionRatePct}%
          </span>
          redeem their reward
          <InfoTooltip
            trigger="tap"
            ariaLabel="Redemption rate"
            content="Rewards redeemed divided by enrolled customers. The single most-cited measure of whether a loyalty program is working."
          />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-foreground">
            {returnRatePct ?? "--"}%
          </span>
          come back within 90 days
          <InfoTooltip
            trigger="tap"
            ariaLabel="Return rate"
            content="Of cards active in the last 90 days, the share with 2 or more visits."
          />
        </span>
      </div>
    </div>
  );
}
