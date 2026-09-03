"use client";

import { useEffect, useState } from "react";
import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";
import { PointsBar } from "@/components/points-bar";
import { CardBurst } from "@/components/card-burst";
import { LuckyBox } from "@/components/lucky-box";
import { CardShell } from "@/components/card-shell";
import { cn } from "@/lib/utils";
import { resolveStampMark } from "@/lib/stamp-mark";

const CHANCE_RESULT_VISIBLE_MS = 1500;

// Mirrors ProgramCardStatus's view-kind switch (src/app/c/program-card-status.tsx)
// — same components, same props — so the /setup preview can never visually
// drift from a real customer card. No redeem/regenerate interactivity —
// this is a static snapshot of the current form values, not a live card.
//
// Unlike ProgramCardStatus, every visual sits in one fixed-height, centered
// box (h-36) here: switching card type in /setup shouldn't make the preview
// panel jump around in height between a wide stamp grid, a square plant/
// wheel, or a compact flame layer.
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

  function renderView() {
    if (view.kind === "plant") {
      if (view.variant === "cup") {
        return (
          <Cup
            stage={view.stage}
            totalStages={view.totalStages}
            wilting={view.wilting}
          />
        );
      }
      return (
        <Plant
          stage={view.stage}
          totalStages={view.totalStages}
          wilting={view.wilting}
        />
      );
    }
    if (view.kind === "flame") {
      return <FlameLayers stage={view.stage} />;
    }
    if (view.kind === "chance") {
      if (view.variant === "wheel") {
        return (
          <Wheel
            segments={view.segments}
            landedId={view.landedId}
            spinning={revealing}
            onSettled={() => setWheelSettled(true)}
          />
        );
      }
      return (
        <ScratchCard
          scratching={revealing}
          revealed={view.landedId !== null}
          label={view.segments.find((s) => s.id === view.landedId)?.label ?? ""}
          reward={
            view.segments.find((s) => s.id === view.landedId)?.reward ?? false
          }
          coverStyle={view.coverStyle}
        />
      );
    }
    if (view.kind === "lucky") {
      return (
        <LuckyBox
          visitsSinceWin={view.visitsSinceWin}
          pityCeiling={view.pityCeiling}
        />
      );
    }
    if (view.kind === "dots") {
      if (view.variant === "points") {
        return <PointsBar filled={view.filled} total={view.total} />;
      }
      return (
        <StampDots
          filled={view.filled}
          total={view.total}
          mark={resolveStampMark(view, vendorAvatarUrl)}
        />
      );
    }
    return null;
  }

  // Wheel now owns and renders its own win/lose result overlay directly on
  // the wheel (see wheel.tsx) — deriving "won" from a separately-threaded
  // lastChanceResult value that had to stay in sync with Wheel's own async,
  // now-variable-duration settle animation was a real synchronization bug
  // surface (two independently-updated sources of truth for the same
  // fact). PreviewCard still needs to know when the wheel has visually
  // settled, purely to gate the celebration burst below — CardBurst is a
  // shared component that lives at this level for every card type, not
  // something Wheel can render itself. Reset the moment a new spin starts
  // (`revealing` flips true); Wheel's `onSettled` flips it back.
  const [wheelSettled, setWheelSettled] = useState(true);
  useEffect(() => {
    if (isWheel && revealing) {
      // `revealing` starting is external input (a fresh tick beginning in
      // usePreviewAnimation), not derivable from existing render state —
      // same external-input-driven case already established elsewhere in
      // this file.
      setWheelSettled(false);
    }
  }, [revealing, isWheel]);

  const [showChanceResult, setShowChanceResult] = useState(false);
  useEffect(() => {
    if (!lastChanceResult) return;
    // lastChanceResult is external input (a new tick result from
    // usePreviewAnimation), not derivable from existing render state — same
    // external-input-driven case already established in preview-animation.ts
    // and program-card-status.tsx, so the render-time-derivation case
    // react-hooks/set-state-in-effect guards against doesn't apply here.
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
        {renderView()}
      </div>
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
      {/* Gated on wheelSettled for the same reason as the pill below — a
          wheel win's celebration must wait for the wheel to actually stop
          spinning, or the burst plays and fully finishes while the wheel is
          still visually spinning, making it look like it never happened. */}
      <CardBurst active={celebrating && (!isWheel || wheelSettled)} />
      {/* Wheel renders its own win/lose overlay directly on itself now
          (see wheel.tsx) — this corner pill is only for the other chance
          types that don't have an async settle animation to wait on. */}
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
