"use client";
import { ProgressVisual } from "@/components/progress-visual";

import { useEffect, useState } from "react";
import type { Progress } from "@/lib/engine/types";

import { CardBurst } from "@/components/card-burst";

import { CardShell } from "@/components/card-shell";
import { cn } from "@/lib/utils";

const CHANCE_RESULT_VISIBLE_MS = 1500;

// Keep visual types in one fixed-height slot while form inputs change.
export function PreviewCard({
  progress,
  name,
  rewardText,
  celebrating = false,
  revealing = false,
  lastChanceResult = null,
  vendorAvatarUrl = null,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
  celebrating?: boolean;
  revealing?: boolean;
  lastChanceResult?: { won: boolean } | null;
  vendorAvatarUrl?: string | null;
}) {
  const view = progress.view;
  const isWheel = view.kind === "chance" && view.variant === "wheel";

  // Celebration waits for the wheel animation to settle.
  const [wheelSettled, setWheelSettled] = useState(true);
  const spinningWheel = isWheel && revealing;
  const [lastSpinningWheel, setLastSpinningWheel] = useState(false);
  if (spinningWheel !== lastSpinningWheel) {
    setLastSpinningWheel(spinningWheel);
    if (spinningWheel) setWheelSettled(false);
  }

  const [showChanceResult, setShowChanceResult] = useState(false);
  useEffect(() => {
    if (!lastChanceResult) return;
    // A new engine result starts a timed presentation effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowChanceResult(true);
    const timer = setTimeout(
      () => setShowChanceResult(false),
      CHANCE_RESULT_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [lastChanceResult]);

  return (
    <CardShell>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer preview
      </p>
      <p className="text-sm font-semibold">{name || "Your card"}</p>
      <div className="flex h-36 items-center justify-center">
        <ProgressVisual
          view={view}
          vendorAvatarUrl={vendorAvatarUrl}
          revealing={revealing}
          onWheelSettled={() => setWheelSettled(true)}
        />
      </div>
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>

      <CardBurst active={celebrating && (!isWheel || wheelSettled)} />

      {((view.kind === "chance" && view.variant !== "wheel") ||
        view.kind === "lucky") &&
        lastChanceResult &&
        showChanceResult && (
          <div
            className={cn(
              "absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
              lastChanceResult.won
                ? "bg-gold text-gold-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {lastChanceResult.won ? "🎉 You won!" : "Try again"}
          </div>
        )}
    </CardShell>
  );
}
