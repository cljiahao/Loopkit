import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { StreakFlame } from "@/components/streak-flame";
import { StampDots } from "@/components/stamp-dots";

// Mirrors ProgramCardStatus's view-kind switch (src/app/c/program-card-status.tsx)
// exactly, so the /setup preview can never visually drift from a real
// customer card. No redeem/regenerate interactivity — this is a static
// snapshot of the current form values, not a live card.
export function PreviewCard({
  progress,
  name,
  rewardText,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
}) {
  const view = progress.view;
  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer preview
      </p>
      <p className="text-sm font-semibold">{name || "Your card"}</p>
      {view.kind === "plant" ? (
        <div className="flex flex-col items-center gap-2">
          <Plant
            stage={view.stage}
            totalStages={view.totalStages}
            wilting={view.wilting}
          />
        </div>
      ) : view.kind === "streak" ? (
        <div className="flex flex-col items-center gap-2">
          <StreakFlame
            current={view.current}
            target={view.target}
            status={view.status}
          />
        </div>
      ) : view.kind === "chance" ? (
        <div className="flex flex-col items-center gap-2">
          {view.variant === "wheel" ? (
            <Wheel segments={view.segments} landedId={view.landedId} />
          ) : (
            <ScratchCard revealed={false} label="" reward={false} />
          )}
        </div>
      ) : view.kind === "dots" ? (
        <StampDots filled={view.filled} total={view.total} />
      ) : null}
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
    </div>
  );
}
