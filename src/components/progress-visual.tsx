"use client";

import type { ProgressView } from "@/lib/engine/types";
import { resolveStampMark } from "@/lib/stamp-mark";
import { Plant } from "./plant";
import { Cup } from "./cup";
import { FlameLayers } from "./flame-layers";
import { Wheel } from "./wheel";
import { ScratchCard } from "./scratch-card";
import { LuckyBox } from "./lucky-box";
import { PointsBar } from "./points-bar";
import { StampDots } from "./stamp-dots";

/** Pure mechanic visualization; card actions and animation orchestration stay with callers. */
export function ProgressVisual({
  view,
  plantSeed,
  vendorAvatarUrl = null,
  revealing,
  onWheelSettled,
}: {
  view: ProgressView | undefined;
  plantSeed?: string;
  vendorAvatarUrl?: string | null;
  revealing?: boolean;
  onWheelSettled?: () => void;
}) {
  if (!view) return null;
  switch (view.kind) {
    case "plant":
      return view.variant === "cup" ? (
        <Cup
          stage={view.stage}
          totalStages={view.totalStages}
          wilting={view.wilting}
        />
      ) : (
        <Plant
          stage={view.stage}
          totalStages={view.totalStages}
          wilting={view.wilting}
          seed={plantSeed}
        />
      );
    case "flame":
      return <FlameLayers stage={view.stage} />;
    case "chance": {
      if (view.variant === "wheel")
        return (
          <Wheel
            segments={view.segments}
            landedId={view.landedId}
            spinning={revealing}
            onSettled={onWheelSettled}
          />
        );
      const landed = view.segments.find(
        (segment) => segment.id === view.landedId,
      );
      return (
        <ScratchCard
          scratching={revealing}
          revealed={view.landedId !== null}
          label={landed?.label ?? ""}
          reward={landed?.reward ?? false}
          coverStyle={view.coverStyle}
        />
      );
    }
    case "lucky":
      return (
        <LuckyBox
          visitsSinceWin={view.visitsSinceWin}
          pityCeiling={view.pityCeiling}
        />
      );
    case "dots":
      return view.variant === "points" ? (
        <PointsBar filled={view.filled} total={view.total} />
      ) : (
        <StampDots
          filled={view.filled}
          total={view.total}
          mark={resolveStampMark(view, vendorAvatarUrl)}
          style={view.style}
          color={view.color}
        />
      );
  }
}
